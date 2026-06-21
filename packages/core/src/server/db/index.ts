import { Database } from "bun:sqlite";
import { type BunSQLiteDatabase, drizzle } from "drizzle-orm/bun-sqlite";

export type Db = BunSQLiteDatabase & { $client: Database };

const applyPragmas = (sqlite: Database): void => {
  sqlite.exec("PRAGMA journal_mode = WAL");
  sqlite.exec("PRAGMA synchronous = NORMAL");
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.exec("PRAGMA busy_timeout = 5000");
};

export const createDb = (opts: { path: string }): Db => {
  const sqlite = new Database(opts.path);
  applyPragmas(sqlite);
  return drizzle({ client: sqlite });
};
