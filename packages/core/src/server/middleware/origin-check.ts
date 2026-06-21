import { createMiddleware } from "hono/factory";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Defense-in-depth for `/_api/*` writes: require the request's Origin host to
// equal the tenant host. Host-only cookies already block cross-app credential
// reuse; this also rejects cross-origin writes that try to ride along.
export const createOriginCheck = () =>
  createMiddleware(async (c, next) => {
    if (SAFE_METHODS.has(c.req.method)) return next();
    const origin = c.req.header("origin");
    const host = c.req.header("host");
    if (origin === undefined || host === undefined) {
      return c.json({ error: "forbidden_origin" }, 403);
    }
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      return c.json({ error: "forbidden_origin" }, 403);
    }
    if (originHost !== host) return c.json({ error: "forbidden_origin" }, 403);
    return next();
  });
