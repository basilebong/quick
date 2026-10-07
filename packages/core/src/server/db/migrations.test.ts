import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as v from "valibot";
import { createDb, type Db } from "./index.ts";

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../drizzle");

const JournalSchema = v.looseObject({
  entries: v.array(v.looseObject({ idx: v.number(), tag: v.string() })),
});

const migrationsUpTo = (dir: string, lastIdx: number): void => {
  const journal = v.parse(
    JournalSchema,
    JSON.parse(readFileSync(join(migrationsFolder, "meta/_journal.json"), "utf8")),
  );
  const entries = journal.entries.filter((e) => e.idx <= lastIdx);
  mkdirSync(join(dir, "meta"));
  writeFileSync(join(dir, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
  for (const { tag } of entries)
    copyFileSync(join(migrationsFolder, `${tag}.sql`), join(dir, `${tag}.sql`));
};

const count = (db: Db, table: string): number =>
  db.$client.query<{ n: number }, []>(`SELECT count(*) AS n FROM ${table}`).get()?.n ?? -1;

const row = (db: Db, query: string): Record<string, unknown> | null =>
  db.$client.query<Record<string, unknown>, []>(query).get();

describe("migration 0007: better-auth oauth columns become NOT NULL", () => {
  let dir: string;
  let db: Db;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "quick-migrations-"));
    migrationsUpTo(dir, 6);
    db = createDb({ path: ":memory:" });
    migrate(db, { migrationsFolder: dir });
    db.$client.exec(`
      INSERT INTO users (id, name, email, email_verified, created_at, updated_at)
        VALUES ('u1', 'U', 'u@example.com', 1, 1, 1);
      INSERT INTO sessions (id, expires_at, token, created_at, updated_at, user_id)
        VALUES ('s1', 9, 'sess', 1, 1, 'u1');
      INSERT INTO oauth_clients (id, client_id, redirect_uris) VALUES ('c1', 'client', '[]');
      INSERT INTO oauth_refresh_tokens (id, token, client_id, session_id, user_id, expires_at, created_at, scopes)
        VALUES ('r1', 'rt', 'client', 's1', 'u1', 5000, 1000, '[]'),
               ('r-legacy', 'rt-legacy', 'client', NULL, 'u1', NULL, NULL, '[]');
      INSERT INTO oauth_access_tokens (id, token, client_id, session_id, user_id, refresh_id, expires_at, created_at, scopes)
        VALUES ('a1', 'at', 'client', 's1', 'u1', 'r1', 5000, 1000, '[]'),
               ('a-no-expiry', 'at-legacy', 'client', NULL, 'u1', NULL, NULL, NULL, '[]'),
               ('a-no-token', NULL, 'client', NULL, 'u1', NULL, 5000, 1000, '[]');
      INSERT INTO oauth_consents (id, client_id, user_id, scopes, created_at, updated_at)
        VALUES ('k1', 'client', 'u1', '[]', 1000, 2000),
               ('k-legacy', 'client', 'u1', '[]', NULL, 3000);
    `);
    migrate(db, { migrationsFolder });
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test("keeps access tokens that reference a refresh token", () => {
    expect(
      row(db, "SELECT refresh_id, expires_at FROM oauth_access_tokens WHERE id = 'a1'"),
    ).toEqual({ refresh_id: "r1", expires_at: 5000 });
    expect(count(db, "oauth_refresh_tokens")).toBe(2);
    expect(count(db, "oauth_consents")).toBe(2);
  });

  test("fails closed on legacy NULL expiry: the token is kept but already expired", () => {
    expect(
      row(db, "SELECT expires_at, created_at FROM oauth_refresh_tokens WHERE id = 'r-legacy'"),
    ).toEqual({ expires_at: 0, created_at: 0 });
    expect(
      row(db, "SELECT expires_at, created_at FROM oauth_access_tokens WHERE id = 'a-no-expiry'"),
    ).toEqual({ expires_at: 0, created_at: 0 });
  });

  test("drops access tokens with no token value, which can never be presented", () => {
    expect(row(db, "SELECT id FROM oauth_access_tokens WHERE id = 'a-no-token'")).toBeNull();
    expect(count(db, "oauth_access_tokens")).toBe(2);
  });

  test("backfills a legacy consent timestamp from its sibling", () => {
    expect(
      row(db, "SELECT created_at, updated_at FROM oauth_consents WHERE id = 'k-legacy'"),
    ).toEqual({ created_at: 3000, updated_at: 3000 });
  });

  test("leaves no dangling foreign keys or scratch tables", () => {
    expect(db.$client.query("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(
      db.$client
        .query("SELECT name FROM sqlite_master WHERE name LIKE '%backup%' OR name LIKE '__new_%'")
        .all(),
    ).toEqual([]);
  });

  test("rejects NULL in the tightened columns afterwards", () => {
    expect(() =>
      db.$client.exec(
        "INSERT INTO oauth_consents (id, client_id, user_id, scopes, created_at, updated_at) VALUES ('k2', 'client', 'u1', '[]', NULL, 1)",
      ),
    ).toThrow(/NOT NULL/);
  });
});
