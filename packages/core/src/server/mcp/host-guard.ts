import { createMiddleware } from "hono/factory";

export const mcpHostGuard = (allowedHosts: readonly string[]) =>
  createMiddleware(async (c, next) => {
    const host = c.req.header("host");
    if (host === undefined || !allowedHosts.includes(host)) {
      return c.json({ error: "forbidden_host" }, 403);
    }
    return next();
  });
