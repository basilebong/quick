import type { TenantVariables, ViewerVariables } from "@quick/core/server";
import { type AppId, parseAppId, parseUserId } from "@quick/core/shared";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { MAX_FILE_BYTES, filesErrorStatus } from "../shared/index.ts";
import type { FilesService } from "./service.ts";

type TenantCtx = { Variables: TenantVariables & ViewerVariables };

const appIdOf = (c: Context<TenantCtx>): AppId => {
  const t = c.var.tenant;
  if (t.kind !== "app") throw new Error("files routes mounted off a tenant host");
  return t.app.id;
};

const serveHeaders = (contentType: string, checksum: string): HeadersInit => ({
  "content-type": contentType,
  etag: `"${checksum}"`,
  "cache-control": "private, max-age=0, must-revalidate",
  "x-content-type-options": "nosniff",
});

// Mounted at /_api/files on each tenant host, behind the share gate + origin check.
export const createFilesAppRoutes = (deps: { service: FilesService }) =>
  new Hono<TenantCtx>()
    .get("/", async (c) => {
      const files = await deps.service.list(appIdOf(c), c.req.query("prefix"));
      return c.json({ files });
    })
    .post("/", bodyLimit({ maxSize: MAX_FILE_BYTES }), async (c) => {
      const path = c.req.query("path");
      if (path === undefined || path === "") {
        return c.json({ kind: "invalid_input", message: "a ?path= query param is required" }, 400);
      }
      const bytes = new Uint8Array(await c.req.arrayBuffer());
      const viewer = c.var.viewer;
      const by = viewer.kind === "user" ? parseUserId(viewer.userId) : null;
      const r = await deps.service.put(
        appIdOf(c),
        path,
        c.req.header("content-type") ?? "application/octet-stream",
        bytes,
        by,
      );
      return r.kind === "ok"
        ? c.json({ file: r.value }, 201)
        : c.json(r.error, filesErrorStatus(r.error));
    })
    .get("/:filepath{.+}", async (c) => {
      const r = await deps.service.get(appIdOf(c), c.req.param("filepath"));
      if (r.kind === "err") return c.json(r.error, filesErrorStatus(r.error));
      return new Response(r.value.bytes, {
        headers: serveHeaders(r.value.meta.contentType, r.value.meta.checksum),
      });
    })
    .delete("/:filepath{.+}", async (c) => {
      const r = await deps.service.remove(appIdOf(c), c.req.param("filepath"));
      return r.kind === "ok"
        ? c.json({ path: r.value.path })
        : c.json(r.error, filesErrorStatus(r.error));
    });

// Mounted at /api/apps/:appId/files on the apex (owner-gated by composition).
export const createFilesAdminRoutes = (deps: { service: FilesService }) =>
  new Hono()
    .get("/", async (c) => {
      const files = await deps.service.list(
        parseAppId(c.req.param("appId")),
        c.req.query("prefix"),
      );
      return c.json({ files });
    })
    .delete("/:filepath{.+}", async (c) => {
      const r = await deps.service.remove(
        parseAppId(c.req.param("appId")),
        c.req.param("filepath"),
      );
      return r.kind === "ok"
        ? c.json({ path: r.value.path })
        : c.json(r.error, filesErrorStatus(r.error));
    });

export type FilesAppRoutes = ReturnType<typeof createFilesAppRoutes>;
export type FilesAdminRoutes = ReturnType<typeof createFilesAdminRoutes>;
