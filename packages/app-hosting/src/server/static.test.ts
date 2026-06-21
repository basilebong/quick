import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TenantVariables } from "@quick/core/server";
import { parseAppId, parseAppSlug, parseDeploymentId } from "@quick/core/shared";
import { Hono } from "hono";
import { createServeAppStatic } from "./static.ts";

const build = (appsDir: string) =>
  new Hono<{ Variables: TenantVariables }>()
    .use("*", (c, next) => {
      c.set("tenant", {
        kind: "app",
        app: {
          id: parseAppId("app_a"),
          slug: parseAppSlug("acme"),
          name: "Acme",
          shareMode: "link",
          currentDeploymentId: parseDeploymentId("dep_1"),
        },
      });
      return next();
    })
    .get("*", createServeAppStatic({ appsDir }));

describe("served app error responses carry the isolation headers", () => {
  test("a 404 (missing file, no index) still sets X-Frame-Options and frame-ancestors", async () => {
    const app = build(mkdtempSync(join(tmpdir(), "quick-st-")));
    const res = await app.request("/missing.txt");
    expect(res.status).toBe(404);
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy") ?? "").toContain("frame-ancestors 'none'");
  });
});
