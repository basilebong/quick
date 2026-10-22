import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { createDb } from "./index.ts";

describe("createDb", () => {
  test("opens an in-memory sqlite and accepts DDL", () => {
    const db = createDb({ path: ":memory:" });
    expect(() => {
      db.run(sql`CREATE TABLE t (id INTEGER PRIMARY KEY)`);
      db.run(sql`INSERT INTO t (id) VALUES (1)`);
    }).not.toThrow();
  });

  test("enforces foreign_keys PRAGMA", () => {
    const db = createDb({ path: ":memory:" });
    db.run(sql`CREATE TABLE parent (id INTEGER PRIMARY KEY)`);
    db.run(
      sql`CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id))`,
    );
    expect(() => db.run(sql`INSERT INTO child (id, parent_id) VALUES (1, 999)`)).toThrow();
  });

  test("two in-memory dbs are isolated", () => {
    const a = createDb({ path: ":memory:" });
    const b = createDb({ path: ":memory:" });
    a.run(sql`CREATE TABLE t (id INTEGER PRIMARY KEY)`);
    a.run(sql`INSERT INTO t (id) VALUES (1)`);
    expect(() => b.run(sql`SELECT id FROM t`)).toThrow();
  });

  test("deleted rows and dropped columns leave no residue in the database file", () => {
    const dir = mkdtempSync(join(tmpdir(), "quick-db-"));
    const path = join(dir, "app.db");
    try {
      const db = createDb({ path });
      const marker = "residue-marker-6f1c";
      db.run(sql`CREATE TABLE t (id INTEGER PRIMARY KEY, kept TEXT, dropped TEXT)`);
      for (let i = 0; i < 200; i++) {
        db.run(
          sql`INSERT INTO t (id, kept, dropped) VALUES (${i}, ${`${marker}-row`}, ${`${marker}-col`})`,
        );
      }
      db.run(sql`ALTER TABLE t DROP COLUMN dropped`);
      db.run(sql`DELETE FROM t`);
      db.$client.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      db.$client.close();

      expect(readFileSync(path).includes(marker)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
