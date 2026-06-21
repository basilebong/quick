import {
  parseAccessTokenId,
  parseAppId,
  parseDeploymentId,
  parseShareLinkId,
  parseUserId,
} from "@quick/core/shared";
import { type Context, Hono } from "hono";
import type * as v from "valibot";
import { safeParse } from "valibot";
import {
  CreateAppInputSchema,
  CreateLinkInputSchema,
  CreateTokenInputSchema,
  DeployInputSchema,
  type HostingError,
  UpdateAppInputSchema,
  hostingErrorStatus,
} from "../shared/index.ts";
import type { DeployFile } from "./deploy.ts";
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
const badBody = (c: Context) => c.json({ kind: "invalid_input", message: "invalid request body" }, 400);

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
    .post("/:appId/deployments", async (c) => {
      const body = await readBody(c, DeployInputSchema);
      if (!body.ok) return badBody(c);
      const files: DeployFile[] = body.value.files.map((f) => ({
        path: f.path,
        bytes: Buffer.from(f.content, "base64"),
      }));
      const r = await deps.service.createDeployment(
        parseAppId(c.req.param("appId")),
        files,
        actorOf(c),
      );
      return r.kind === "ok" ? c.json({ deployment: r.value }, 201) : fail(c, r.error);
    })
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
      const r = await deps.service.createLink(parseAppId(c.req.param("appId")), body.value, actorOf(c));
      return r.kind === "ok" ? c.json(r.value, 201) : fail(c, r.error);
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

// Mounted at /api/tokens on the apex, behind createOwnerAuth.
export const createTokenRoutes = (deps: { service: HostingService }) =>
  new Hono<Ctx>()
    .get("/", async (c) => c.json({ tokens: await deps.service.listTokens(actorOf(c)) }))
    .post("/", async (c) => {
      const body = await readBody(c, CreateTokenInputSchema);
      if (!body.ok) return badBody(c);
      const r = await deps.service.createToken(actorOf(c), body.value.label);
      return r.kind === "ok" ? c.json(r.value, 201) : fail(c, r.error);
    })
    .delete("/:tokenId", async (c) => {
      const r = await deps.service.revokeToken(actorOf(c), parseAccessTokenId(c.req.param("tokenId")));
      return r.kind === "ok" ? c.json({ id: r.value.id }) : fail(c, r.error);
    });

export type HostingRoutes = ReturnType<typeof createHostingRoutes>;
export type TokenRoutes = ReturnType<typeof createTokenRoutes>;
