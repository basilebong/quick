import type { Db } from "@quick/core/server";
import { and, desc, eq } from "@quick/core/server/drizzle";
import {
  type AppId,
  type AppRecordId,
  type Result,
  err,
  ok,
  parseAppRecordId,
} from "@quick/core/shared";
import { ulid } from "ulid";
import { type AppRecord, MAX_RECORD_BYTES, type StoreError, isValidCollection } from "../shared/index.ts";
import { appRecords } from "./schema.ts";
import { rowToRecord } from "./serialize.ts";

export type StoreService = {
  list(appId: AppId, collection: string): Promise<Result<AppRecord[], StoreError>>;
  listRecent(appId: AppId, limit: number): Promise<AppRecord[]>;
  create(appId: AppId, collection: string, data: unknown): Promise<Result<AppRecord, StoreError>>;
  get(appId: AppId, collection: string, id: AppRecordId): Promise<Result<AppRecord, StoreError>>;
  replace(
    appId: AppId,
    collection: string,
    id: AppRecordId,
    data: unknown,
  ): Promise<Result<AppRecord, StoreError>>;
  merge(
    appId: AppId,
    collection: string,
    id: AppRecordId,
    data: unknown,
  ): Promise<Result<AppRecord, StoreError>>;
  remove(
    appId: AppId,
    collection: string,
    id: AppRecordId,
  ): Promise<Result<{ id: AppRecordId }, StoreError>>;
};

const isPlainObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

const checkData = (data: unknown): StoreError | null => {
  let json: string | undefined;
  try {
    json = JSON.stringify(data);
  } catch {
    return { kind: "invalid_input", message: "data must be JSON-serializable" };
  }
  if (json === undefined) return { kind: "invalid_input", message: "data is required" };
  if (json.length > MAX_RECORD_BYTES) {
    return { kind: "too_large", message: `record exceeds ${MAX_RECORD_BYTES} bytes` };
  }
  return null;
};

const invalidCollection: StoreError = { kind: "invalid_input", message: "invalid collection name" };

export const createStoreService = (db: Db): StoreService => ({
  async list(appId, collection) {
    if (!isValidCollection(collection)) return err(invalidCollection);
    const rows = await db
      .select()
      .from(appRecords)
      .where(and(eq(appRecords.appId, appId), eq(appRecords.collection, collection)))
      .orderBy(desc(appRecords.createdAt));
    return ok(rows.map(rowToRecord));
  },

  async listRecent(appId, limit) {
    const rows = await db
      .select()
      .from(appRecords)
      .where(eq(appRecords.appId, appId))
      .orderBy(desc(appRecords.createdAt))
      .limit(limit);
    return rows.map(rowToRecord);
  },

  async create(appId, collection, data) {
    if (!isValidCollection(collection)) return err(invalidCollection);
    const bad = checkData(data);
    if (bad !== null) return err(bad);
    const now = new Date();
    const inserted = await db
      .insert(appRecords)
      .values({
        id: parseAppRecordId(ulid()),
        appId,
        collection,
        dataJson: JSON.stringify(data),
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    const row = inserted[0];
    if (row === undefined) return err({ kind: "not_found" });
    return ok(rowToRecord(row));
  },

  async get(appId, collection, id) {
    const rows = await db
      .select()
      .from(appRecords)
      .where(
        and(eq(appRecords.appId, appId), eq(appRecords.collection, collection), eq(appRecords.id, id)),
      )
      .limit(1);
    const row = rows[0];
    if (row === undefined) return err({ kind: "not_found" });
    return ok(rowToRecord(row));
  },

  async replace(appId, collection, id, data) {
    const bad = checkData(data);
    if (bad !== null) return err(bad);
    const updated = await db
      .update(appRecords)
      .set({ dataJson: JSON.stringify(data), updatedAt: new Date() })
      .where(
        and(eq(appRecords.appId, appId), eq(appRecords.collection, collection), eq(appRecords.id, id)),
      )
      .returning();
    const row = updated[0];
    if (row === undefined) return err({ kind: "not_found" });
    return ok(rowToRecord(row));
  },

  async merge(appId, collection, id, data) {
    if (!isPlainObject(data)) {
      return err({ kind: "invalid_input", message: "merge data must be a JSON object" });
    }
    const rows = await db
      .select()
      .from(appRecords)
      .where(
        and(eq(appRecords.appId, appId), eq(appRecords.collection, collection), eq(appRecords.id, id)),
      )
      .limit(1);
    const row = rows[0];
    if (row === undefined) return err({ kind: "not_found" });
    const existing = rowToRecord(row).data;
    const merged = { ...(isPlainObject(existing) ? existing : {}), ...data };
    const bad = checkData(merged);
    if (bad !== null) return err(bad);
    const updated = await db
      .update(appRecords)
      .set({ dataJson: JSON.stringify(merged), updatedAt: new Date() })
      .where(eq(appRecords.id, id))
      .returning();
    const urow = updated[0];
    if (urow === undefined) return err({ kind: "not_found" });
    return ok(rowToRecord(urow));
  },

  async remove(appId, collection, id) {
    const deleted = await db
      .delete(appRecords)
      .where(
        and(eq(appRecords.appId, appId), eq(appRecords.collection, collection), eq(appRecords.id, id)),
      )
      .returning({ id: appRecords.id });
    const row = deleted[0];
    if (row === undefined) return err({ kind: "not_found" });
    return ok({ id: parseAppRecordId(row.id) });
  },
});
