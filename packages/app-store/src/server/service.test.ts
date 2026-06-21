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
