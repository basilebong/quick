import { IDEMPOTENCY_SKIP_HEADER } from "@quick/core/server";
import { parseAppId, parseDeploymentId, parseShareLinkId, parseUserId } from "@quick/core/shared";
import { type Context, Hono } from "hono";
import type * as v from "valibot";
import { safeParse } from "valibot";
import {
  CreateAppInputSchema,
  CreateLinkInputSchema,
  type HostingError,
  UpdateAppInputSchema,
  hostingErrorStatus,
} from "../shared/index.ts";
import type { OwnerVariables } from "./owner-auth.ts";
import type { HostingService } from "./service.ts";

type Ctx = { Variables: OwnerVariables };

const readBody = async <S extends v.GenericSchema>(
  c: Context,
  schema: S,
): Promise<{ ok: true; value: v.InferOutput<S> } | { ok: false }> => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return { ok: false };
  }
  const parsed = safeParse(schema, raw);
  return parsed.success ? { ok: true, value: parsed.output } : { ok: false };
};

const actorOf = (c: Context<Ctx>) => parseUserId(c.var.user.id);
const fail = (c: Context, e: HostingError) => c.json(e, hostingErrorStatus(e));
const badBody = (c: Context) =>
  c.json({ kind: "invalid_input", message: "invalid request body" }, 400);

// 201 for a body that contains a one-time plaintext secret (a share-link token).
// The skip header keeps the idempotency middleware from persisting the secret at
// rest; it is stripped before the response leaves.
const createdSecret = (c: Context, value: unknown) => {
  c.header(IDEMPOTENCY_SKIP_HEADER, "1");
  return c.json(value, 201);
};

// Mounted at /api/apps on the apex, behind createOwnerAuth.
export const createHostingRoutes = (deps: { service: HostingService }) =>
  new Hono<Ctx>()
    .get("/", async (c) => c.json({ apps: await deps.service.listApps() }))
    .post("/", async (c) => {
      const body = await readBody(c, CreateAppInputSchema);
      if (!body.ok) return badBody(c);
      const r = await deps.service.createApp(body.value, actorOf(c));
      return r.kind === "ok" ? c.json({ app: r.value }, 201) : fail(c, r.error);
    })
    .get("/:appId", async (c) => {
      const r = await deps.service.getApp(parseAppId(c.req.param("appId")));
      return r.kind === "ok" ? c.json({ app: r.value }) : fail(c, r.error);
    })
    .patch("/:appId", async (c) => {
      const body = await readBody(c, UpdateAppInputSchema);
      if (!body.ok) return badBody(c);
      const r = await deps.service.updateApp(parseAppId(c.req.param("appId")), body.value);
      return r.kind === "ok" ? c.json({ app: r.value }) : fail(c, r.error);
    })
    .delete("/:appId", async (c) => {
      const r = await deps.service.deleteApp(parseAppId(c.req.param("appId")));
      return r.kind === "ok" ? c.json({ id: r.value.id }) : fail(c, r.error);
    })
    .get("/:appId/deployments", async (c) =>
      c.json({ deployments: await deps.service.listDeployments(parseAppId(c.req.param("appId"))) }),
    )
    .post("/:appId/deployments/:depId/activate", async (c) => {
      const r = await deps.service.activateDeployment(
        parseAppId(c.req.param("appId")),
        parseDeploymentId(c.req.param("depId")),
      );
      return r.kind === "ok" ? c.json({ deployment: r.value }) : fail(c, r.error);
    })
    .get("/:appId/links", async (c) =>
      c.json({ links: await deps.service.listLinks(parseAppId(c.req.param("appId"))) }),
    )
    .post("/:appId/links", async (c) => {
      const body = await readBody(c, CreateLinkInputSchema);
      if (!body.ok) return badBody(c);
      const r = await deps.service.createLink(
        parseAppId(c.req.param("appId")),
        body.value,
        actorOf(c),
      );
      return r.kind === "ok" ? createdSecret(c, r.value) : fail(c, r.error);
    })
    .delete("/:appId/links/:linkId", async (c) => {
      const r = await deps.service.revokeLink(
        parseAppId(c.req.param("appId")),
        parseShareLinkId(c.req.param("linkId")),
      );
      return r.kind === "ok" ? c.json({ id: r.value.id }) : fail(c, r.error);
    })
    .get("/:appId/access-log", async (c) =>
      c.json({ entries: await deps.service.listAccessLog(parseAppId(c.req.param("appId")), 200) }),
    );

export type HostingRoutes = ReturnType<typeof createHostingRoutes>;
