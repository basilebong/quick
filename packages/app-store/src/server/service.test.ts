import { beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "@quick/core/server";
import { eq } from "@quick/core/server/drizzle";
import { createTestDb } from "@quick/core/server/test";
import { type AppId, type AppRecordId, parseAppId } from "@quick/core/shared";
import { appRecords } from "./schema.ts";
import { createStoreService, type StoreService } from "./service.ts";

let db: Db;
let store: StoreService;
const APP_A: AppId = parseAppId("app_a");
const APP_B: AppId = parseAppId("app_b");

const storedSize = async (id: AppRecordId): Promise<number | undefined> => {
  const rows = await db
    .select({ sizeBytes: appRecords.sizeBytes, dataJson: appRecords.dataJson })
    .from(appRecords)
    .where(eq(appRecords.id, id));
  return rows[0]?.sizeBytes;
};

const storedJsonBytes = async (id: AppRecordId): Promise<number | undefined> => {
  const rows = await db
    .select({ dataJson: appRecords.dataJson })
    .from(appRecords)
    .where(eq(appRecords.id, id));
  const row = rows[0];
  return row === undefined ? undefined : Buffer.byteLength(row.dataJson, "utf8");
};

const storedRows = async (appId: AppId): Promise<{ count: number; bytes: number }> => {
  const rows = await db
    .select({ sizeBytes: appRecords.sizeBytes })
    .from(appRecords)
    .where(eq(appRecords.appId, appId));
  return { count: rows.length, bytes: rows.reduce((n, r) => n + r.sizeBytes, 0) };
};

beforeEach(() => {
  db = createTestDb();
  store = createStoreService(db);
});

describe("store service tenant scoping + validation", () => {
  test("merge stays scoped to (appId, collection, id) — no cross-tenant or cross-collection write", async () => {
    const created = await store.create(APP_A, "notes", { v: 1 });
    if (created.kind !== "ok") throw new Error("create failed");
    const id = created.value.id;

    expect((await store.merge(APP_B, "notes", id, { v: 2 })).kind).toBe("err");
    expect((await store.merge(APP_A, "other", id, { v: 3 })).kind).toBe("err");

    const got = await store.get(APP_A, "notes", id);
    expect(got.kind === "ok" && got.value.data).toEqual({ v: 1 });
  });

  test("an invalid collection is rejected on get/replace/merge/remove, not only create/list", async () => {
    const created = await store.create(APP_A, "notes", { v: 1 });
    if (created.kind !== "ok") throw new Error("create failed");
    const id = created.value.id;
    const bad = "Bad/Name";

    const get = await store.get(APP_A, bad, id);
    expect(get.kind === "err" && get.error.kind).toBe("invalid_input");
    const replace = await store.replace(APP_A, bad, id, { v: 2 });
    expect(replace.kind === "err" && replace.error.kind).toBe("invalid_input");
    const merge = await store.merge(APP_A, bad, id, { v: 2 });
    expect(merge.kind === "err" && merge.error.kind).toBe("invalid_input");
    const remove = await store.remove(APP_A, bad, id);
    expect(remove.kind === "err" && remove.error.kind).toBe("invalid_input");
  });
});

// Quota accounting sums the persisted `size_bytes`, so that column drifting from the
// JSON it describes would silently mis-bound an app's footprint.
describe("stored size_bytes tracks the record's UTF-8 byte length", () => {
  test("create stores the byte length of multibyte data, not its code-unit count", async () => {
    const created = await store.create(APP_A, "notes", { v: "中".repeat(100) });
    if (created.kind !== "ok") throw new Error("create failed");
    const size = await storedSize(created.value.id);
    expect(size).toBe(await storedJsonBytes(created.value.id));
    expect(size).toBeGreaterThan(300);
  });

  test("replace and merge keep size_bytes in step with the new body", async () => {
    const created = await store.create(APP_A, "notes", { v: "x" });
    if (created.kind !== "ok") throw new Error("create failed");
    const id = created.value.id;

    expect((await store.replace(APP_A, "notes", id, { v: "中".repeat(50) })).kind).toBe("ok");
    expect(await storedSize(id)).toBe(await storedJsonBytes(id));

    expect((await store.merge(APP_A, "notes", id, { w: "中".repeat(20) })).kind).toBe("ok");
    expect(await storedSize(id)).toBe(await storedJsonBytes(id));
  });
});

describe("store quotas and byte limits", () => {
  test("record size is measured in UTF-8 bytes, not UTF-16 code units", async () => {
    // 30k CJK chars: 30k UTF-16 code units (< 64Ki, so the old length check passed)
    // but 90k UTF-8 bytes (> the 64Ki ceiling), so it must be rejected.
    const data = { v: "中".repeat(30_000) };
    const json = JSON.stringify(data);
    expect(json.length).toBeLessThan(64 * 1024);
    expect(Buffer.byteLength(json, "utf8")).toBeGreaterThan(64 * 1024);

    const r = await store.create(APP_A, "notes", data);
    expect(r.kind === "err" && r.error.kind).toBe("too_large");
  });

  test("per-app record count is capped (counting across all collections)", async () => {
    const capped = createStoreService(db, { maxRecordsPerApp: 2 });
    expect((await capped.create(APP_A, "a", { v: 1 })).kind).toBe("ok");
    expect((await capped.create(APP_A, "b", { v: 2 })).kind).toBe("ok");
    const third = await capped.create(APP_A, "a", { v: 3 });
    expect(third.kind === "err" && third.error.kind).toBe("quota_exceeded");
    // The cap is per-app: a different app is unaffected.
    expect((await capped.create(APP_B, "a", { v: 1 })).kind).toBe("ok");
  });

  test("per-app record bytes are capped, counting the net delta on replace and merge", async () => {
    const capped = createStoreService(db, { maxTotalBytesPerApp: 300 });
    const filler = (n: number) => ({ v: "x".repeat(n) });

    const first = await capped.create(APP_A, "notes", filler(200));
    expect(first.kind).toBe("ok");
    if (first.kind !== "ok") throw new Error("create failed");

    const second = await capped.create(APP_A, "notes", filler(200));
    expect(second.kind === "err" && second.error.kind).toBe("quota_exceeded");

    // Replace shrinks then grows the SAME record: the delta, not the full size, is
    // what counts — otherwise a 200-byte record could never be rewritten at all.
    expect((await capped.replace(APP_A, "notes", first.value.id, filler(250))).kind).toBe("ok");
    const tooBig = await capped.replace(APP_A, "notes", first.value.id, filler(400));
    expect(tooBig.kind === "err" && tooBig.error.kind).toBe("quota_exceeded");

    const merged = await capped.merge(APP_A, "notes", first.value.id, filler(400));
    expect(merged.kind === "err" && merged.error.kind).toBe("quota_exceeded");

    // The cap is per-app: a different app is unaffected.
    expect((await capped.create(APP_B, "notes", filler(200))).kind).toBe("ok");
  });
});

// A quota read followed by an awaited write is a check-then-act across a yield point:
// concurrent writers all pass the check before any of them commits, and the app lands
// over its cap. The whole point of the cap is that a leaked share link cannot do this.
describe("quotas hold under concurrent writes", () => {
  const CAP = 10_000;
  const filler = (n: number) => ({ v: "x".repeat(n) });

  test("50 concurrent creates cannot overshoot the byte cap", async () => {
    const capped = createStoreService(db, { maxTotalBytesPerApp: CAP });
    await Promise.all(Array.from({ length: 50 }, () => capped.create(APP_A, "notes", filler(900))));
    expect((await storedRows(APP_A)).bytes).toBeLessThanOrEqual(CAP);
  });

  test("50 concurrent creates cannot overshoot the record cap", async () => {
    const capped = createStoreService(db, { maxRecordsPerApp: 5 });
    await Promise.all(Array.from({ length: 50 }, (_, i) => capped.create(APP_A, "notes", { i })));
    expect((await storedRows(APP_A)).count).toBe(5);
  });

  test("concurrent replaces of different records cannot overshoot the byte cap", async () => {
    const capped = createStoreService(db, { maxTotalBytesPerApp: CAP });
    const ids: AppRecordId[] = [];
    for (let i = 0; i < 10; i++) {
      const created = await capped.create(APP_A, "notes", filler(1));
      if (created.kind !== "ok") throw new Error("create failed");
      ids.push(created.value.id);
    }
    await Promise.all(ids.map((id) => capped.replace(APP_A, "notes", id, filler(2_000))));
    expect((await storedRows(APP_A)).bytes).toBeLessThanOrEqual(CAP);
  });
});
