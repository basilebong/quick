import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  APP_SESSION_COOKIE,
  type Auth,
  type Tenant,
  type TenantVariables,
} from "@quick/core/server";
import { withTestAuth } from "@quick/core/server/test";
import { parseUserId } from "@quick/core/shared";
import { Hono } from "hono";
import { createHostingService } from "./service.ts";
import { createSsoCallback, createSsoGrant } from "./sso.ts";

const ROOT = "quick.example.com";
const APP_HOST = "acme.quick.example.com";

type Ctx = {
  auth: Auth;
  db: Parameters<typeof createHostingService>[0];
  signSessionCookie: (token: string) => Promise<string>;
};

const setup = async ({ auth, db, signSessionCookie }: Ctx) => {
  const service = createHostingService(db, { appsDir: mkdtempSync(join(tmpdir(), "quick-sso-")) });
  const authCtx = await auth.$context;
  const user = await authCtx.internalAdapter.createUser({ name: "Viewer", email: "v@example.com" });
  const userId = parseUserId(user.id);
  const created = await service.createApp(
    { slug: "acme", name: "Acme", shareMode: "google" },
    userId,
  );
  if (created.kind !== "ok") throw new Error("createApp failed");
  const appCtx = await service.findBySlug("acme");
  if (appCtx === null) throw new Error("findBySlug failed");

  const session = await authCtx.internalAdapter.createSession(user.id);
  const cookie = `Quick.session_token=${await signSessionCookie(session.token)}`;

  const apex = new Hono().route(
    "/",
    createSsoGrant({
      session: { getSession: (opts) => auth.api.getSession(opts) },
      service,
      rootDomain: ROOT,
      apexBaseUrl: "https://quick.example.com",
      signInPath: "/sign-in",
    }),
  );
  const tenant = new Hono<{ Variables: TenantVariables }>()
    .use("*", (c, next) => {
      c.set("tenant", { kind: "app", app: appCtx } satisfies Tenant);
      return next();
    })
    .use("*", createSsoCallback({ service, secureCookies: false }))
    .get("*", (c) => c.text("LANDED"));

  return { service, appCtx, userId, cookie, apex, tenant };
};

const cookieToken = (setCookie: string): string =>
  decodeURIComponent(setCookie.split(`${APP_SESSION_COOKIE}=`)[1]?.split(";")[0] ?? "");

