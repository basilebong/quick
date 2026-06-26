import { createMiddleware } from "hono/factory";

// CSRF / cross-app isolation. All `*.${QUICK_DOMAIN}` are the SAME SITE, so
// SameSite does not isolate apps; a sibling app's page could drive a request
// here carrying the cookie the browser auto-attaches by destination. CSRF is
// only possible when a cookie rides along, so the check is gated on a Cookie
// header: a cookieless client is exempt, while any cookie-bearing
// state-changing request must prove same-origin. Fails CLOSED — a cookie with
// no Sec-Fetch and no Origin/Referer is rejected. Preflight is left to CORS.
export const createOriginCheck = () =>
  createMiddleware(async (c, next) => {
    const method = c.req.method;
    if (method === "OPTIONS" || method === "HEAD") return next();
    if (c.req.header("cookie") === undefined) return next();

    const site = c.req.header("sec-fetch-site");
    if (site !== undefined) {
      return site === "same-origin" ? next() : c.json({ error: "forbidden_origin" }, 403);
    }
    const origin = c.req.header("origin") ?? c.req.header("referer");
    if (origin !== undefined) {
      try {
        if (new URL(origin).host === new URL(c.req.url).host) return next();
      } catch {}
    }
    return c.json({ error: "forbidden_origin" }, 403);
  });
