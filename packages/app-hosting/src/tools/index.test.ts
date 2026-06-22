import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type Auth, createAuditRecorder } from "@quick/core/server";
import { withTestAuth } from "@quick/core/server/test";
import { parseUserId } from "@quick/core/shared";
import { createHostingService } from "../server/index.ts";
import { registerHostingTools } from "./index.ts";

type Ctx = { auth: Auth; db: Parameters<typeof createHostingService>[0] };

const setup = async (ctx: Ctx) => {
  const appsDir = mkdtempSync(join(tmpdir(), "quick-deploy-html-"));
  const service = createHostingService(ctx.db, { appsDir });
  const audit = createAuditRecorder(ctx.db);
  const authCtx = await ctx.auth.$context;
  const user = await authCtx.internalAdapter.createUser({ name: "Owner", email: "o@example.com" });
  const actor = parseUserId(user.id);

  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerHostingTools(server, {
    service,
    actor,
    audit,
    appUrl: (slug) => `https://${slug}.quick.example.com`,
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return { appsDir, service, client };
};

const textOf = (content: Awaited<ReturnType<Client["callTool"]>>["content"]): string => {
  if (!Array.isArray(content)) return "";
  const block = content[0];
  return block !== undefined && block.type === "text" ? block.text : "";
};

describe("quick__deploy_html", () => {
  test("publishes a single HTML page to a new slug and serves it immediately", async () => {
    await withTestAuth({}, async (ctx) => {
      const h = await setup(ctx);
      const html = "<!doctype html><title>Hi</title><h1>hello world</h1>";

      const res = await h.client.callTool({
        name: "quick__deploy_html",
        arguments: { slug: "landing", html },
      });

      expect(res.isError ?? false).toBe(false);
      expect(textOf(res.content)).toContain("https://landing.quick.example.com");
      expect(textOf(res.content)).toContain("v1");

      const app = await h.service.findBySlug("landing");
      expect(app).not.toBeNull();
      expect(app?.shareMode).toBe("google");
      const depId = app?.currentDeploymentId;
      expect(depId == null).toBe(false);
      if (depId == null) throw new Error("no deployment recorded");
      expect(readFileSync(join(h.appsDir, "landing", depId, "index.html"), "utf8")).toBe(html);
    });
  });

  test("creates the app in the requested share mode", async () => {
    await withTestAuth({}, async (ctx) => {
      const h = await setup(ctx);

      const res = await h.client.callTool({
        name: "quick__deploy_html",
        arguments: { slug: "secret", html: "<!doctype html>secret", shareMode: "link" },
      });

      expect(res.isError ?? false).toBe(false);
      expect((await h.service.findBySlug("secret"))?.shareMode).toBe("link");
    });
  });

  test("re-deploying an existing slug adds a version and leaves share mode untouched", async () => {
    await withTestAuth({}, async (ctx) => {
      const h = await setup(ctx);

      await h.client.callTool({
        name: "quick__deploy_html",
        arguments: { slug: "site", html: "<!doctype html>v1", shareMode: "link" },
      });
      const first = await h.service.findBySlug("site");

      const res = await h.client.callTool({
        name: "quick__deploy_html",
        arguments: { slug: "site", html: "<!doctype html>v2", shareMode: "google" },
      });

      expect(res.isError ?? false).toBe(false);
      expect(textOf(res.content)).toContain("v2");

      const second = await h.service.findBySlug("site");
      expect(second?.shareMode).toBe("link");
      expect(second?.currentDeploymentId).not.toBe(first?.currentDeploymentId);
      const depId = second?.currentDeploymentId;
      if (depId == null) throw new Error("no deployment recorded");
      expect(readFileSync(join(h.appsDir, "site", depId, "index.html"), "utf8")).toBe(
        "<!doctype html>v2",
      );
    });
  });

  test("rejects a reserved slug without creating an app", async () => {
    await withTestAuth({}, async (ctx) => {
      const h = await setup(ctx);

      const res = await h.client.callTool({
        name: "quick__deploy_html",
        arguments: { slug: "mcp", html: "<!doctype html>x" },
      });

      expect(res.isError ?? false).toBe(true);
      expect(await h.service.findBySlug("mcp")).toBeNull();
    });
  });
});
