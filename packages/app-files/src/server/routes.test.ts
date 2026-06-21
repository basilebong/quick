import { describe, expect, test } from "bun:test";
import type { Db, TenantVariables, ViewerVariables } from "@quick/core/server";
import { createTestDb } from "@quick/core/server/test";
import { parseAppId, parseAppSlug } from "@quick/core/shared";
import { Hono } from "hono";
import { MAX_FILE_BYTES } from "../shared/index.ts";
import { createFilesAppRoutes } from "./routes.ts";
import { createFilesService } from "./service.ts";

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
    .route("/_api/files", createFilesAppRoutes({ service: createFilesService(db) }));

describe("files /_api/files", () => {
  test("upload, list, serve, delete", async () => {
    const app = build(createTestDb(), "app_a");
    const up = await app.request("/_api/files?path=img/logo.txt", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "hello",
    });
    expect(up.status).toBe(201);

    expect((await (await app.request("/_api/files")).json()).files.length).toBe(1);

    const served = await app.request("/_api/files/img/logo.txt");
    expect(served.status).toBe(200);
    expect(await served.text()).toBe("hello");
    expect(served.headers.get("content-type")).toContain("text/plain");

    expect((await app.request("/_api/files/img/logo.txt", { method: "DELETE" })).status).toBe(200);
    expect((await app.request("/_api/files/img/logo.txt")).status).toBe(404);
  });

  test("files are scoped per app (cross-app isolation)", async () => {
    const db = createTestDb();
    const a = build(db, "app_a");
    const b = build(db, "app_b");
    await a.request("/_api/files?path=x.txt", { method: "POST", body: "a" });
    expect((await (await b.request("/_api/files")).json()).files).toEqual([]);
  });

  test("rejects a traversing path", async () => {
    const app = build(createTestDb(), "app_a");
    const res = await app.request("/_api/files?path=../escape.txt", { method: "POST", body: "x" });
    expect(res.status).toBe(400);
  });

  test("rejects an oversized upload (413) before buffering the whole body", async () => {
    const app = build(createTestDb(), "app_a");
    const res = await app.request("/_api/files?path=big.bin", {
      method: "POST",
      body: new Uint8Array(MAX_FILE_BYTES + 1),
    });
    expect(res.status).toBe(413);
  });
});
