import { APP_SESSION_COOKIE, type SessionReader, type TenantVariables } from "@quick/core/server";
import { isUsableSlug, parseSubdomain, parseUserId } from "@quick/core/shared";
import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { APP_SESSION_TTL_MS, type HostingService } from "./service.ts";

// A `next` we will redirect the browser to must be a same-origin PATH, never an
// absolute URL — otherwise the handoff becomes an open redirector.
const safePath = (raw: string | undefined): string =>
  raw?.startsWith("/") && !raw.startsWith("//") ? raw : "/";

export type SsoGrantDeps = {
  session: SessionReader;
  service: Pick<HostingService, "findBySlug" | "createSsoCode">;
  rootDomain: string;
  apexBaseUrl: string;
  signInPath: string;
};

// Apex route. The Better Auth session lives here (host-only). For a signed-in
// viewer it mints a single-use code bound to the target google-mode app and
// bounces to that app's /sso/callback; for a signed-out viewer it sends them
// through Better Auth sign-in first. `?app` is validated to a real google-mode
// subdomain so the cross-subdomain redirect can't be abused.
export const createSsoGrant = (deps: SsoGrantDeps) =>
  new Hono().get("/sso/grant", async (c) => {
    const appHost = c.req.query("app") ?? "";
    const next = safePath(c.req.query("next"));
    const sub = parseSubdomain(appHost, deps.rootDomain);
    if (sub.kind !== "app" || !isUsableSlug(sub.label)) return c.text("Bad request", 400);
    const app = await deps.service.findBySlug(sub.label);
    if (app === null || app.shareMode !== "google") return c.text("Not found", 404);

    const session = await deps.session.getSession({ headers: c.req.raw.headers });
    if (!session?.user) {
      // A RELATIVE apex path so the SPA sign-in (which only honours same-origin
      // path `next` values) returns here to finish the handoff after Google.
      const self = `/sso/grant?app=${encodeURIComponent(appHost)}&next=${encodeURIComponent(next)}`;
      return c.redirect(
        `${deps.apexBaseUrl}${deps.signInPath}?next=${encodeURIComponent(self)}`,
        302,
      );
    }
    const code = await deps.service.createSsoCode(app.id, parseUserId(session.user.id));
    return c.redirect(
      `https://${appHost}/sso/callback?code=${encodeURIComponent(code)}&next=${encodeURIComponent(next)}`,
      302,
    );
  });

export type SsoCallbackDeps = {
  service: Pick<HostingService, "redeemSsoCode" | "createAppSession">;
  secureCookies: boolean;
};

// Tenant middleware, mounted BEFORE the share-gate. Redeems a handoff code minted
// for THIS app, sets the host-only quick_app_sess cookie, and strips the code from
// the URL (Referrer-Policy: no-referrer). A bad/expired/replayed code just sends
// the browser to the clean `next`, where the share-gate re-initiates the handoff.
export const createSsoCallback = (deps: SsoCallbackDeps) =>
  createMiddleware<{ Variables: TenantVariables }>(async (c, next) => {
    if (c.req.path !== "/sso/callback") return next();
    const tenant = c.var.tenant;
    if (tenant.kind !== "app") return next();

    const nextPath = safePath(c.req.query("next"));
    const code = c.req.query("code") ?? "";
    c.header("Referrer-Policy", "no-referrer");
    const redeemed = code !== "" ? await deps.service.redeemSsoCode(code, tenant.app.id) : null;
    if (redeemed === null) return c.redirect(nextPath, 302);

    const token = await deps.service.createAppSession(tenant.app.id, redeemed.userId);
    setCookie(c, APP_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: deps.secureCookies,
      sameSite: "Lax",
      path: "/",
      maxAge: Math.floor(APP_SESSION_TTL_MS / 1000),
    });
    return c.redirect(nextPath, 302);
  });
