import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFilesService } from "@quick/app-files/server";
import { createHostingService } from "@quick/app-hosting/server";
import { createStoreService } from "@quick/app-store/server";
import {
  type Auth,
  type Db,
  createAuditRecorder,
  isAllowedEmail,
  parseAllowedEmails,
} from "@quick/core/server";
import { eq } from "@quick/core/server/drizzle";
import { users } from "@quick/core/server/schema";
import { withTestAuth } from "@quick/core/server/test";
import { type UserId, parseAppId, parseUserId } from "@quick/core/shared";
import { createApp } from "./composition.ts";

const OWNER_EMAIL = "owner@example.com";
const BASE = "https://quick.example.com";

const build = async (auth: Auth, db: Db, signSessionCookie: (t: string) => Promise<string>) => {
  const allowedEmails = parseAllowedEmails(OWNER_EMAIL);
  const hosting = createHostingService(db, { appsDir: mkdtempSync(join(tmpdir(), "quick-co-")) });
  const isOwner = async (actor: UserId): Promise<boolean> => {
    const rows = await db.select({ email: users.email }).from(users).where(eq(users.id, actor));
    const email = rows[0]?.email;
    return email !== undefined && isAllowedEmail(allowedEmails, email);
  };
  const app = createApp({
    auth,
    db,
    baseURL: BASE,
    jwksOrigin: "http://localhost:3000",
    allowedHosts: ["quick.example.com"],
    rootDomain: "quick.example.com",
    appsDir: mkdtempSync(join(tmpdir(), "quick-apps-")),
    staticRoot: mkdtempSync(join(tmpdir(), "quick-static-")),
    secureCookies: false,
    allowedEmails,
    audit: createAuditRecorder(db),
    hosting,
    store: createStoreService(db),
    files: createFilesService(db),
    isOwner,
    appUrl: (slug) => `https://${slug}.quick.example.com`,
  });

  const ctx = await auth.$context;
  const user = await ctx.internalAdapter.createUser({ name: "Owner", email: OWNER_EMAIL });
  const ownerId = parseUserId(user.id);
  const session = await ctx.internalAdapter.createSession(user.id);
  const cookie = `Quick.session_token=${await signSessionCookie(session.token)}`;
  return { app, hosting, cookie, ownerId };
};

describe("composition (tenancy + CSRF wiring)", () => {
  test("apex owner API blocks a cookie-bearing same-site request (CSRF) but allows same-origin", async () => {
    await withTestAuth({ baseURL: BASE }, async ({ auth, db, signSessionCookie }) => {
      const { app, hosting, cookie, ownerId } = await build(auth, db, signSessionCookie);
      const created = await hosting.createApp(
        { slug: "acme", name: "Acme", shareMode: "link" },
        ownerId,
      );
      if (created.kind !== "ok") throw new Error("createApp failed");
      const appId = parseAppId(created.value.id);

      const csrf = await app.request(`${BASE}/api/apps/${appId}`, {
        method: "DELETE",
        headers: { host: "quick.example.com", cookie, "sec-fetch-site": "same-site" },
      });
      expect(csrf.status).toBe(403);
      expect((await hosting.getApp(appId)).kind).toBe("ok");

      const ok = await app.request(`${BASE}/api/apps/${appId}`, {
        method: "DELETE",
        headers: { host: "quick.example.com", cookie, "sec-fetch-site": "same-origin" },
      });
      expect(ok.status).toBe(200);
      expect((await hosting.getApp(appId)).kind).toBe("err");
    });
  });

  test("apex owner API fails closed when a cookie is present but no provenance header is", async () => {
    await withTestAuth({ baseURL: BASE }, async ({ auth, db, signSessionCookie }) => {
      const { app, cookie } = await build(auth, db, signSessionCookie);
      const res = await app.request(`${BASE}/api/me`, {
        headers: { host: "quick.example.com", cookie },
      });
      expect(res.status).toBe(403);
    });
  });

  test("a personal access token is re-checked against the owner allowlist on every request", async () => {
    await withTestAuth({ baseURL: BASE }, async ({ auth, db, signSessionCookie }) => {
      const { app, hosting, ownerId } = await build(auth, db, signSessionCookie);
      const ownerTok = await hosting.createToken(ownerId, "cli");
      if (ownerTok.kind !== "ok") throw new Error("createToken failed");

      const ctx = await auth.$context;
      const stranger = await ctx.internalAdapter.createUser({
        name: "Stranger",
        email: "stranger@example.com",
      });
      const strangerTok = await hosting.createToken(parseUserId(stranger.id), "cli");
      if (strangerTok.kind !== "ok") throw new Error("createToken failed");

      const okRes = await app.request(`${BASE}/api/me`, {
        headers: { host: "quick.example.com", authorization: `Bearer ${ownerTok.value.token}` },
      });
      expect(okRes.status).toBe(200);

      const denied = await app.request(`${BASE}/api/me`, {
        headers: { host: "quick.example.com", authorization: `Bearer ${strangerTok.value.token}` },
      });
      expect(denied.status).toBe(403);
    });
  });

  test("tenant /_api/* is unreachable without the host-only app session (google mode)", async () => {
    await withTestAuth({ baseURL: BASE }, async ({ auth, db, signSessionCookie }) => {
      const { app, hosting, ownerId } = await build(auth, db, signSessionCookie);
      const created = await hosting.createApp(
        { slug: "acme", name: "Acme", shareMode: "google" },
        ownerId,
      );
      if (created.kind !== "ok") throw new Error("createApp failed");

      const res = await app.request("https://acme.quick.example.com/_api/db/things", {
        headers: { host: "acme.quick.example.com", "sec-fetch-site": "same-origin" },
      });
      expect(res.status).toBe(302);
      expect(res.headers.get("location") ?? "").toContain("/sso/grant");
    });
  });
});
