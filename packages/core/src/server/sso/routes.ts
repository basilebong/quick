import type { Context } from "hono";
import { setCookie } from "hono/cookie";
import type { Viewer } from "../../shared/index.ts";
import { APP_SESSION_COOKIE, APP_SESSION_TTL_MS, signAppSession } from "../app-session.ts";
import type { Auth } from "../auth/index.ts";
import type { AppRegistry, ShareResolver, TenantVariables } from "../tenant.ts";
import type { SsoCodeStore } from "./codes.ts";

export type SsoDeps = {
  auth: Auth;
  registry: AppRegistry;
  codes: SsoCodeStore;
  resolver: ShareResolver;
  secret: string;
  apexBaseUrl: string;
  signInPath: string;
  secureCookies: boolean;
};

const sanitizePath = (raw: string | undefined): string => {
  if (raw === undefined || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
};

const appOrigin = (apexBaseUrl: string, slug: string): string => {
  const u = new URL(apexBaseUrl);
  return `${u.protocol}//${slug}.${u.host}`;
};

// APEX: ensures the visitor is signed in (Google, via the dashboard sign-in
// page), then mints a one-time code and bounces to the app subdomain. The apex
// session is never shared cross-subdomain — only this code crosses.
export const createSsoStart =
  (deps: SsoDeps) =>
  async (c: Context): Promise<Response> => {
    const slug = c.req.query("app") ?? "";
    const ret = sanitizePath(c.req.query("return"));
    const app = await deps.registry.findBySlug(slug);
    if (app === null) return c.text("Unknown app", 400);

    const session = await deps.auth.api.getSession({ headers: c.req.raw.headers });
    if (!session?.user) {
      const next = `/_sso/start?app=${encodeURIComponent(slug)}&return=${encodeURIComponent(ret)}`;
      return c.redirect(`${deps.signInPath}?next=${encodeURIComponent(next)}`, 302);
    }

    const code = await deps.codes.create({
      appId: app.id,
      userId: session.user.id,
      email: session.user.email,
      name: session.user.name,
    });
    const target = `${appOrigin(deps.apexBaseUrl, app.slug)}/_sso/callback?code=${encodeURIComponent(code)}&return=${encodeURIComponent(ret)}`;
    return c.redirect(target, 302);
  };

// TENANT: exchanges the one-time code for a host-only app-session cookie. Mounted
// BEFORE the share gate so it is reachable without a session.
export const createSsoCallback =
  (deps: SsoDeps) =>
  async (c: Context<{ Variables: TenantVariables }>): Promise<Response> => {
    const tenant = c.var.tenant;
    if (tenant.kind !== "app") return c.text("Not found", 404);

    const fields = await deps.codes.consume(c.req.query("code") ?? "");
    if (fields === null || fields.appId !== tenant.app.id) {
      return c.text("Invalid or expired sign-in code", 403);
    }

    const viewer: Viewer = {
      kind: "user",
      userId: fields.userId,
      email: fields.email,
      name: fields.name,
    };
    setCookie(
      c,
      APP_SESSION_COOKIE,
      signAppSession(
        { appId: tenant.app.id, viewer, exp: Date.now() + APP_SESSION_TTL_MS },
        deps.secret,
      ),
      { httpOnly: true, secure: deps.secureCookies, sameSite: "Lax", path: "/" },
    );
    await deps.resolver.recordAccess({
      appId: tenant.app.id,
      mode: "google",
      viewer,
      event: "view",
      path: sanitizePath(c.req.query("return")),
      ip: (c.req.header("x-forwarded-for")?.split(",")[0] ?? "").trim() || null,
      userAgent: c.req.header("user-agent") ?? null,
    });
    return c.redirect(sanitizePath(c.req.query("return")), 302);
  };
