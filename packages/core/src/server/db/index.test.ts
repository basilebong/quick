import { describe, expect, test } from "bun:test";
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
});
