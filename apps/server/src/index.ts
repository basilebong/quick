import { dirname, resolve } from "node:path";
import { createFilesService } from "@quick/app-files/server";
import { createHostingService } from "@quick/app-hosting/server";
import { createStoreService } from "@quick/app-store/server";
import {
  createAuditRecorder,
  createAuth,
  createDb,
  isAllowedEmail,
  parseAllowedEmails,
} from "@quick/core/server";
import { eq } from "@quick/core/server/drizzle";
import { users } from "@quick/core/server/schema";
import { type UserId, parseRuntimeEnv } from "@quick/core/shared";
import { createApp } from "./composition.ts";

const env = parseRuntimeEnv(process.env);
const apexUrl = new URL(env.BETTER_AUTH_URL);
const rootDomain = apexUrl.hostname;
const staticRoot = resolve(import.meta.dirname, "../../web/dist");
const appsDir = env.APPS_DIR ?? resolve(dirname(env.DATABASE_PATH), "apps");
const secureCookies = process.env.NODE_ENV === "production";
const allowedEmails = parseAllowedEmails(env.QUICK_ALLOWED_EMAILS);

const allowedHosts = [
  apexUrl.host,
  `localhost:${env.PORT}`,
  `127.0.0.1:${env.PORT}`,
  ...(env.MCP_HOST === undefined ? [] : [env.MCP_HOST]),
];

const db = createDb({ path: env.DATABASE_PATH });

const auth = createAuth({
  db,
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  google: { clientId: env.GOOGLE_ID, clientSecret: env.GOOGLE_SECRET },
  allowedEmails,
  useSecureCookies: secureCookies,
  mcpResource: `${env.BETTER_AUTH_URL}/mcp`,
});

const hosting = createHostingService(db, { appsDir });
const store = createStoreService(db);
const files = createFilesService(db);
const audit = createAuditRecorder(db);

const appUrl = (slug: string): string => `${apexUrl.protocol}//${slug}.${apexUrl.host}`;

const isOwner = async (actor: UserId): Promise<boolean> => {
  const rows = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, actor))
    .limit(1);
  const email = rows[0]?.email;
  return email !== undefined && isAllowedEmail(allowedEmails, email);
};

const app = createApp({
  auth,
  db,
  baseURL: env.BETTER_AUTH_URL,
  jwksOrigin: `http://localhost:${env.PORT}`,
  allowedHosts,
  rootDomain,
  appsDir,
  staticRoot,
  secureCookies,
  allowedEmails,
  audit,
  hosting,
  store,
  files,
  isOwner,
  appUrl,
});

const server = Bun.serve({ port: env.PORT, fetch: app.fetch });

let shuttingDown = false;
const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`Quick server received ${signal}, shutting down`);
  await server.stop();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.info(`Quick server listening on http://localhost:${env.PORT} (root domain: ${rootDomain})`);
