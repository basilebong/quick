import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { createOriginCheck } from "./origin-check.ts";

const app = new Hono().use("*", createOriginCheck()).all("/x", (c) => c.text("OK"));

const COOKIE = "quick_app_sess=abc";

describe("origin check (CSRF / cross-app isolation)", () => {
  test("allows same-origin cookie-bearing requests", async () => {
    const res = await app.request("/x", {
      headers: { cookie: COOKIE, "sec-fetch-site": "same-origin" },
    });
    expect(res.status).toBe(200);
  });

  test("rejects same-site (sibling app on the same root domain)", async () => {
    const res = await app.request("/x", {
      headers: { cookie: COOKIE, "sec-fetch-site": "same-site" },
    });
    expect(res.status).toBe(403);
  });

  test("rejects cross-site", async () => {
    const res = await app.request("/x", {
      headers: { cookie: COOKIE, "sec-fetch-site": "cross-site" },
    });
    expect(res.status).toBe(403);
  });

  test("falls back to an Origin host check when Sec-Fetch metadata is absent", async () => {
    const ok = await app.request("https://acme.quick.example.com/x", {
      headers: { cookie: COOKIE, origin: "https://acme.quick.example.com" },
    });
    expect(ok.status).toBe(200);
    const bad = await app.request("https://acme.quick.example.com/x", {
      headers: { cookie: COOKIE, origin: "https://evil.quick.example.com" },
    });
    expect(bad.status).toBe(403);
  });

  test("fails CLOSED when a cookie is present but no Sec-Fetch/Origin/Referer is", async () => {
    const res = await app.request("/x", { method: "POST", headers: { cookie: COOKIE } });
    expect(res.status).toBe(403);
  });

  test("skips the check when no cookie is present (no CSRF vector — e.g. the Bearer CLI)", async () => {
    const res = await app.request("/x", {
      method: "POST",
      headers: { authorization: "Bearer quick_pat_x", "sec-fetch-site": "cross-site" },
    });
    expect(res.status).toBe(200);
  });

  test("skips preflight OPTIONS", async () => {
    const res = await app.request("/x", {
      method: "OPTIONS",
      headers: { cookie: COOKIE, "sec-fetch-site": "cross-site" },
    });
    expect(res.status).toBe(200);
  });
});
