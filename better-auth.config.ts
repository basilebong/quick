import { parseAllowedEmails } from "./packages/core/src/server/auth/allowlist.ts";
import { createAuth } from "./packages/core/src/server/auth/index.ts";
import { createDb } from "./packages/core/src/server/db/index.ts";

export const auth = createAuth({
  db: createDb({ path: ":memory:" }),
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:5173",
  secret: process.env.BETTER_AUTH_SECRET ?? "schema-generation-placeholder-secret-32+",
  google: {
    clientId: process.env.GOOGLE_ID ?? "placeholder",
    clientSecret: process.env.GOOGLE_SECRET ?? "placeholder",
  },
  allowedEmails: parseAllowedEmails(process.env.QUICK_ALLOWED_EMAILS),
  useSecureCookies: false,
  mcpResource: `${process.env.BETTER_AUTH_URL ?? "http://localhost:5173"}/mcp`,
});
