import type { Db } from "@quick/core/server";
import { and, count, desc, eq, sum } from "@quick/core/server/drizzle";
import {
  type AppId,
  type AppRecordId,
  err,
  ok,
  parseAppRecordId,
  type Result,
} from "@quick/core/shared";
import { ulid } from "ulid";
import {
  type AppRecord,
  isValidCollection,
  MAX_RECORD_BYTES,
  MAX_RECORDS_PER_APP,
  MAX_STORE_TOTAL_BYTES_PER_APP,
  type StoreError,
} from "../shared/index.ts";
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

type EncodedRecord = { json: string; sizeBytes: number };

const encodeData = (data: unknown): Result<EncodedRecord, StoreError> => {
  let json: string | undefined;
  try {
    json = JSON.stringify(data);
  } catch {
    return err({ kind: "invalid_input", message: "data must be JSON-serializable" });
  }
  if (json === undefined) return err({ kind: "invalid_input", message: "data is required" });
  const sizeBytes = Buffer.byteLength(json, "utf8");
  if (sizeBytes > MAX_RECORD_BYTES) {
    return err({ kind: "too_large", message: `record exceeds ${MAX_RECORD_BYTES} bytes` });
  }
  return ok({ json, sizeBytes });
};

const invalidCollection: StoreError = { kind: "invalid_input", message: "invalid collection name" };

export type StoreLimits = {
  maxRecordsPerApp?: number;
  maxTotalBytesPerApp?: number;
};

export const createStoreService = (db: Db, limits: StoreLimits = {}): StoreService => {
  const maxRecordsPerApp = limits.maxRecordsPerApp ?? MAX_RECORDS_PER_APP;
  const maxTotalBytesPerApp = limits.maxTotalBytesPerApp ?? MAX_STORE_TOTAL_BYTES_PER_APP;

  const overRecordCap: StoreError = {
    kind: "quota_exceeded",
    message: `app has reached its ${maxRecordsPerApp}-record limit`,
  };
  const overByteCap: StoreError = {
    kind: "quota_exceeded",
    message: `app has reached its ${maxTotalBytesPerApp}-byte record storage limit`,
  };

  const scopeOf = (appId: AppId, collection: string, id: AppRecordId) =>
    and(eq(appRecords.appId, appId), eq(appRecords.collection, collection), eq(appRecords.id, id));

  return {
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
      const encoded = encodeData(data);
      if (encoded.kind === "err") return encoded;
      const now = new Date();

      // Reading the quota and writing the row must be ONE atomic step. Split across an
      // `await`, concurrent writers each pass the check before any of them commits and
      // the app overshoots its cap by the number of writers in flight. bun:sqlite
      // transactions are synchronous, so nothing can interleave inside this callback.
      return db.transaction((tx) => {
        const counted = tx
          .select({ n: count() })
          .from(appRecords)
          .where(eq(appRecords.appId, appId))
          .all();
        if ((counted[0]?.n ?? 0) >= maxRecordsPerApp) return err(overRecordCap);

        const used = tx
          .select({ total: sum(appRecords.sizeBytes) })
          .from(appRecords)
          .where(eq(appRecords.appId, appId))
          .all();
        if (Number(used[0]?.total ?? 0) + encoded.value.sizeBytes > maxTotalBytesPerApp) {
          return err(overByteCap);
        }

        const inserted = tx
          .insert(appRecords)
          .values({
            id: parseAppRecordId(ulid()),
            appId,
            collection,
            dataJson: encoded.value.json,
            sizeBytes: encoded.value.sizeBytes,
            createdAt: now,
            updatedAt: now,
          })
          .returning()
          .all();
        const row = inserted[0];
        if (row === undefined) return err({ kind: "not_found" });
        return ok(rowToRecord(row));
      });
    },

    async get(appId, collection, id) {
      if (!isValidCollection(collection)) return err(invalidCollection);
      const rows = await db
        .select()
        .from(appRecords)
        .where(scopeOf(appId, collection, id))
        .limit(1);
      const row = rows[0];
      if (row === undefined) return err({ kind: "not_found" });
      return ok(rowToRecord(row));
    },

    async replace(appId, collection, id, data) {
      if (!isValidCollection(collection)) return err(invalidCollection);
      const encoded = encodeData(data);
      if (encoded.kind === "err") return encoded;

      return db.transaction((tx) => {
        const existing = tx
          .select({ sizeBytes: appRecords.sizeBytes })
          .from(appRecords)
          .where(scopeOf(appId, collection, id))
          .limit(1)
          .all();
        const before = existing[0];
        if (before === undefined) return err({ kind: "not_found" });

        const grown = encoded.value.sizeBytes - before.sizeBytes;
        if (grown > 0) {
          const used = tx
            .select({ total: sum(appRecords.sizeBytes) })
            .from(appRecords)
            .where(eq(appRecords.appId, appId))
            .all();
          if (Number(used[0]?.total ?? 0) + grown > maxTotalBytesPerApp) return err(overByteCap);
        }

        const updated = tx
          .update(appRecords)
          .set({
            dataJson: encoded.value.json,
            sizeBytes: encoded.value.sizeBytes,
            updatedAt: new Date(),
          })
          .where(scopeOf(appId, collection, id))
          .returning()
          .all();
        const row = updated[0];
        if (row === undefined) return err({ kind: "not_found" });
        return ok(rowToRecord(row));
      });
    },

    async merge(appId, collection, id, data) {
      if (!isValidCollection(collection)) return err(invalidCollection);
      if (!isPlainObject(data)) {
        return err({ kind: "invalid_input", message: "merge data must be a JSON object" });
      }

      return db.transaction((tx) => {
        const rows = tx
          .select()
          .from(appRecords)
          .where(scopeOf(appId, collection, id))
          .limit(1)
          .all();
        const row = rows[0];
        if (row === undefined) return err({ kind: "not_found" });
        const existing = rowToRecord(row).data;
        const merged = { ...(isPlainObject(existing) ? existing : {}), ...data };
        const encoded = encodeData(merged);
        if (encoded.kind === "err") return encoded;

        const grown = encoded.value.sizeBytes - row.sizeBytes;
        if (grown > 0) {
          const used = tx
            .select({ total: sum(appRecords.sizeBytes) })
            .from(appRecords)
            .where(eq(appRecords.appId, appId))
            .all();
          if (Number(used[0]?.total ?? 0) + grown > maxTotalBytesPerApp) return err(overByteCap);
        }

        const updated = tx
          .update(appRecords)
          .set({
            dataJson: encoded.value.json,
            sizeBytes: encoded.value.sizeBytes,
            updatedAt: new Date(),
          })
          .where(scopeOf(appId, collection, id))
          .returning()
          .all();
        const urow = updated[0];
        if (urow === undefined) return err({ kind: "not_found" });
        return ok(rowToRecord(urow));
      });
    },

    async remove(appId, collection, id) {
      if (!isValidCollection(collection)) return err(invalidCollection);
      const deleted = await db
        .delete(appRecords)
        .where(scopeOf(appId, collection, id))
        .returning({ id: appRecords.id });
      const row = deleted[0];
      if (row === undefined) return err({ kind: "not_found" });
      return ok({ id: parseAppRecordId(row.id) });
    },
  };
};
