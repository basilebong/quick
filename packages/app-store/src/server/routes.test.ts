import { describe, expect, test } from "bun:test";
import type { Db, TenantVariables, ViewerVariables } from "@quick/core/server";
import { createTestDb } from "@quick/core/server/test";
import { parseAppId, parseAppSlug } from "@quick/core/shared";
import { Hono } from "hono";
import { createStoreAppRoutes } from "./routes.ts";
import { createStoreService } from "./service.ts";

const tenant = (id: string) => ({
  kind: "app" as const,
  app: {
    id: parseAppId(id),
    slug: parseAppSlug("acme"),
    name: "Acme",
    shareMode: "link" as const,
    currentDeploymentId: null,
  },
});

const build = (db: Db, appId: string) =>
  new Hono<{ Variables: TenantVariables & ViewerVariables }>()
    .use("*", (c, next) => {
      c.set("tenant", tenant(appId));
      c.set("viewer", { kind: "link", linkId: "l" });
      return next();
    })
    .route("/_api/db", createStoreAppRoutes({ service: createStoreService(db) }));

const post = (app: ReturnType<typeof build>, path: string, body: unknown) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("store /_api/db", () => {
  test("create then read a record", async () => {
    const app = build(createTestDb(), "app_a");
    const created = await post(app, "/_api/db/notes", { hello: "world" });
    expect(created.status).toBe(201);
    const id = (await created.json()).record.id;
    const got = await app.request(`/_api/db/notes/${id}`);
    expect(got.status).toBe(200);
    expect((await got.json()).record.data).toEqual({ hello: "world" });
  });

  test("records are scoped per app (cross-app isolation)", async () => {
    const db = createTestDb();
    const a = build(db, "app_a");
    const b = build(db, "app_b");
    await post(a, "/_api/db/notes", { x: 1 });
    expect((await (await b.request("/_api/db/notes")).json()).records).toEqual([]);
    expect((await (await a.request("/_api/db/notes")).json()).records.length).toBe(1);
  });

  test("rejects an invalid collection name", async () => {
    const app = build(createTestDb(), "app_a");
    expect((await post(app, "/_api/db/Bad Name", { x: 1 })).status).toBe(400);
  });
});
