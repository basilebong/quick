import { afterEach, describe, expect, test } from "bun:test";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFilesService } from "@quick/app-files/server";
import { createHostingService, createSlotsService } from "@quick/app-hosting/server";
import { createStoreService } from "@quick/app-store/server";
import {
  type Auth,
  createAuditRecorder,
  type Db,
  isAllowedEmail,
  parseAllowedEmails,
} from "@quick/core/server";
import { eq } from "@quick/core/server/drizzle";
import { users } from "@quick/core/server/schema";
import { withTestAuth } from "@quick/core/server/test";
import type { UserId } from "@quick/core/shared";
import { createApp } from "./composition.ts";

const OWNER_EMAIL = "owner@example.com";
const REDIRECT_URI = "http://127.0.0.1:33418/callback";

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;

const stringField = (value: unknown, key: string): string => {
  const f = field(value, key);
  if (typeof f !== "string")
    throw new Error(`expected string "${key}" in ${JSON.stringify(value)}`);
  return f;
};

const servers: { stop: (force?: boolean) => Promise<void> }[] = [];
afterEach(async () => {
  for (const s of servers.splice(0)) await s.stop(true);
});

const base64url = (buf: Buffer): string => buf.toString("base64url");

const decodeJwtPayload = (jwt: string): unknown => {
  const payload = jwt.split(".")[1];
  if (payload === undefined) throw new Error("not a JWT");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
};

const location = (res: Response): URL => {
  const loc = res.headers.get("location");
  if (loc === null) throw new Error(`expected a redirect, got ${res.status}`);
  return new URL(loc, "http://unused.invalid");
};

type Booted = { origin: string; cookie: string };

const withBootedServer = async (fn: (b: Booted) => Promise<void>): Promise<void> => {
  let fetchApp: (req: Request) => Response | Promise<Response> = () =>
    new Response("not ready", { status: 503 });
  const server = Bun.serve({ port: 0, fetch: (req) => fetchApp(req) });
  servers.push(server);
  const origin = `http://localhost:${server.port}`;

  await withTestAuth({ baseURL: origin }, async ({ auth, db, signSessionCookie }) => {
    fetchApp = buildApp(auth, db, origin, `localhost:${server.port}`).fetch;
    const ctx = await auth.$context;
    const user = await ctx.internalAdapter.createUser({ name: "Owner", email: OWNER_EMAIL });
    const session = await ctx.internalAdapter.createSession(user.id);
    const cookie = `Quick.session_token=${await signSessionCookie(session.token)}`;
    await fn({ origin, cookie });
  });
};

const buildApp = (auth: Auth, db: Db, origin: string, host: string) => {
  const allowedEmails = parseAllowedEmails(OWNER_EMAIL);
  const isOwner = async (actor: UserId): Promise<boolean> => {
    const rows = await db.select({ email: users.email }).from(users).where(eq(users.id, actor));
    const email = rows[0]?.email;
    return email !== undefined && isAllowedEmail(allowedEmails, email);
  };
  return createApp({
    auth,
    db,
    baseURL: origin,
    jwksOrigin: origin,
    allowedHosts: [host],
    rootDomain: "localhost",
    appsDir: mkdtempSync(join(tmpdir(), "quick-apps-")),
    staticRoot: mkdtempSync(join(tmpdir(), "quick-static-")),
    secureCookies: false,
    allowedEmails,
    audit: createAuditRecorder(db),
    hosting: createHostingService(db, { appsDir: mkdtempSync(join(tmpdir(), "quick-co-")) }),
    slots: createSlotsService(db),
    store: createStoreService(db),
    files: createFilesService(db),
    isOwner,
    appUrl: (slug) => `http://${slug}.${host}`,
  });
};

