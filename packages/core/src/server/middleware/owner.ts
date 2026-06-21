import { createMiddleware } from "hono/factory";
import { isAllowedEmail } from "../auth/allowlist.ts";
import type { SessionVariables } from "./session.ts";

// Owner-only authorization, enforced PER REQUEST (not at sign-up). Mount after
// `createRequireSession`. Gates the dashboard API, the deploy endpoints, and the
// MCP tools against the owner allowlist.
export const createRequireOwner = (allowedEmails: ReadonlySet<string>) =>
  createMiddleware<{ Variables: SessionVariables }>(async (c, next) => {
    if (!isAllowedEmail(allowedEmails, c.get("user").email)) {
      return c.json({ error: "forbidden", message: "Owner access only" }, 403);
    }
    return next();
  });
