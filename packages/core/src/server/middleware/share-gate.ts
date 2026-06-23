import { getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import type { Viewer } from "../../shared/index.ts";
import { googleAccessDeniedPage, linkAccessPage } from "../html.ts";
import type { ShareResolver, TenantVariables, ViewerVariables } from "../tenant.ts";

// Remembers a redeemed link (the raw token). HOST-ONLY (no Domain) so it never
// leaks to another app's subdomain. It carries no authority of its own: every
// request re-validates it against the link store, so expiry/revocation take
// effect immediately and there is nothing signed to forge.
export const LINK_COOKIE = "quick_link";

// A google-mode viewer's per-app credential. HOST-ONLY (no Domain) so the owner's
// apex Better Auth session never reaches a tenant subdomain; set by /sso/callback
// from the apex one-time-code handoff and re-validated against the store here.
export const APP_SESSION_COOKIE = "quick_app_sess";

// A narrow read-only view of Better Auth's session API. The gate no longer reads
// the apex session directly (host-only cookies don't reach tenant subdomains); the
// apex /sso/grant route uses this to mint the handoff code. The real `auth.api`
// satisfies it.
export type SessionReader = {
  getSession(opts: {
    headers: Headers;
  }): Promise<{ user: { id: string; email: string; name: string } } | null>;
};

export type ShareGateDeps = {
  resolver: ShareResolver;
  apexBaseUrl: string;
  secureCookies: boolean;
};

const clientIp = (xff: string | undefined): string | null =>
  (xff?.split(",")[0] ?? "").trim() || null;

// Enforces a tenant app's share mode. A no-op on the apex (so the chain continues
// to the dashboard/API). For an app it admits the request (setting `viewer`) or
// redirects/blocks. Access is logged once per navigation, not per asset.
export const createShareGate = (deps: ShareGateDeps) =>
  createMiddleware<{ Variables: TenantVariables & ViewerVariables }>(async (c, next) => {
    const tenant = c.var.tenant;
    if (tenant.kind !== "app") return next();
    const app = tenant.app;
    const ip = clientIp(c.req.header("x-forwarded-for"));
    const userAgent = c.req.header("user-agent") ?? null;
    const isNavigation = c.req.header("sec-fetch-dest") === "document";

    if (app.shareMode === "google") {
      const token = getCookie(c, APP_SESSION_COOKIE);
      const session =
        token !== undefined && token !== ""
          ? await deps.resolver.validateAppSession(app.id, token)
          : null;
      if (session !== null) {
        const viewer: Viewer = {
          kind: "user",
          userId: session.userId,
          email: session.email,
          name: session.name,
        };
        if (!(await deps.resolver.isEmailAllowedForApp(app.id, session.email))) {
          if (!isNavigation) return c.json({ error: "forbidden" }, 403);
          await deps.resolver.recordAccess({
            appId: app.id,
            mode: "google",
            viewer,
            event: "denied",
            path: c.req.path,
            ip,
            userAgent,
          });
          return c.html(googleAccessDeniedPage(session.email), 403);
        }
        c.set("viewer", viewer);
        if (isNavigation) {
          await deps.resolver.recordAccess({
            appId: app.id,
            mode: "google",
            viewer,
            event: "view",
            path: c.req.path,
            ip,
            userAgent,
          });
        }
        return next();
      }
      // No host-only app session: hand off to the apex one-time-code grant. The
      // apex (where the Better Auth session lives) mints a code; /sso/callback on
      // this host then sets quick_app_sess and returns the browser here. Only a
      // top-level navigation is redirected — a non-navigation request (XHR/fetch/
      // subresource) gets a 401 so app code can re-auth instead of chasing a
      // cross-origin redirect to an HTML page. Absent Sec-Fetch metadata (older
      // browsers) is treated as a navigation so sign-in still works.
      const dest = c.req.header("sec-fetch-dest");
      if (dest !== undefined && dest !== "document") {
        return c.json({ error: "unauthorized" }, 401);
      }
      const u = new URL(c.req.url);
      const nextPath = `${u.pathname}${u.search}`;
      return c.redirect(
        `${deps.apexBaseUrl}/sso/grant?app=${encodeURIComponent(u.host)}&next=${encodeURIComponent(nextPath)}`,
        302,
      );
    }

    const queryToken = c.req.query("t");
    const token =
      queryToken !== undefined && queryToken !== "" ? queryToken : getCookie(c, LINK_COOKIE);
    const res =
      token !== undefined && token !== ""
        ? await deps.resolver.validateLinkToken(app.id, token)
        : ({ kind: "invalid" } as const);

    if (res.kind === "valid") {
      const viewer: Viewer = { kind: "link", linkId: res.linkId };
      c.set("viewer", viewer);
      if (queryToken !== undefined && queryToken !== "") {
        const maxAge = Math.max(1, Math.floor((res.expiresAt - Date.now()) / 1000));
        setCookie(c, LINK_COOKIE, queryToken, {
          httpOnly: true,
          secure: deps.secureCookies,
          sameSite: "Lax",
          path: "/",
          maxAge,
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
      if (isNavigation) {
        await deps.resolver.recordAccess({
          appId: app.id,
          mode: "link",
          viewer,
          event: "view",
          path: c.req.path,
          ip,
          userAgent,
        });
      }
      return next();
    }

    if (isNavigation) {
      await deps.resolver.recordAccess({
        appId: app.id,
        mode: "link",
        viewer: null,
        event: "denied",
        path: c.req.path,
        ip,
        userAgent,
      });
    }
    return c.html(linkAccessPage(res.kind === "expired" ? "expired" : "missing"), 403);
  });
