import { getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import type { Viewer } from "../../shared/index.ts";
import { linkAccessPage } from "../html.ts";
import type { ShareResolver, TenantVariables, ViewerVariables } from "../tenant.ts";

// Remembers a redeemed link (the raw token). HOST-ONLY (no Domain) so it never
// leaks to another app's subdomain. It carries no authority of its own: every
// request re-validates it against the link store, so expiry/revocation take
// effect immediately and there is nothing signed to forge.
export const LINK_COOKIE = "quick_link";

// A narrow read-only view of Better Auth's session API, so the gate (and its
// tests) depend only on `getSession`. The real `auth.api` satisfies it.
export type SessionReader = {
  getSession(opts: {
    headers: Headers;
  }): Promise<{ user: { id: string; email: string; name: string } } | null>;
};

export type ShareGateDeps = {
  resolver: ShareResolver;
  session: SessionReader;
  apexBaseUrl: string;
  signInPath: string;
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
      const session = await deps.session.getSession({ headers: c.req.raw.headers });
      if (session?.user) {
        const viewer: Viewer = {
          kind: "user",
          userId: session.user.id,
          email: session.user.email,
          name: session.user.name,
        };
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
      // Not signed in: hand off to Better Auth sign-in on the apex. After Google
      // OAuth, the cross-subdomain session cookie is set and the browser returns
      // here (callbackURL = this URL), where getSession then succeeds.
      const u = new URL(c.req.url);
      const appUrl = `${u.protocol}//${u.host}${u.pathname}${u.search}`;
      return c.redirect(
        `${deps.apexBaseUrl}${deps.signInPath}?next=${encodeURIComponent(appUrl)}`,
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
