import type { TenantVariables, ViewerVariables } from "@quick/core/server";
import { type AppId, type Result, parseAppId, parseAppRecordId } from "@quick/core/shared";
import { type Context, Hono } from "hono";
import { type AppRecord, type StoreError, storeErrorStatus } from "../shared/index.ts";
import type { StoreService } from "./service.ts";

type TenantCtx = { Variables: TenantVariables & ViewerVariables };

const appIdOf = (c: Context<TenantCtx>): AppId => {
  const t = c.var.tenant;
  if (t.kind !== "app") throw new Error("store routes mounted off a tenant host");
  return t.app.id;
};

const readJson = async (c: Context): Promise<{ ok: true; data: unknown } | { ok: false }> => {
  try {
    return { ok: true, data: await c.req.json() };
  } catch {
    return { ok: false };
  }
};

const respond = (c: Context, r: Result<AppRecord, StoreError>, okStatus: 200 | 201 = 200) =>
  r.kind === "ok"
    ? c.json({ record: r.value }, okStatus)
    : c.json(r.error, storeErrorStatus(r.error));

// Mounted at /_api/db on each tenant host, behind the share gate + origin check.
export const createStoreAppRoutes = (deps: { service: StoreService }) =>
  new Hono<TenantCtx>()
    .get("/:collection", async (c) => {
      const r = await deps.service.list(appIdOf(c), c.req.param("collection"));
      return r.kind === "ok"
        ? c.json({ records: r.value })
        : c.json(r.error, storeErrorStatus(r.error));
    })
    .post("/:collection", async (c) => {
      const body = await readJson(c);
      if (!body.ok) return c.json({ kind: "invalid_input", message: "invalid JSON body" }, 400);
      return respond(
        c,
        await deps.service.create(appIdOf(c), c.req.param("collection"), body.data),
        201,
      );
    })
    .get("/:collection/:id", async (c) => {
      const r = await deps.service.get(
        appIdOf(c),
        c.req.param("collection"),
        parseAppRecordId(c.req.param("id")),
      );
      return respond(c, r);
    })
    .put("/:collection/:id", async (c) => {
      const body = await readJson(c);
      if (!body.ok) return c.json({ kind: "invalid_input", message: "invalid JSON body" }, 400);
      return respond(
        c,
        await deps.service.replace(
          appIdOf(c),
          c.req.param("collection"),
          parseAppRecordId(c.req.param("id")),
          body.data,
        ),
      );
    })
    .patch("/:collection/:id", async (c) => {
      const body = await readJson(c);
      if (!body.ok) return c.json({ kind: "invalid_input", message: "invalid JSON body" }, 400);
      return respond(
        c,
        await deps.service.merge(
          appIdOf(c),
          c.req.param("collection"),
          parseAppRecordId(c.req.param("id")),
          body.data,
        ),
      );
    })
    .delete("/:collection/:id", async (c) => {
      const r = await deps.service.remove(
        appIdOf(c),
        c.req.param("collection"),
        parseAppRecordId(c.req.param("id")),
      );
      return r.kind === "ok"
        ? c.json({ id: r.value.id })
        : c.json(r.error, storeErrorStatus(r.error));
    });

// Mounted at /api/apps/:appId/records on the apex (owner-gated by composition).
export const createStoreAdminRoutes = (deps: { service: StoreService }) =>
  new Hono()
    .get("/", async (c) => {
      const records = await deps.service.listRecent(parseAppId(c.req.param("appId")), 200);
      return c.json({ records });
    })
    .delete("/:collection/:id", async (c) => {
      const r = await deps.service.remove(
        parseAppId(c.req.param("appId")),
        c.req.param("collection"),
        parseAppRecordId(c.req.param("id")),
      );
      return r.kind === "ok"
        ? c.json({ id: r.value.id })
        : c.json(r.error, storeErrorStatus(r.error));
    });

export type StoreAppRoutes = ReturnType<typeof createStoreAppRoutes>;
export type StoreAdminRoutes = ReturnType<typeof createStoreAdminRoutes>;
