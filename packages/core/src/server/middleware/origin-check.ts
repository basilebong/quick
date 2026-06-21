import { createMiddleware } from "hono/factory";

// Cross-app isolation for `/_api/*`. The Better Auth session cookie is shared
// across subdomains, so app A's page could fetch app B's API carrying it. Require
// the browser's Sec-Fetch-Site to be `same-origin` — app B's own page qualifies;
// an A→B fetch is `same-site`/`cross-site` and is rejected. Falls back to an
// Origin/Referer host check for the rare client that omits Sec-Fetch metadata.
export const createOriginCheck = () =>
  createMiddleware(async (c, next) => {
    const site = c.req.header("sec-fetch-site");
    if (site !== undefined) {
      if (site !== "same-origin") return c.json({ error: "forbidden_origin" }, 403);
      return next();
    }
    const origin = c.req.header("origin") ?? c.req.header("referer");
    if (origin !== undefined) {
      try {
        if (new URL(origin).host !== new URL(c.req.url).host) {
          return c.json({ error: "forbidden_origin" }, 403);
        }
      } catch {
        return c.json({ error: "forbidden_origin" }, 403);
      }
    }
    return next();
  });
