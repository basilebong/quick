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
import { LINK_COOKIE, type SessionReader, createShareGate } from "./share-gate.ts";

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

const noSession: SessionReader = { getSession: async () => null };
const ownerSession: SessionReader = {
  getSession: async () => ({ user: { id: "u1", email: "a@b.co", name: "A" } }),
};

const build = (tenant: Tenant, r: ShareResolver, session: SessionReader) =>
  new Hono<{ Variables: TenantVariables & ViewerVariables }>()
    .use("*", (c, next) => {
      c.set("tenant", tenant);
      return next();
    })
    .use(
      "*",
      createShareGate({
        resolver: r,
        session,
        apexBaseUrl: "https://quick.example.com",
        signInPath: "/sign-in",
        secureCookies: true,
      }),
    )
    .get("*", (c) => c.text("APP"));

describe("share gate", () => {
  test("apex is a no-op", async () => {
    const res = await build({ kind: "apex" }, resolver(), noSession).request(
      "https://acme.quick.example.com/",
    );
    expect(res.status).toBe(200);
  });

  test("google mode without a session redirects to apex sign-in with ?next", async () => {
    const res = await build({ kind: "app", app: appCtx("google") }, resolver(), noSession).request(
      "https://acme.quick.example.com/dash",
    );
    expect(res.status).toBe(302);
    const loc = res.headers.get("location") ?? "";
    expect(loc.startsWith("https://quick.example.com/sign-in?next=")).toBe(true);
    expect(decodeURIComponent(loc)).toContain("https://acme.quick.example.com/dash");
  });

  test("google mode with a Better Auth session admits the request", async () => {
    const res = await build(
      { kind: "app", app: appCtx("google") },
      resolver(),
      ownerSession,
    ).request("https://acme.quick.example.com/");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("APP");
  });

  test("link mode without a token shows the link page (403)", async () => {
    const res = await build({ kind: "app", app: appCtx("link") }, resolver(), noSession).request(
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
    const res = await build({ kind: "app", app: appCtx("link") }, r, noSession).request(
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
    const res = await build({ kind: "app", app: appCtx("link") }, r, noSession).request(
      "https://acme.quick.example.com/",
      { headers: { cookie: `${LINK_COOKIE}=secret` } },
    );
    expect(res.status).toBe(200);
  });

  test("link mode with an expired token is denied", async () => {
    const r = resolver({ validateLinkToken: async () => ({ kind: "expired" }) });
    const res = await build({ kind: "app", app: appCtx("link") }, r, noSession).request(
      "https://acme.quick.example.com/?t=x",
    );
    expect(res.status).toBe(403);
  });
});
