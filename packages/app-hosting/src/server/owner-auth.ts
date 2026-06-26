import { type Auth, isAllowedEmail } from "@quick/core/server";
import { createMiddleware } from "hono/factory";

export type OwnerUser = { id: string; email: string; name: string };
export type OwnerVariables = { user: OwnerUser };

// Authenticates an owner-only request by a Better Auth session whose email is on
// the owner allowlist. Mount on the apex /api/* surface.
export const createOwnerAuth = (deps: { auth: Auth; allowedEmails: ReadonlySet<string> }) =>
  createMiddleware<{ Variables: OwnerVariables }>(async (c, next) => {
    const session = await deps.auth.api.getSession({ headers: c.req.raw.headers });
    if (!session?.user) return c.json({ error: "unauthorized" }, 401);
    if (!isAllowedEmail(deps.allowedEmails, session.user.email)) {
      return c.json({ error: "forbidden", message: "Owner access only" }, 403);
    }
    c.set("user", { id: session.user.id, email: session.user.email, name: session.user.name });
    return next();
  });
