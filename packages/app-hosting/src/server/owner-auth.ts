import { type Auth, isAllowedEmail } from "@quick/core/server";
import { createMiddleware } from "hono/factory";
import type { HostingService } from "./service.ts";

export type OwnerUser = { id: string; email: string; name: string };
export type OwnerVariables = { user: OwnerUser };

// Authenticates an owner-only request by EITHER a Better Auth session (dashboard)
// whose email is on the owner allowlist, OR a personal access token (CLI). Both
// set `c.var.user` to the owner. Mount on the apex /api/* surface.
export const createOwnerAuth = (deps: {
  auth: Auth;
  allowedEmails: ReadonlySet<string>;
  service: HostingService;
}) =>
  createMiddleware<{ Variables: OwnerVariables }>(async (c, next) => {
    const authz = c.req.header("authorization");
    if (authz !== undefined && authz.startsWith("Bearer ")) {
      const owner = await deps.service.verifyAccessToken(authz.slice("Bearer ".length));
      if (owner === null) return c.json({ error: "unauthorized" }, 401);
      c.set("user", { id: owner.userId, email: owner.email, name: owner.name });
      return next();
    }
    const session = await deps.auth.api.getSession({ headers: c.req.raw.headers });
    if (!session?.user) return c.json({ error: "unauthorized" }, 401);
    if (!isAllowedEmail(deps.allowedEmails, session.user.email)) {
      return c.json({ error: "forbidden", message: "Owner access only" }, 403);
    }
    c.set("user", { id: session.user.id, email: session.user.email, name: session.user.name });
    return next();
  });
