import { describe, expect, test } from "bun:test";
import { withTestAuth } from "../test/with-test-auth.ts";

describe("auth (integration)", () => {
  test("handler responds to /api/auth/get-session with a null session for an anonymous request", async () => {
    await withTestAuth({}, async ({ auth }) => {
      const res = await auth.handler(new Request("http://localhost:5173/api/auth/get-session"));
      expect(res.status).toBe(200);
      expect(await res.json()).toBeNull();
    });
  });

  // Owner gating is intentionally NOT enforced at sign-up: any Google account may
  // create a user (so it can view a "google"-mode app). Owner-only access is
  // enforced per-request by createRequireOwner against the owner allowlist.
  test("any email may be created (no allowlist gate at sign-up)", async () => {
    await withTestAuth({}, async ({ auth }) => {
      const ctx = await auth.$context;
      const user = await ctx.internalAdapter.createUser({
        name: "Stranger",
        email: "stranger@example.com",
      });
      expect(user.email).toBe("stranger@example.com");
      expect(user.id).toBeString();
    });
  });

  // security.md (load-bearing): the apex session cookie must be HOST-ONLY — never
  // scoped to the parent domain — so it is never sent to a tenant subdomain. And
  // tenant subdomains (same-site, untrusted) must not be trusted origins.
  test("session cookie carries no Domain attribute and no subdomain is a trusted origin", async () => {
    await withTestAuth({ baseURL: "https://quick.example.com" }, async ({ auth }) => {
      const ctx = await auth.$context;
      expect(ctx.authCookies.sessionToken.attributes.domain).toBeUndefined();
      expect(ctx.trustedOrigins.some((o) => o.includes("*"))).toBe(false);
      expect(ctx.trustedOrigins).toContain("https://quick.example.com");
    });
  });
});
