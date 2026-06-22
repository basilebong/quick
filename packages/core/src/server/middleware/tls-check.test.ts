import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { parseAppId, parseAppSlug } from "../../shared/index.ts";
import type { AppContext, AppRegistry } from "../tenant.ts";
import { createTlsCheck } from "./tls-check.ts";

const ROOT = "quick.hightecc.com";

const appCtx = (slug: string): AppContext => ({
  id: parseAppId("app_1"),
  slug: parseAppSlug(slug),
  name: slug,
  shareMode: "google",
  currentDeploymentId: null,
});

const registry = (known: ReadonlySet<string>): AppRegistry => ({
  findBySlug: async (slug) => (known.has(slug) ? appCtx(slug) : null),
});

const build = (known: ReadonlySet<string> = new Set()) =>
  new Hono().get(
    "/_internal/tls-check",
    createTlsCheck({ rootDomain: ROOT, registry: registry(known) }),
  );

const ask = (app: ReturnType<typeof build>, domain: string | null) => {
  const q = domain === null ? "" : `?domain=${encodeURIComponent(domain)}`;
  return app.request(`http://127.0.0.1:8003/_internal/tls-check${q}`);
};

describe("on-demand TLS ask endpoint", () => {
  test("the apex domain is allowed", async () => {
    expect((await ask(build(), ROOT)).status).toBe(200);
  });

  test("a slug that resolves to a registered app is allowed (incl. before its first deploy)", async () => {
    expect((await ask(build(new Set(["acme"])), `acme.${ROOT}`)).status).toBe(200);
  });

  test("an unknown slug is refused", async () => {
    expect((await ask(build(new Set(["acme"])), `ghost.${ROOT}`)).status).toBe(404);
  });

  test("a foreign domain aimed at the IP is refused", async () => {
    expect((await ask(build(new Set(["acme"])), "evil.example.com")).status).toBe(404);
  });

  test("a reserved label is refused even if the registry would answer for it", async () => {
    expect((await ask(build(new Set(["www"])), `www.${ROOT}`)).status).toBe(404);
  });

  test("a multi-label host under the root is refused", async () => {
    expect((await ask(build(), `a.b.${ROOT}`)).status).toBe(404);
  });

  test("a missing domain param is refused", async () => {
    expect((await ask(build(), null)).status).toBe(404);
  });

  test("matching is case-insensitive", async () => {
    expect((await ask(build(new Set(["acme"])), "ACME.Quick.Hightecc.com")).status).toBe(200);
  });
});
