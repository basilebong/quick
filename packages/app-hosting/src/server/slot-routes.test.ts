import { describe, expect, test } from "bun:test";
import type { Auth, Db, TenantVariables, ViewerVariables } from "@quick/core/server";
import { withTestAuth } from "@quick/core/server/test";
import { type AppId, parseAppId, parseAppSlug, parseUserId } from "@quick/core/shared";
import { Hono } from "hono";
import { SLOT_MAX_BYTES } from "../shared/index.ts";
import type { OwnerVariables } from "./owner-auth.ts";
import { createHostingService } from "./service.ts";
import { createSlotsAdminRoutes, createSlotsAppRoutes } from "./slot-routes.ts";
import { createSlotsService, type SlotsService } from "./slots-service.ts";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02]);
const NOT_IMAGE = new TextEncoder().encode("definitely not an image");

const seed = async (ctx: { auth: Auth; db: Db }) => {
  const authCtx = await ctx.auth.$context;
  const user = await authCtx.internalAdapter.createUser({ name: "Owner", email: "o@x.com" });
  const actor = parseUserId(user.id);
  const hosting = createHostingService(ctx.db, { appsDir: "/tmp/quick-slot-routes" });
  const created = await hosting.createApp({ slug: "acme", name: "Acme", shareMode: "link" }, actor);
  if (created.kind !== "ok") throw new Error("createApp failed");
  return {
    appId: parseAppId(created.value.id),
    userId: user.id,
    service: createSlotsService(ctx.db),
  };
};

const tenantApp = (service: SlotsService, appId: AppId) =>
  new Hono<{ Variables: TenantVariables & ViewerVariables }>()
    .use("*", (c, next) => {
      c.set("tenant", {
        kind: "app",
        app: {
          id: appId,
          slug: parseAppSlug("acme"),
          name: "Acme",
          shareMode: "link",
          currentDeploymentId: null,
          archived: false,
        },
      });
      c.set("viewer", { kind: "link", linkId: "l" });
      return next();
    })
    .route("/_api/slots", createSlotsAppRoutes({ service }));

const adminApp = (service: SlotsService, userId: string) =>
  new Hono<{ Variables: OwnerVariables }>()
    .use("*", (c, next) => {
      c.set("user", { id: userId, email: "o@x.com", name: "Owner" });
      return next();
    })
    .route("/api/apps/:appId/slots", createSlotsAdminRoutes({ service }));

describe("admin slot routes", () => {
  test("fill, list, preview, and clear a slot", async () => {
    await withTestAuth({}, async (ctx) => {
      const { appId, userId, service } = await seed(ctx);
      await service.declareSlots(appId, [{ key: "hero", label: "Hero" }]);
      const app = adminApp(service, userId);
      const base = `/api/apps/${appId}/slots`;

      const fill = await app.request(`${base}/hero`, {
        method: "PUT",
        headers: { "content-type": "image/png" },
        body: PNG,
      });
      expect(fill.status).toBe(201);
      expect((await fill.json()).slot.filled).toBe(true);

      const list = await (await app.request(base)).json();
      expect(list.slots.find((s: { key: string }) => s.key === "hero").filled).toBe(true);

      const preview = await app.request(`${base}/hero`);
      expect(preview.status).toBe(200);
      expect(preview.headers.get("content-type")).toBe("image/png");

      expect((await app.request(`${base}/hero`, { method: "DELETE" })).status).toBe(200);
      expect((await app.request(`${base}/hero`)).status).toBe(404);
    });
  });

  test("rejects an unknown slot (404), a non-image (415), and an oversized body (413)", async () => {
    await withTestAuth({}, async (ctx) => {
      const { appId, userId, service } = await seed(ctx);
      await service.declareSlots(appId, [{ key: "hero" }]);
      const app = adminApp(service, userId);
      const base = `/api/apps/${appId}/slots`;

      expect((await app.request(`${base}/ghost`, { method: "PUT", body: PNG })).status).toBe(404);
      expect((await app.request(`${base}/hero`, { method: "PUT", body: NOT_IMAGE })).status).toBe(
        415,
      );
      expect(
        (
          await app.request(`${base}/hero`, {
            method: "PUT",
            body: new Uint8Array(SLOT_MAX_BYTES + 1),
          })
        ).status,
      ).toBe(413);
    });
  });
});

describe("tenant slot serving", () => {
  test("serves filled bytes, a placeholder for empty, and 404 for unknown", async () => {
    await withTestAuth({}, async (ctx) => {
      const { appId, userId, service } = await seed(ctx);
      await service.declareSlots(appId, [{ key: "hero", label: "Hero" }, { key: "logo" }]);
      await service.fillSlot(appId, "hero", PNG, parseUserId(userId));
      const app = tenantApp(service, appId);

      const hero = await app.request("/_api/slots/hero");
      expect(hero.status).toBe(200);
      expect(hero.headers.get("content-type")).toBe("image/png");
      expect(hero.headers.get("x-content-type-options")).toBe("nosniff");
      expect(hero.headers.get("etag")).not.toBeNull();

      const logo = await app.request("/_api/slots/logo");
      expect(logo.status).toBe(200);
      expect(logo.headers.get("content-type")).toContain("image/svg+xml");
      expect(logo.headers.get("cache-control")).toBe("no-store");

      expect((await app.request("/_api/slots/ghost")).status).toBe(404);

      const list = await (await app.request("/_api/slots")).json();
      expect(list.slots.map((s: { key: string }) => s.key)).toEqual(["hero", "logo"]);
    });
  });
});
