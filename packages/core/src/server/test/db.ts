import { resolve } from "node:path";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { type Db, createDb } from "../db/index.ts";

const migrationsFolder = resolve(import.meta.dir, "../../../../../drizzle");

// An in-memory db with all migrations applied — for service/route tests across packages.
export const createTestDb = (): Db => {
  const db = createDb({ path: ":memory:" });
  migrate(db, { migrationsFolder });
  return db;
};