const runAuthorizationCodeFlow = async (origin: string, cookie: string) => {
  const registered = await fetch(`${origin}/api/auth/oauth2/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "MCP test client",
      redirect_uris: [REDIRECT_URI],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }),
  });
  expect(registered.status).toBe(200);
  const client_id = stringField(await registered.json(), "client_id");

  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const authorizeUrl = new URL(`${origin}/api/auth/oauth2/authorize`);
  authorizeUrl.search = new URLSearchParams({
    response_type: "code",
    client_id,
    redirect_uri: REDIRECT_URI,
    scope: "openid profile email offline_access",
    state: "state-123",
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: `${origin}/mcp`,
  }).toString();

  const authorized = await fetch(authorizeUrl, { headers: { cookie }, redirect: "manual" });
  const consentPage = location(authorized);
  expect(consentPage.pathname).toBe("/consent");

  const consented = await fetch(`${origin}/api/auth/oauth2/consent`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie, origin },
    body: JSON.stringify({ accept: true, oauth_query: consentPage.search.slice(1) }),
  });
  expect(consented.status).toBe(200);
  const callback = new URL(stringField(await consented.json(), "url"));
  expect(`${callback.origin}${callback.pathname}`).toBe(REDIRECT_URI);
  expect(callback.searchParams.get("state")).toBe("state-123");
  const code = callback.searchParams.get("code");
  if (code === null) throw new Error("callback carried no code");

  const exchanged = await fetch(`${origin}/api/auth/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id,
      code_verifier: verifier,
      resource: `${origin}/mcp`,
    }),
  });
  if (exchanged.status !== 200) throw new Error(await exchanged.text());
  return { client_id, tokens: await readTokens(exchanged) };
};

const readTokens = async (res: Response) => {
  const body: unknown = await res.json();
  return {
    access_token: stringField(body, "access_token"),
    refresh_token: stringField(body, "refresh_token"),
    token_type: stringField(body, "token_type"),
  };
};

const listTools = (origin: string, accessToken: string) =>
  fetch(`${origin}/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });

const parseSseJson = async (res: Response): Promise<unknown> => {
  const text = await res.text();
  const data = text
    .split("\n")
    .find((line) => line.startsWith("data: "))
    ?.slice("data: ".length);
  return JSON.parse(data ?? text);
};

describe("MCP OAuth 2.1 (DCR → authorize → consent → token → /mcp)", () => {
  test("a dynamically registered public client gets an audience-bound JWT that /mcp accepts", async () => {
    await withBootedServer(async ({ origin, cookie }) => {
      const { tokens } = await runAuthorizationCodeFlow(origin, cookie);

      expect(tokens.token_type.toLowerCase()).toBe("bearer");
      const claims = decodeJwtPayload(tokens.access_token);
      expect(stringField(claims, "iss")).toBe(`${origin}/api/auth`);
      expect([field(claims, "aud")].flat()).toContain(`${origin}/mcp`);

      const res = await listTools(origin, tokens.access_token);
      expect(res.status).toBe(200);
      const tools = field(field(await parseSseJson(res), "result"), "tools");
      if (!Array.isArray(tools)) throw new Error("tools/list returned no tools array");
      expect(tools.map((t) => stringField(t, "name"))).toContain("quick__list_apps");
    });
  });

  test("the refresh token mints a new access token that /mcp accepts", async () => {
    await withBootedServer(async ({ origin, cookie }) => {
      const { client_id, tokens } = await runAuthorizationCodeFlow(origin, cookie);

      const refreshed = await fetch(`${origin}/api/auth/oauth2/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: tokens.refresh_token,
          client_id,
          resource: `${origin}/mcp`,
        }),
      });
      expect(refreshed.status).toBe(200);
      const next = await readTokens(refreshed);
      expect((await listTools(origin, next.access_token)).status).toBe(200);
    });
  });

  test("/mcp rejects a missing or forged bearer token", async () => {
    await withBootedServer(async ({ origin }) => {
      expect((await listTools(origin, "")).status).toBe(401);
      const forged = `${base64url(Buffer.from('{"alg":"EdDSA"}'))}.${base64url(Buffer.from(`{"sub":"x","aud":"${origin}/mcp"}`))}.AAAA`;
      expect((await listTools(origin, forged)).status).toBe(401);
    });
  });

  test("a token minted for another audience is rejected by /mcp", async () => {
    await withBootedServer(async ({ origin, cookie }) => {
      const tokenRes = await fetch(`${origin}/api/auth/token`, { headers: { cookie } });
      expect(tokenRes.status).toBe(200);
      const token = stringField(await tokenRes.json(), "token");
      expect((await listTools(origin, token)).status).toBe(401);
    });
  });
});
