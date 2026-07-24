import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { parseAppId, parseAppSlug } from "../../shared/index.ts";
import type { AppContext, AppRegistry, TenantVariables } from "../tenant.ts";
import { createResolveApp } from "./resolve-app.ts";

const ctx = (over: Partial<AppContext> = {}): AppContext => ({
  id: parseAppId("app_1"),
  slug: parseAppSlug("acme"),
  name: "Acme",
  shareMode: "google",
  currentDeploymentId: null,
  archived: false,
  ...over,
});

const registry = (app: AppContext | null): AppRegistry => ({ findBySlug: async () => app });

const build = (reg: AppRegistry) =>
  new Hono<{ Variables: TenantVariables }>()
    .use("*", createResolveApp({ rootDomain: "quick.example.com", registry: reg }))
    .get("*", (c) => {
      const t = c.var.tenant;
      return c.json({ kind: t.kind, archived: t.kind === "app" ? t.app.archived : null });
    });

describe("resolve-app", () => {
  test("resolves a live app to its tenant", async () => {
    const res = await build(registry(ctx())).request("https://acme.quick.example.com/", {
      headers: { host: "acme.quick.example.com" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ kind: "app", archived: false });
  });

  test("an archived app 404s like an unknown slug and never becomes a tenant", async () => {
    const res = await build(registry(ctx({ archived: true }))).request(
      "https://acme.quick.example.com/",
      { headers: { host: "acme.quick.example.com" } },
    );
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type") ?? "").toContain("text/html");
    expect(await res.text()).toContain("No app here");
  });

  test("an unknown slug 404s", async () => {
    const res = await build(registry(null)).request("https://ghost.quick.example.com/", {
      headers: { host: "ghost.quick.example.com" },
    });
    expect(res.status).toBe(404);
  });

  test("the apex host resolves to apex without a registry lookup", async () => {
    const res = await build(registry(null)).request("https://quick.example.com/", {
      headers: { host: "quick.example.com" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ kind: "apex", archived: null });
  });
});
