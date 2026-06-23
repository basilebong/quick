import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { parseAppId, parseAppSlug, parseShareLinkId } from "../../shared/index.ts";
import type {
  AppContext,
  ShareResolver,
  Tenant,
  TenantVariables,
  ViewerVariables,
} from "../tenant.ts";
import { APP_SESSION_COOKIE, LINK_COOKIE, createShareGate } from "./share-gate.ts";

const appCtx = (shareMode: "google" | "link"): AppContext => ({
  id: parseAppId("app_1"),
  slug: parseAppSlug("acme"),
  name: "Acme",
  shareMode,
  currentDeploymentId: null,
});

const resolver = (over: Partial<ShareResolver> = {}): ShareResolver => ({
  validateLinkToken: async () => ({ kind: "invalid" }),
  validateAppSession: async () => null,
  isEmailAllowedForApp: async () => true,
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
        apexBaseUrl: "https://quick.example.com",
        secureCookies: true,
      }),
    )
    .get("*", (c) => c.text("APP"));

describe("share gate", () => {
  test("apex is a no-op", async () => {
    const res = await build({ kind: "apex" }, resolver()).request(
      "https://acme.quick.example.com/",
    );
    expect(res.status).toBe(200);
  });

  test("google mode without an app session redirects to the apex /sso/grant with ?app and ?next", async () => {
    const res = await build({ kind: "app", app: appCtx("google") }, resolver()).request(
      "https://acme.quick.example.com/dash?x=1",
    );
    expect(res.status).toBe(302);
    const loc = res.headers.get("location") ?? "";
    expect(loc.startsWith("https://quick.example.com/sso/grant?")).toBe(true);
    expect(loc).toContain(`app=${encodeURIComponent("acme.quick.example.com")}`);
    expect(decodeURIComponent(loc)).toContain("next=/dash?x=1");
  });

  test("google mode with a valid app session admits the request and builds a user viewer", async () => {
    let seenAppId = "";
    const r = resolver({
      validateAppSession: async (appId) => {
        seenAppId = appId;
        return { userId: "u1", email: "a@b.co", name: "A" };
      },
    });
    const res = await build({ kind: "app", app: appCtx("google") }, r).request(
      "https://acme.quick.example.com/",
      { headers: { cookie: `${APP_SESSION_COOKIE}=tok` } },
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("APP");
    expect(seenAppId).toBe("app_1");
  });

  test("google mode with a valid session but an email off the per-app allowlist is denied (403) and not admitted", async () => {
    let recordedEvent = "";
    const r = resolver({
      validateAppSession: async () => ({ userId: "u1", email: "stranger@b.co", name: "S" }),
      isEmailAllowedForApp: async () => false,
      recordAccess: async (entry) => {
        recordedEvent = entry.event;
      },
    });
    const res = await build({ kind: "app", app: appCtx("google") }, r).request(
      "https://acme.quick.example.com/",
      { headers: { cookie: `${APP_SESSION_COOKIE}=tok`, "sec-fetch-dest": "document" } },
    );
    expect(res.status).toBe(403);
    expect(await res.text()).not.toBe("APP");
    expect(recordedEvent).toBe("denied");
  });

  test("google mode with a valid session whose email is on the per-app allowlist admits", async () => {
    let checkedEmail = "";
    const r = resolver({
      validateAppSession: async () => ({ userId: "u1", email: "client@b.co", name: "C" }),
      isEmailAllowedForApp: async (_appId, email) => {
        checkedEmail = email;
        return email === "client@b.co";
      },
    });
    const res = await build({ kind: "app", app: appCtx("google") }, r).request(
      "https://acme.quick.example.com/",
      { headers: { cookie: `${APP_SESSION_COOKIE}=tok` } },
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("APP");
    expect(checkedEmail).toBe("client@b.co");
  });

  test("google mode with a stale/invalid app session cookie redirects to grant (does not admit)", async () => {
    const res = await build(
      { kind: "app", app: appCtx("google") },
      resolver({ validateAppSession: async () => null }),
    ).request("https://acme.quick.example.com/", {
      headers: { cookie: `${APP_SESSION_COOKIE}=stale` },
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location") ?? "").toContain("/sso/grant");
  });

  test("google mode, no session, a non-navigation request is rejected 401 (not redirected to an HTML grant page)", async () => {
    const res = await build({ kind: "app", app: appCtx("google") }, resolver()).request(
      "https://acme.quick.example.com/data.json",
      { headers: { "sec-fetch-dest": "empty" } },
    );
    expect(res.status).toBe(401);
  });

  test("google mode, no session, an explicit document navigation still redirects to grant", async () => {
    const res = await build({ kind: "app", app: appCtx("google") }, resolver()).request(
      "https://acme.quick.example.com/",
      { headers: { "sec-fetch-dest": "document" } },
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location") ?? "").toContain("/sso/grant");
  });

  test("link mode without a token shows the link page (403)", async () => {
    const res = await build({ kind: "app", app: appCtx("link") }, resolver()).request(
      "https://acme.quick.example.com/",
    );
    expect(res.status).toBe(403);
  });

  test("link mode redeems ?t into a HOST-ONLY cookie and cleans the URL", async () => {
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
    expect(setCookie).toContain(`${LINK_COOKIE}=`);
    expect(setCookie.toLowerCase()).not.toContain("domain=");
  });

  test("link mode admits a request bearing a valid link cookie", async () => {
    const r = resolver({
      validateLinkToken: async () => ({
        kind: "valid",
        linkId: parseShareLinkId("lnk_1"),
        expiresAt: Date.now() + 3_600_000,
      }),
    });
    const res = await build({ kind: "app", app: appCtx("link") }, r).request(
      "https://acme.quick.example.com/",
      { headers: { cookie: `${LINK_COOKIE}=secret` } },
    );
    expect(res.status).toBe(200);
  });

  test("link mode with an expired token is denied", async () => {
    const r = resolver({ validateLinkToken: async () => ({ kind: "expired" }) });
    const res = await build({ kind: "app", app: appCtx("link") }, r).request(
      "https://acme.quick.example.com/?t=x",
    );
    expect(res.status).toBe(403);
  });
});