describe("sso handoff", () => {
  test("a signed-in viewer is granted a code, handed to the app callback, and a host-only session is set", async () => {
    await withTestAuth({}, async (ctx) => {
      const h = await setup(ctx);
      const res = await h.apex.request(`/sso/grant?app=${APP_HOST}&next=%2Fdash`, {
        headers: { cookie: h.cookie },
      });
      expect(res.status).toBe(302);
      const loc = res.headers.get("location") ?? "";
      expect(loc.startsWith(`https://${APP_HOST}/sso/callback?`)).toBe(true);
      const code = new URL(loc).searchParams.get("code") ?? "";
      expect(code.length).toBeGreaterThan(20);

      const cb = await h.tenant.request(
        `https://${APP_HOST}/sso/callback?code=${code}&next=%2Fdash`,
      );
      expect(cb.status).toBe(302);
      expect(cb.headers.get("location")).toBe("/dash");
      const setCookie = cb.headers.get("set-cookie") ?? "";
      expect(setCookie).toContain(`${APP_SESSION_COOKIE}=`);
      expect(setCookie.toLowerCase()).not.toContain("domain=");
      expect(cb.headers.get("referrer-policy")).toBe("no-referrer");

      expect(await h.service.validateAppSession(h.appCtx.id, cookieToken(setCookie))).toEqual({
        userId: h.userId,
        email: "v@example.com",
        name: "Viewer",
      });
    });
  });

  test("a signed-out viewer is sent through Better Auth sign-in, preserving the destination", async () => {
    await withTestAuth({}, async (ctx) => {
      const h = await setup(ctx);
      const res = await h.apex.request(`/sso/grant?app=${APP_HOST}&next=%2Fdash`);
      expect(res.status).toBe(302);
      const loc = res.headers.get("location") ?? "";
      expect(loc.startsWith("https://quick.example.com/sign-in?next=")).toBe(true);
      expect(decodeURIComponent(loc)).toContain(`/sso/grant?app=${APP_HOST}`);
    });
  });

  test("a code is single-use — replay sets no cookie", async () => {
    await withTestAuth({}, async (ctx) => {
      const h = await setup(ctx);
      const grant = await h.apex.request(`/sso/grant?app=${APP_HOST}&next=%2F`, {
        headers: { cookie: h.cookie },
      });
      const code = new URL(grant.headers.get("location") ?? "").searchParams.get("code") ?? "";
      const first = await h.tenant.request(
        `https://${APP_HOST}/sso/callback?code=${code}&next=%2F`,
      );
      expect((first.headers.get("set-cookie") ?? "").includes(APP_SESSION_COOKIE)).toBe(true);
      const replay = await h.tenant.request(
        `https://${APP_HOST}/sso/callback?code=${code}&next=%2F`,
      );
      expect(replay.status).toBe(302);
      expect((replay.headers.get("set-cookie") ?? "").includes(APP_SESSION_COOKIE)).toBe(false);
    });
  });

  test("a non-existent or non-app host is rejected (no open redirect)", async () => {
    await withTestAuth({}, async (ctx) => {
      const h = await setup(ctx);
      expect(
        (await h.apex.request(`/sso/grant?app=${ROOT}`, { headers: { cookie: h.cookie } })).status,
      ).toBe(400);
      expect(
        (await h.apex.request(`/sso/grant?app=ghost.${ROOT}`, { headers: { cookie: h.cookie } }))
          .status,
      ).toBe(404);
    });
  });

  test("an `app` host with embedded userinfo cannot redirect the code off-domain", async () => {
    await withTestAuth({}, async (ctx) => {
      const h = await setup(ctx);
      const res = await h.apex.request(
        `/sso/grant?app=${encodeURIComponent("acme.quick.example.com:@evil.com")}&next=%2F`,
        { headers: { cookie: h.cookie } },
      );
      expect(res.status).toBe(302);
      const loc = new URL(res.headers.get("location") ?? "");
      expect(loc.host).toBe(APP_HOST);
      expect((loc.searchParams.get("code") ?? "").length).toBeGreaterThan(20);
    });
  });

  test("an `app` host with an @ that does not truncate is rejected", async () => {
    await withTestAuth({}, async (ctx) => {
      const h = await setup(ctx);
      const res = await h.apex.request(
        `/sso/grant?app=${encodeURIComponent("acme.quick.example.com@evil.com")}`,
        { headers: { cookie: h.cookie } },
      );
      expect(res.status).toBe(400);
    });
  });

  test("the callback rejects a backslash `next` as an open redirect", async () => {
    await withTestAuth({}, async (ctx) => {
      const h = await setup(ctx);
      const cb = await h.tenant.request(
        `https://${APP_HOST}/sso/callback?next=${encodeURIComponent("/\\evil.com")}`,
      );
      expect(cb.status).toBe(302);
      expect(cb.headers.get("location")).toBe("/");
    });
  });

  test("the callback rejects a protocol-relative `next` as an open redirect", async () => {
    await withTestAuth({}, async (ctx) => {
      const h = await setup(ctx);
      const cb = await h.tenant.request(
        `https://${APP_HOST}/sso/callback?next=${encodeURIComponent("//evil.com")}`,
      );
      expect(cb.status).toBe(302);
      expect(cb.headers.get("location")).toBe("/");
    });
  });

  test("the callback preserves a same-origin path `next`", async () => {
    await withTestAuth({}, async (ctx) => {
      const h = await setup(ctx);
      const cb = await h.tenant.request(
        `https://${APP_HOST}/sso/callback?next=${encodeURIComponent("/dash?tab=1")}`,
      );
      expect(cb.status).toBe(302);
      expect(cb.headers.get("location")).toBe("/dash?tab=1");
    });
  });
});
