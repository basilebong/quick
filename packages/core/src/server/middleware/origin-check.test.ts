import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { createOriginCheck } from "./origin-check.ts";

const app = new Hono().use("/_api/*", createOriginCheck()).get("/_api/x", (c) => c.text("OK"));

describe("origin check (/_api cross-app isolation)", () => {
  test("allows same-origin requests", async () => {
    const res = await app.request("/_api/x", { headers: { "sec-fetch-site": "same-origin" } });
    expect(res.status).toBe(200);
  });

  test("rejects same-site (another app on the same root domain)", async () => {
    const res = await app.request("/_api/x", { headers: { "sec-fetch-site": "same-site" } });
    expect(res.status).toBe(403);
  });

  test("rejects cross-site", async () => {
    const res = await app.request("/_api/x", { headers: { "sec-fetch-site": "cross-site" } });
    expect(res.status).toBe(403);
  });

  test("falls back to an Origin host check when Sec-Fetch metadata is absent", async () => {
    const ok = await app.request("https://acme.quick.example.com/_api/x", {
      headers: { origin: "https://acme.quick.example.com" },
    });
    expect(ok.status).toBe(200);
    const bad = await app.request("https://acme.quick.example.com/_api/x", {
      headers: { origin: "https://evil.quick.example.com" },
    });
    expect(bad.status).toBe(403);
  });
});
