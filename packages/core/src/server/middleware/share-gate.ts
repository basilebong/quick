import { getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import type { Viewer } from "../../shared/index.ts";
import { APP_SESSION_COOKIE, APP_SESSION_TTL_MS, signAppSession, verifyAppSession } from "../app-session.ts";
import { linkAccessPage } from "../html.ts";
import type { ShareResolver, TenantVariables, ViewerVariables } from "../tenant.ts";

export type ShareGateDeps = {
  resolver: ShareResolver;
  secret: string;
  apexBaseUrl: string;
  secureCookies: boolean;
};

const clientIp = (xff: string | undefined): string | null =>
  (xff?.split(",")[0] ?? "").trim() || null;

// Enforces a tenant app's share mode. On the apex it is a no-op (so the chain
// continues to the dashboard/API). For an app it either admits the request
// (setting `viewer`) or redirects/blocks.
export const createShareGate = (deps: ShareGateDeps) =>
  createMiddleware<{ Variables: TenantVariables & ViewerVariables }>(async (c, next) => {
    const tenant = c.var.tenant;
    if (tenant.kind !== "app") return next();
    const app = tenant.app;
    const now = Date.now();

    const existing = getCookie(c, APP_SESSION_COOKIE);
    if (existing !== undefined) {
      const payload = verifyAppSession(existing, deps.secret, now);
      if (payload !== null && payload.appId === app.id) {
        c.set("viewer", payload.viewer);
        return next();
      }
    }

    const ip = clientIp(c.req.header("x-forwarded-for"));
    const userAgent = c.req.header("user-agent") ?? null;

    if (app.shareMode === "link") {
      const token = c.req.query("t");
      const res =
        token !== undefined && token !== ""
          ? await deps.resolver.validateLinkToken(app.id, token)
          : ({ kind: "invalid" } as const);

      if (res.kind === "valid") {
        const viewer: Viewer = { kind: "link", linkId: res.linkId };
        const exp = Math.min(res.expiresAt, now + APP_SESSION_TTL_MS);
        setCookie(c, APP_SESSION_COOKIE, signAppSession({ appId: app.id, viewer, exp }, deps.secret), {
          httpOnly: true,
          secure: deps.secureCookies,
          sameSite: "Lax",
          path: "/",
        });
        await deps.resolver.recordAccess({
          appId: app.id,
          mode: "link",
          viewer,
          event: "view",
          path: c.req.path,
          ip,
          userAgent,
        });
        const u = new URL(c.req.url);
        u.searchParams.delete("t");
        c.header("Referrer-Policy", "no-referrer");
        return c.redirect(`${u.pathname}${u.search}`, 302);
      }

      await deps.resolver.recordAccess({
        appId: app.id,
        mode: "link",
        viewer: null,
        event: "denied",
        path: c.req.path,
        ip,
        userAgent,
      });
      return c.html(linkAccessPage(res.kind === "expired" ? "expired" : "missing"), 403);
    }

    // "google" mode: hand off to the apex sign-in/SSO flow.
    const u = new URL(c.req.url);
    const ret = `${u.pathname}${u.search}`;
    const target = `${deps.apexBaseUrl}/_sso/start?app=${encodeURIComponent(app.slug)}&return=${encodeURIComponent(ret)}`;
    return c.redirect(target, 302);
  });
