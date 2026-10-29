import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { makeSignature } from "better-auth/crypto";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { parseAllowedEmails } from "../auth/allowlist.ts";
import { type Auth, createAuth } from "../auth/index.ts";
import { createDb, type Db } from "../db/index.ts";

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../drizzle");

export const GOOGLE_SIGN_IN = { method: "oauth", oauth: { providerId: "google" } } as const;

type WithTestAuthOptions = {
  allowedEmails?: string;
  baseURL?: string;
  seedAtMigration?: { tag: string; seed: (db: Db) => void };
};

const isJournal = (value: unknown): value is { entries: { tag: string }[] } =>
  typeof value === "object" &&
  value !== null &&
  "entries" in value &&
  Array.isArray(value.entries) &&
  value.entries.every(
    (e: unknown) => typeof e === "object" && e !== null && "tag" in e && typeof e.tag === "string",
  );

const migrationsUpTo = (tag: string): string => {
  const folder = mkdtempSync(join(tmpdir(), "quick-migrations-"));
  cpSync(migrationsFolder, folder, { recursive: true });
  const journalPath = join(folder, "meta", "_journal.json");
  const journal: unknown = JSON.parse(readFileSync(journalPath, "utf8"));
  if (!isJournal(journal)) throw new Error("unexpected drizzle journal shape");
  const end = journal.entries.findIndex((e) => e.tag === tag);
  if (end === -1) throw new Error(`no migration tagged ${tag}`);
  writeFileSync(
    journalPath,
    JSON.stringify({ ...journal, entries: journal.entries.slice(0, end + 1) }),
  );
  return folder;
};

type TestAuthContext = {
  auth: Auth;
  db: Db;
  signSessionCookie: (sessionToken: string) => Promise<string>;
};

export const withTestAuth = async <T>(
  options: WithTestAuthOptions,
  fn: (ctx: TestAuthContext) => Promise<T>,
): Promise<T> => {
  const db = createDb({ path: ":memory:" });
  if (options.seedAtMigration !== undefined) {
    migrate(db, { migrationsFolder: migrationsUpTo(options.seedAtMigration.tag) });
    options.seedAtMigration.seed(db);
  }
  migrate(db, { migrationsFolder });

  const secret = "test-secret-must-be-at-least-32-chars-long";
  const baseURL = options.baseURL ?? "http://localhost:5173";
  const auth = createAuth({
    db,
    baseURL,
    secret,
    google: { clientId: "test-google-id", clientSecret: "test-google-secret" },
    allowedEmails: parseAllowedEmails(options.allowedEmails),
    useSecureCookies: false,
    mcpResource: `${baseURL}/mcp`,
  });

  const signSessionCookie = async (sessionToken: string): Promise<string> =>
    `${sessionToken}.${await makeSignature(sessionToken, secret)}`;

  return fn({ auth, db, signSessionCookie });
};
