import {
  type FilesService,
  createFilesAdminRoutes,
  createFilesAppRoutes,
} from "@quick/app-files/server";
import {
  type HostingService,
  type OwnerVariables,
  createHostingRoutes,
  createOwnerAuth,
  createServeAppStatic,
  createTokenRoutes,
} from "@quick/app-hosting/server";
import {
  type StoreService,
  createStoreAdminRoutes,
  createStoreAppRoutes,
} from "@quick/app-store/server";
import {
  type AuditRecorder,
  type Auth,
  type Db,
  type SsoCodeStore,
  type Tenant,
  type TenantVariables,
  type ViewerVariables,
  createIdempotency,
  createOriginCheck,
  createResolveApp,
  createShareGate,
  createSsoCallback,
  createSsoStart,
} from "@quick/core/server";
import type { UserId } from "@quick/core/shared";
import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { mountMcp } from "./mcp.ts";
import { mountStatic } from "./static.ts";

export type ComposeOptions = {
  auth: Auth;
  db: Db;
  baseURL: string;
  secret: string;
  jwksOrigin: string;
  allowedHosts: readonly string[];
  rootDomain: string;
  appsDir: string;
  staticRoot: string;
  secureCookies: boolean;
  allowedEmails: ReadonlySet<string>;
  audit: AuditRecorder;
  hosting: HostingService;
  store: StoreService;
  files: FilesService;
  ssoCodes: SsoCodeStore;
  isOwner: (actor: UserId) => Promise<boolean>;
  appUrl: (slug: string) => string;
};

const handleError = (err: Error, c: Context): Response => {
  if (err.name === "ValiError") {
    return c.json({ kind: "invalid_input", message: "Invalid input" }, 400);
  }
  console.error("unhandled route error", err);
  return c.json({ kind: "internal_error" }, 500);
};

type Bindings = { tenant: Tenant };

export const createApp = (o: ComposeOptions) => {
  const ssoDeps = {
    auth: o.auth,
    registry: o.hosting,
    codes: o.ssoCodes,
    resolver: o.hosting,
    secret: o.secret,
    apexBaseUrl: o.baseURL,
    signInPath: "/sign-in",
    secureCookies: o.secureCookies,
  };

  // The apex host: dashboard SPA + owner API + Better Auth + MCP.
  const apex = new Hono<{ Bindings: Bindings; Variables: OwnerVariables }>()
    .use("*", secureHeaders())
    .on(["GET", "POST"], "/api/auth/*", (c) => o.auth.handler(c.req.raw))
    .get("/_sso/start", createSsoStart(ssoDeps))
    .route(
      "/",
      mountMcp({
        baseURL: o.baseURL,
        jwksOrigin: o.jwksOrigin,
        allowedHosts: o.allowedHosts,
        hosting: o.hosting,
        audit: o.audit,
        isOwner: o.isOwner,
        appUrl: o.appUrl,
      }),
    )
    .use("/api/*", cors({ origin: o.baseURL, credentials: true }))
    .use("/api/*", createOwnerAuth({ auth: o.auth, allowedEmails: o.allowedEmails, service: o.hosting }))
    .use("/api/*", createIdempotency(o.db))
    .get("/api/me", (c) => c.json({ user: c.var.user }))
    .route("/api/apps/:appId/records", createStoreAdminRoutes({ service: o.store }))
    .route("/api/apps/:appId/files", createFilesAdminRoutes({ service: o.files }))
    .route("/api/apps", createHostingRoutes({ service: o.hosting }))
    .route("/api/tokens", createTokenRoutes({ service: o.hosting }))
    .route("/", mountStatic(o.staticRoot))
    .onError(handleError);

  // A tenant host: a deployed app, gated by its share mode, plus /_api/* blocks.
  const tenant = new Hono<{ Bindings: Bindings; Variables: TenantVariables & ViewerVariables }>()
    .use("*", (c, next) => {
      c.set("tenant", c.env.tenant);
      return next();
    })
    .get("/_sso/callback", createSsoCallback(ssoDeps))
    .use(
      "*",
      createShareGate({
        resolver: o.hosting,
        secret: o.secret,
        apexBaseUrl: o.baseURL,
        secureCookies: o.secureCookies,
      }),
    )
    .use("/_api/*", createOriginCheck())
    .route("/_api/db", createStoreAppRoutes({ service: o.store }))
    .route("/_api/files", createFilesAppRoutes({ service: o.files }))
    .get("/_api/me", (c) => c.json({ viewer: c.var.viewer }))
    .get("*", createServeAppStatic({ appsDir: o.appsDir }))
    .onError(handleError);

  // Top dispatcher: resolve the tenant from Host, then hand off to the right app.
  return new Hono<{ Variables: TenantVariables }>()
    .use("*", logger())
    .get("/healthz", (c) => c.json({ ok: true }))
    .use("*", createResolveApp({ rootDomain: o.rootDomain, registry: o.hosting }))
    .all("*", (c) => {
      const t = c.var.tenant;
      const env: Bindings = { tenant: t };
      return t.kind === "app" ? tenant.fetch(c.req.raw, env) : apex.fetch(c.req.raw, env);
    });
};

export type AppType = ReturnType<typeof createApp>;
