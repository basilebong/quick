import { beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "@quick/core/server";
import { createTestDb } from "@quick/core/server/test";
import { type AppId, parseAppId } from "@quick/core/shared";
import { type StoreService, createStoreService } from "./service.ts";

let db: Db;
let store: StoreService;
const APP_A: AppId = parseAppId("app_a");
const APP_B: AppId = parseAppId("app_b");

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

  test("list returns at most listLimit records (most recent first)", async () => {
    const capped = createStoreService(db, { listLimit: 2 });
    for (let i = 0; i < 3; i++) await capped.create(APP_A, "notes", { i });
    const listed = await capped.list(APP_A, "notes");
    expect(listed.kind === "ok" && listed.value.length).toBe(2);
  });
});
