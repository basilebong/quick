import type { Db } from "@quick/core/server";
import { and, count, desc, eq, lt, sql } from "@quick/core/server/drizzle";
import {
  type AppId,
  type AppRecordId,
  type Result,
  err,
  ok,
  parseAppRecordId,
} from "@quick/core/shared";
import { monotonicFactory } from "ulid";
import {
  type AppRecord,
  LIST_LIMIT,
  MAX_RECORDS_PER_APP,
  MAX_RECORD_BYTES,
  MAX_STORE_TOTAL_BYTES_PER_APP,
  type RecordPage,
  type StoreError,
  isValidCollection,
} from "../shared/index.ts";
import { appRecords } from "./schema.ts";
import { rowToRecord } from "./serialize.ts";

export type ListOptions = { limit?: number; before?: AppRecordId };

export type StoreService = {
  list(
    appId: AppId,
    collection: string,
    opts?: ListOptions,
  ): Promise<Result<RecordPage, StoreError>>;
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

// `list` orders by id and pages with an id cursor, so ids must be a strict, ascending
// creation order. A plain ulid() is only time-ordered to the millisecond — its random
// suffix scrambles records minted in the same tick — while the monotonic factory
// increments that suffix instead. Same total order, but now it matches insertion.
const recordUlid = monotonicFactory();

const isPlainObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

const encodeData = (data: unknown): Result<string, StoreError> => {
  let json: string | undefined;
  try {
    json = JSON.stringify(data);
  } catch {
    return err({ kind: "invalid_input", message: "data must be JSON-serializable" });
  }
  if (json === undefined) return err({ kind: "invalid_input", message: "data is required" });
  if (Buffer.byteLength(json, "utf8") > MAX_RECORD_BYTES) {
    return err({ kind: "too_large", message: `record exceeds ${MAX_RECORD_BYTES} bytes` });
  }
  return ok(json);
};

const invalidCollection: StoreError = { kind: "invalid_input", message: "invalid collection name" };

export type StoreLimits = {
  maxRecordsPerApp?: number;
  maxTotalBytesPerApp?: number;
  listLimit?: number;
};

export const createStoreService = (db: Db, limits: StoreLimits = {}): StoreService => {
  const maxRecordsPerApp = limits.maxRecordsPerApp ?? MAX_RECORDS_PER_APP;
  const maxTotalBytesPerApp = limits.maxTotalBytesPerApp ?? MAX_STORE_TOTAL_BYTES_PER_APP;
  const listLimit = limits.listLimit ?? LIST_LIMIT;

  // SQLite `length()` on TEXT counts characters; casting to BLOB first counts the
  // UTF-8 bytes actually on disk, matching how a record is measured on the way in.
  const usedBytes = async (appId: AppId): Promise<number> => {
    const rows = await db
      .select({
        total: sql<number>`coalesce(sum(length(cast(${appRecords.dataJson} as blob))), 0)`,
      })
      .from(appRecords)
      .where(eq(appRecords.appId, appId));
    return Number(rows[0]?.total ?? 0);
  };

  const overByteQuota = async (appId: AppId, delta: number): Promise<StoreError | null> => {
    if (delta <= 0) return null;
    if ((await usedBytes(appId)) + delta <= maxTotalBytesPerApp) return null;
    return {
      kind: "quota_exceeded",
      message: `app has reached its ${maxTotalBytesPerApp}-byte record storage limit`,
    };
  };

  return {
    async list(appId, collection, opts = {}) {
      if (!isValidCollection(collection)) return err(invalidCollection);
      const limit = Math.min(Math.max(opts.limit ?? listLimit, 1), listLimit);
      const scope = and(eq(appRecords.appId, appId), eq(appRecords.collection, collection));
      // Ordered by id, not createdAt: ids are monotonic ULIDs, so they are both
      // creation-ordered and unique — and a cursor needs a STRICT order, which a
      // ms-resolution `createdAt` is not (it ties, so a page boundary landing inside
      // a tie would skip or repeat rows).
      const rows = await db
        .select()
        .from(appRecords)
        .where(opts.before === undefined ? scope : and(scope, lt(appRecords.id, opts.before)))
        .orderBy(desc(appRecords.id))
        .limit(limit + 1);
      return ok({
        records: rows.slice(0, limit).map(rowToRecord),
        truncated: rows.length > limit,
      });
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
      const counted = await db
        .select({ n: count() })
        .from(appRecords)
        .where(eq(appRecords.appId, appId));
      if ((counted[0]?.n ?? 0) >= maxRecordsPerApp) {
        return err({
          kind: "quota_exceeded",
          message: `app has reached its ${maxRecordsPerApp}-record limit`,
        });
      }
      const overQuota = await overByteQuota(appId, Buffer.byteLength(encoded.value, "utf8"));
      if (overQuota !== null) return err(overQuota);
      const now = new Date();
      const inserted = await db
        .insert(appRecords)
        .values({
          id: parseAppRecordId(recordUlid()),
          appId,
          collection,
          dataJson: encoded.value,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      const row = inserted[0];
      if (row === undefined) return err({ kind: "not_found" });
      return ok(rowToRecord(row));
    },

    async get(appId, collection, id) {
      if (!isValidCollection(collection)) return err(invalidCollection);
      const rows = await db
        .select()
        .from(appRecords)
        .where(
          and(
            eq(appRecords.appId, appId),
            eq(appRecords.collection, collection),
            eq(appRecords.id, id),
          ),
        )
        .limit(1);
      const row = rows[0];
      if (row === undefined) return err({ kind: "not_found" });
      return ok(rowToRecord(row));
    },

    async replace(appId, collection, id, data) {
      if (!isValidCollection(collection)) return err(invalidCollection);
      const encoded = encodeData(data);
      if (encoded.kind === "err") return encoded;
      const existing = await db
        .select({ dataJson: appRecords.dataJson })
        .from(appRecords)
        .where(
          and(
            eq(appRecords.appId, appId),
            eq(appRecords.collection, collection),
            eq(appRecords.id, id),
          ),
        )
        .limit(1);
      const before = existing[0];
      if (before === undefined) return err({ kind: "not_found" });
      const overQuota = await overByteQuota(
        appId,
        Buffer.byteLength(encoded.value, "utf8") - Buffer.byteLength(before.dataJson, "utf8"),
      );
      if (overQuota !== null) return err(overQuota);
      const updated = await db
        .update(appRecords)
        .set({ dataJson: encoded.value, updatedAt: new Date() })
        .where(
          and(
            eq(appRecords.appId, appId),
            eq(appRecords.collection, collection),
            eq(appRecords.id, id),
          ),
        )
        .returning();
      const row = updated[0];
      if (row === undefined) return err({ kind: "not_found" });
      return ok(rowToRecord(row));
    },

    async merge(appId, collection, id, data) {
      if (!isValidCollection(collection)) return err(invalidCollection);
      if (!isPlainObject(data)) {
        return err({ kind: "invalid_input", message: "merge data must be a JSON object" });
      }
      const rows = await db
        .select()
        .from(appRecords)
        .where(
          and(
            eq(appRecords.appId, appId),
            eq(appRecords.collection, collection),
            eq(appRecords.id, id),
          ),
        )
        .limit(1);
      const row = rows[0];
      if (row === undefined) return err({ kind: "not_found" });
      const existing = rowToRecord(row).data;
      const merged = { ...(isPlainObject(existing) ? existing : {}), ...data };
      const encoded = encodeData(merged);
      if (encoded.kind === "err") return encoded;
      const overQuota = await overByteQuota(
        appId,
        Buffer.byteLength(encoded.value, "utf8") - Buffer.byteLength(row.dataJson, "utf8"),
      );
      if (overQuota !== null) return err(overQuota);
      const updated = await db
        .update(appRecords)
        .set({ dataJson: encoded.value, updatedAt: new Date() })
        .where(
          and(
            eq(appRecords.appId, appId),
            eq(appRecords.collection, collection),
            eq(appRecords.id, id),
          ),
        )
        .returning();
      const urow = updated[0];
      if (urow === undefined) return err({ kind: "not_found" });
      return ok(rowToRecord(urow));
    },

    async remove(appId, collection, id) {
      if (!isValidCollection(collection)) return err(invalidCollection);
      const deleted = await db
        .delete(appRecords)
        .where(
          and(
            eq(appRecords.appId, appId),
            eq(appRecords.collection, collection),
            eq(appRecords.id, id),
          ),
        )
        .returning({ id: appRecords.id });
      const row = deleted[0];
      if (row === undefined) return err({ kind: "not_found" });
      return ok({ id: parseAppRecordId(row.id) });
    },
  };
};
