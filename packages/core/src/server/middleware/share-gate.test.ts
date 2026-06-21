import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { parseAppId, parseAppSlug, parseShareLinkId } from "../../shared/index.ts";
import { APP_SESSION_COOKIE, signAppSession } from "../app-session.ts";
import type { AppContext, ShareResolver, Tenant, TenantVariables, ViewerVariables } from "../tenant.ts";
import { createShareGate } from "./share-gate.ts";

const SECRET = "test-secret-at-least-32-chars-long-xx";

const appCtx = (shareMode: "google" | "link"): AppContext => ({
  id: parseAppId("app_1"),
  slug: parseAppSlug("acme"),
  name: "Acme",
  shareMode,
  currentDeploymentId: null,
});

const resolver = (over: Partial<ShareResolver> = {}): ShareResolver => ({
  validateLinkToken: async () => ({ kind: "invalid" }),
  recordAccess: async () => {},
  ...over,
});

const build = (tenant: Tenant, r: ShareResolver) =>
  new Hono<{ Variables: TenantVariables & ViewerVariables }>()
    .use("*", (c, next) => {
      c.set("tenant", tenant);
      return next();
    })
    .use(
      "*",
      createShareGate({
        resolver: r,
        secret: SECRET,
        apexBaseUrl: "https://quick.example.com",
        secureCookies: true,
      }),
    )
    .get("*", (c) => c.text("APP"));

describe("share gate", () => {
  test("apex is a no-op (dashboard continues)", async () => {
    const res = await build({ kind: "apex" }, resolver()).request("https://acme.quick.example.com/");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("APP");
  });

  test("link mode without a token shows the link page (403)", async () => {
    const res = await build({ kind: "app", app: appCtx("link") }, resolver()).request(
      "https://acme.quick.example.com/",
    );
    expect(res.status).toBe(403);
  });

  test("link mode with a valid token sets a HOST-ONLY cookie and cleans the URL", async () => {
    const r = resolver({
      validateLinkToken: async () => ({
        kind: "valid",
        linkId: parseShareLinkId("lnk_1"),
        expiresAt: Date.now() + 3_600_000,
      }),
    });
    const res = await build({ kind: "app", app: appCtx("link") }, r).request(
      "https://acme.quick.example.com/page?t=secret",
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/page");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${APP_SESSION_COOKIE}=`);
    // The isolation invariant: the per-app cookie is host-only (no Domain).
    expect(setCookie.toLowerCase()).not.toContain("domain=");
  });

  test("link mode with an expired token is denied", async () => {
    const r = resolver({ validateLinkToken: async () => ({ kind: "expired" }) });
    const res = await build({ kind: "app", app: appCtx("link") }, r).request(
      "https://acme.quick.example.com/?t=x",
    );
    expect(res.status).toBe(403);
  });

  test("a valid app-session cookie for THIS app admits the request", async () => {
    const cookie = signAppSession(
      { appId: "app_1", viewer: { kind: "link", linkId: "lnk_1" }, exp: Date.now() + 60_000 },
      SECRET,
    );
    const res = await build({ kind: "app", app: appCtx("link") }, resolver()).request(
      "https://acme.quick.example.com/",
      { headers: { cookie: `${APP_SESSION_COOKIE}=${cookie}` } },
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("APP");
  });

  test("an app-session cookie for ANOTHER app is rejected (cross-app isolation)", async () => {
    const cookie = signAppSession(
      { appId: "app_2", viewer: { kind: "link", linkId: "lnk_1" }, exp: Date.now() + 60_000 },
      SECRET,
    );
    const res = await build({ kind: "app", app: appCtx("link") }, resolver()).request(
      "https://acme.quick.example.com/",
      { headers: { cookie: `${APP_SESSION_COOKIE}=${cookie}` } },
    );
    expect(res.status).toBe(403);
  });

  test("google mode without a session redirects to the apex SSO handoff", async () => {
    const res = await build({ kind: "app", app: appCtx("google") }, resolver()).request(
      "https://acme.quick.example.com/dash",
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location") ?? "").toContain(
      "https://quick.example.com/_sso/start?app=acme",
    );
  });
});
