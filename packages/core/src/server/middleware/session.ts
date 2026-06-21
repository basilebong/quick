import { createMiddleware } from "hono/factory";
import type { Auth } from "../auth/index.ts";

type SessionFromAuth = Awaited<ReturnType<Auth["api"]["getSession"]>>;
type AuthedSession = NonNullable<SessionFromAuth>;

export type SessionVariables = {
  user: AuthedSession["user"];
  session: AuthedSession["session"];
};

export const createRequireSession = (auth: Auth) =>
  createMiddleware<{ Variables: SessionVariables }>(async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session?.user) return c.json({ error: "unauthorized" }, 401);
    c.set("user", session.user);
    c.set("session", session.session);
    return next();
  });
