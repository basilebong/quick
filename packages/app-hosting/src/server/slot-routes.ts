import type { TenantVariables, ViewerVariables } from "@quick/core/server";
import { escapeHtml } from "@quick/core/server";
import { type AppId, parseAppId, parseUserId } from "@quick/core/shared";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { match } from "ts-pattern";
import { hostingErrorStatus, SLOT_MAX_BYTES } from "../shared/index.ts";
import type { OwnerVariables } from "./owner-auth.ts";
import type { SlotsService } from "./slots-service.ts";

type TenantCtx = { Variables: TenantVariables & ViewerVariables };
type AdminCtx = { Variables: OwnerVariables };

const appIdOf = (c: Context<TenantCtx>): AppId => {
  const t = c.var.tenant;
  if (t.kind !== "app") throw new Error("slot routes mounted off a tenant host");
  return t.app.id;
};

const filledHeaders = (contentType: string, checksum: string): HeadersInit => ({
  "content-type": contentType,
  etag: `"${checksum}"`,
  "cache-control": "private, max-age=0, must-revalidate",
  "x-content-type-options": "nosniff",
});

const placeholderHeaders: HeadersInit = {
  "content-type": "image/svg+xml; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

const placeholderSvg = (label: string): string => {
  const text = escapeHtml(label.trim() === "" ? "image" : label);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450" role="img" aria-label="${text}"><rect width="800" height="450" fill="#e5e7eb"/><text x="400" y="225" font-family="system-ui,-apple-system,sans-serif" font-size="28" fill="#6b7280" text-anchor="middle" dominant-baseline="middle">${text}</text></svg>`;
};

// Mounted at /_api/slots on each tenant host, behind the share gate + origin check.
// Serves owner-provided images the app references as <img src="/_api/slots/<key>">;
// a declared-but-unfilled slot returns a placeholder so the markup renders before a fill.
export const createSlotsAppRoutes = (deps: { service: SlotsService }) =>
  new Hono<TenantCtx>()
    .get("/", async (c) => c.json({ slots: await deps.service.listSlots(appIdOf(c)) }))
    .get("/:key", async (c) => {
      const read = await deps.service.readSlot(appIdOf(c), c.req.param("key"));
      return match(read)
        .with(
          { kind: "filled" },
          (r) =>
            new Response(new Uint8Array(r.bytes), {
              headers: filledHeaders(r.contentType, r.checksum),
            }),
        )
        .with(
          { kind: "placeholder" },
          (r) => new Response(placeholderSvg(r.label), { headers: placeholderHeaders }),
        )
        .with({ kind: "absent" }, () => c.notFound())
        .exhaustive();
    });

// Mounted at /api/apps/:appId/slots on the apex (owner-gated by composition). Fills
// and clears are owner-only; GET /:key serves the bytes for a dashboard preview.
export const createSlotsAdminRoutes = (deps: { service: SlotsService }) =>
  new Hono<AdminCtx>()
    .get("/", async (c) =>
      c.json({
        slots: await deps.service.listSlots(parseAppId(c.req.param("appId")), {
          includeInactive: true,
        }),
      }),
    )
    .put("/:key", bodyLimit({ maxSize: SLOT_MAX_BYTES }), async (c) => {
      const bytes = new Uint8Array(await c.req.arrayBuffer());
      const r = await deps.service.fillSlot(
        parseAppId(c.req.param("appId")),
        c.req.param("key"),
        bytes,
        parseUserId(c.var.user.id),
      );
      return r.kind === "ok"
        ? c.json({ slot: r.value }, 201)
        : c.json(r.error, hostingErrorStatus(r.error));
    })
    .get("/:key", async (c) => {
      const read = await deps.service.readSlot(
        parseAppId(c.req.param("appId")),
        c.req.param("key"),
      );
      return read.kind === "filled"
        ? new Response(new Uint8Array(read.bytes), {
            headers: filledHeaders(read.contentType, read.checksum),
          })
        : c.notFound();
    })
    .delete("/:key", async (c) => {
      const r = await deps.service.clearSlot(parseAppId(c.req.param("appId")), c.req.param("key"));
      return r.kind === "ok"
        ? c.json({ key: r.value.key })
        : c.json(r.error, hostingErrorStatus(r.error));
    });

export type SlotsAppRoutes = ReturnType<typeof createSlotsAppRoutes>;
export type SlotsAdminRoutes = ReturnType<typeof createSlotsAdminRoutes>;
