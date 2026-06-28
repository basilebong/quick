import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type Auth, createAuditRecorder } from "@quick/core/server";
import { withTestAuth } from "@quick/core/server/test";
import { parseAppId, parseUserId } from "@quick/core/shared";
import * as v from "valibot";
import { DEPLOY_MAX_TOTAL_BYTES } from "../server/deploy.ts";
import { createHostingService } from "../server/index.ts";
import { QUICK_BUILD_GUIDE, registerHostingTools } from "./index.ts";

type Ctx = { auth: Auth; db: Parameters<typeof createHostingService>[0] };

const setup = async (ctx: Ctx) => {
  const appsDir = mkdtempSync(join(tmpdir(), "quick-deploy-files-"));
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

  return { appsDir, service, client, actor };
};

const textOf = (content: Awaited<ReturnType<Client["callTool"]>>["content"]): string => {
  if (!Array.isArray(content)) return "";
  const block = content[0];
  return block !== undefined && block.type === "text" ? block.text : "";
};

const allTextOf = (content: Awaited<ReturnType<Client["callTool"]>>["content"]): string => {
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (block.type === "text") parts.push(block.text);
  }
  return parts.join("\n");
};

const file = (path: string, content: string) => ({ path, content });

const FileMapResultSchema = v.object({
  files: v.array(v.object({ path: v.string(), size: v.number() })),
});

const FileResultSchema = v.object({
  slug: v.string(),
  path: v.string(),
  content: v.string(),
});

const LinksResultSchema = v.object({
  links: v.array(v.object({ id: v.string(), label: v.string() })),
});

describe("quick__deploy_files", () => {
  test("publishes multiple files to a new slug and serves them immediately", async () => {
    await withTestAuth({}, async (ctx) => {
      const h = await setup(ctx);

      const res = await h.client.callTool({
        name: "quick__deploy_files",
        arguments: {
          slug: "landing",
          files: [
            file("index.html", "<!doctype html><title>Hi</title><script src=app.js></script>"),
            file("app.js", "console.log('hello')"),
            file("assets/style.css", "body{color:red}"),
          ],
        },
      });

      expect(res.isError ?? false).toBe(false);
      expect(textOf(res.content)).toContain("https://landing.quick.example.com");
      expect(textOf(res.content)).toContain("v1");
      expect(textOf(res.content)).toContain("3 files");
      expect(res.structuredContent).toMatchObject({ shareMode: "google" });

      const app = await h.service.findBySlug("landing");
      expect(app?.shareMode).toBe("google");
      const depId = app?.currentDeploymentId;
      if (depId == null) throw new Error("no deployment recorded");
      expect(readFileSync(join(h.appsDir, "landing", depId, "app.js"), "utf8")).toBe(
        "console.log('hello')",
      );
      expect(readFileSync(join(h.appsDir, "landing", depId, "assets", "style.css"), "utf8")).toBe(
        "body{color:red}",
      );
    });
  });

  test("creates the app in the requested share mode", async () => {
    await withTestAuth({}, async (ctx) => {
      const h = await setup(ctx);

      const res = await h.client.callTool({
        name: "quick__deploy_files",
        arguments: {
          slug: "secret",
          files: [file("index.html", "<!doctype html>secret")],
          shareMode: "link",
        },
      });

      expect(res.isError ?? false).toBe(false);
      expect((await h.service.findBySlug("secret"))?.shareMode).toBe("link");
    });
  });

  test("re-deploying replaces the file set, bumps version, and keeps share mode", async () => {
    await withTestAuth({}, async (ctx) => {
      const h = await setup(ctx);

      await h.client.callTool({
        name: "quick__deploy_files",
        arguments: {
          slug: "site",
          files: [file("index.html", "<!doctype html>v1"), file("old.js", "1")],
          shareMode: "link",
        },
      });
      const first = await h.service.findBySlug("site");

      const res = await h.client.callTool({
        name: "quick__deploy_files",
        arguments: {
          slug: "site",
          files: [file("index.html", "<!doctype html>v2")],
          shareMode: "google",
        },
      });

      expect(res.isError ?? false).toBe(false);
      expect(textOf(res.content)).toContain("v2");
      expect(textOf(res.content)).toContain("(link,");
      expect(res.structuredContent).toMatchObject({ shareMode: "link" });

      const second = await h.service.findBySlug("site");
      expect(second?.shareMode).toBe("link");
      const depId = second?.currentDeploymentId;
      if (depId == null) throw new Error("no deployment recorded");
      expect(second?.currentDeploymentId).not.toBe(first?.currentDeploymentId);
      expect(readFileSync(join(h.appsDir, "site", depId, "index.html"), "utf8")).toBe(
        "<!doctype html>v2",
      );
    });
  });

  test("rejects a deployment with no index.html without creating an app", async () => {
    await withTestAuth({}, async (ctx) => {
      const h = await setup(ctx);

      const res = await h.client.callTool({
        name: "quick__deploy_files",
        arguments: { slug: "noindex", files: [file("home.html", "<!doctype html>x")] },
      });

      expect(res.isError ?? false).toBe(true);
      expect(await h.service.findBySlug("noindex")).toBeNull();
    });
  });

  test("rejects an unsafe file path without creating an app", async () => {
    await withTestAuth({}, async (ctx) => {
      const h = await setup(ctx);

      const res = await h.client.callTool({
        name: "quick__deploy_files",
        arguments: {
          slug: "escape",
          files: [file("index.html", "<!doctype html>x"), file("../escape.html", "x")],
        },
      });

      expect(res.isError ?? false).toBe(true);
      expect(await h.service.findBySlug("escape")).toBeNull();
    });
  });

  test("rejects a reserved slug without creating an app", async () => {
    await withTestAuth({}, async (ctx) => {
      const h = await setup(ctx);

      const res = await h.client.callTool({
        name: "quick__deploy_files",
        arguments: { slug: "mcp", files: [file("index.html", "<!doctype html>x")] },
      });

      expect(res.isError ?? false).toBe(true);
      expect(await h.service.findBySlug("mcp")).toBeNull();
    });
  });

  test("rejects an oversized deployment and leaves the live deployment untouched", async () => {
    await withTestAuth({}, async (ctx) => {
      const h = await setup(ctx);

      await h.client.callTool({
        name: "quick__deploy_files",
        arguments: { slug: "big", files: [file("index.html", "<!doctype html>ok")] },
      });
      const before = await h.service.findBySlug("big");
      if (before === null) throw new Error("app not created");
      const live = before.currentDeploymentId;

      const res = await h.client.callTool({
        name: "quick__deploy_files",
        arguments: {
          slug: "big",
          files: [file("index.html", "x".repeat(DEPLOY_MAX_TOTAL_BYTES + 1))],
        },
      });

      expect(res.isError ?? false).toBe(true);
      const after = await h.service.findBySlug("big");
      expect(after?.currentDeploymentId).toBe(live);
      expect((await h.service.listDeployments(before.id)).length).toBe(1);
    });
  });
});

describe("quick__list_app_files", () => {
  test("returns the file map (paths + sizes) without contents", async () => {
    await withTestAuth({}, async (ctx) => {
      const h = await setup(ctx);
      await h.client.callTool({
        name: "quick__deploy_files",
        arguments: {
          slug: "editable",
          files: [file("index.html", "<h1>hi</h1>"), file("assets/app.js", "const a = 1")],
        },
      });

      const res = await h.client.callTool({
        name: "quick__list_app_files",
        arguments: { slug: "editable" },
      });

      expect(res.isError ?? false).toBe(false);
      const { files } = v.parse(FileMapResultSchema, res.structuredContent);
      const byPath = new Map(files.map((f) => [f.path, f.size]));
      expect(byPath.get("index.html")).toBe(new TextEncoder().encode("<h1>hi</h1>").byteLength);
      expect(byPath.get("assets/app.js")).toBe(new TextEncoder().encode("const a = 1").byteLength);
      const text = allTextOf(res.content);
      expect(text).toContain("index.html");
      expect(text).toContain("assets/app.js");
    });
  });

  test("an unknown slug errors", async () => {
    await withTestAuth({}, async (ctx) => {
      const h = await setup(ctx);
      const res = await h.client.callTool({
        name: "quick__list_app_files",
        arguments: { slug: "ghost" },
      });
      expect(res.isError ?? false).toBe(true);
    });
  });

  test("an app with no deployment returns no files", async () => {
    await withTestAuth({}, async (ctx) => {
      const h = await setup(ctx);
      const created = await h.service.createApp(
        { slug: "empty", name: "empty", shareMode: "google" },
        h.actor,
      );
      if (created.kind !== "ok") throw new Error("createApp failed");

      const res = await h.client.callTool({
        name: "quick__list_app_files",
        arguments: { slug: "empty" },
      });

      expect(res.isError ?? false).toBe(false);
      expect(res.structuredContent).toMatchObject({ files: [] });
    });
  });
});

describe("quick__get_app_file", () => {
  test("returns one file's body in BOTH the text content channel and structuredContent", async () => {
    await withTestAuth({}, async (ctx) => {
      const h = await setup(ctx);
      await h.client.callTool({
        name: "quick__deploy_files",
        arguments: {
          slug: "editable",
          files: [file("index.html", "<h1>hi</h1>"), file("assets/app.js", "const a = 1")],
        },
      });

      const res = await h.client.callTool({
        name: "quick__get_app_file",
        arguments: { slug: "editable", path: "assets/app.js" },
      });

      expect(res.isError ?? false).toBe(false);
      const parsed = v.parse(FileResultSchema, res.structuredContent);
      expect(parsed.content).toBe("const a = 1");
      expect(allTextOf(res.content)).toContain("const a = 1");
    });
  });

  test("an unknown slug errors", async () => {
    await withTestAuth({}, async (ctx) => {
      const h = await setup(ctx);
      const res = await h.client.callTool({
        name: "quick__get_app_file",
        arguments: { slug: "ghost", path: "index.html" },
      });
      expect(res.isError ?? false).toBe(true);
    });
  });

  test("a missing file errors", async () => {
    await withTestAuth({}, async (ctx) => {
      const h = await setup(ctx);
      await h.client.callTool({
        name: "quick__deploy_files",
        arguments: { slug: "site", files: [file("index.html", "<h1>hi</h1>")] },
      });
      const res = await h.client.callTool({
        name: "quick__get_app_file",
        arguments: { slug: "site", path: "missing.js" },
      });
      expect(res.isError ?? false).toBe(true);
    });
  });

  test("a traversal path errors", async () => {
    await withTestAuth({}, async (ctx) => {
      const h = await setup(ctx);
      await h.client.callTool({
        name: "quick__deploy_files",
        arguments: { slug: "site", files: [file("index.html", "<h1>hi</h1>")] },
      });
      const res = await h.client.callTool({
        name: "quick__get_app_file",
        arguments: { slug: "site", path: "../../etc/passwd" },
      });
      expect(res.isError ?? false).toBe(true);
    });
  });

  test("a binary file errors (no UTF-8 text)", async () => {
    await withTestAuth({}, async (ctx) => {
      const h = await setup(ctx);
      const created = await h.service.createApp(
        { slug: "mixed", name: "mixed", shareMode: "google" },
        h.actor,
      );
      if (created.kind !== "ok") throw new Error("createApp failed");
      await h.service.createDeployment(
        parseAppId(created.value.id),
        [
          { path: "index.html", bytes: new TextEncoder().encode("<h1>x</h1>") },
          { path: "logo.png", bytes: new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x01]) },
        ],
        h.actor,
      );

      const res = await h.client.callTool({
        name: "quick__get_app_file",
        arguments: { slug: "mixed", path: "logo.png" },
      });
      expect(res.isError ?? false).toBe(true);
    });
  });
});

describe("quick__list_share_links", () => {
  test("surfaces link ids and labels in the text content channel, not just the count", async () => {
    await withTestAuth({}, async (ctx) => {
      const h = await setup(ctx);
      await h.client.callTool({
        name: "quick__deploy_files",
        arguments: {
          slug: "shared",
          files: [file("index.html", "<!doctype html>x")],
          shareMode: "link",
        },
      });

      const created = await h.client.callTool({
        name: "quick__create_share_link",
        arguments: { slug: "shared", expiresInHours: 24, label: "press kit" },
      });
      expect(created.isError ?? false).toBe(false);

      const res = await h.client.callTool({
        name: "quick__list_share_links",
        arguments: { slug: "shared" },
      });
      expect(res.isError ?? false).toBe(false);
      const { links } = v.parse(LinksResultSchema, res.structuredContent);
      const link = links[0];
      if (link === undefined) throw new Error("expected one link");
      const text = allTextOf(res.content);
      expect(text).toContain(link.id);
      expect(text).toContain("press kit");
      expect(text).toContain("active");
    });
  });
});

describe("quick__set_allowed_emails", () => {
  const deploy = (
    client: Awaited<ReturnType<typeof setup>>["client"],
    slug: string,
    mode?: string,
  ) =>
    client.callTool({
      name: "quick__deploy_files",
      arguments: {
        slug,
        files: [file("index.html", "<!doctype html>x")],
        ...(mode === undefined ? {} : { shareMode: mode }),
      },
    });

  test("restricts a google app, normalizes, and clears", async () => {
    await withTestAuth({}, async (ctx) => {
      const h = await setup(ctx);
      await deploy(h.client, "client-app");
      const app = await h.service.findBySlug("client-app");
      if (app === null) throw new Error("app not created");

      const set = await h.client.callTool({
        name: "quick__set_allowed_emails",
        arguments: { slug: "client-app", emails: ["  Client@Example.com  ", "client@example.com"] },
      });
      expect(set.isError ?? false).toBe(false);
      expect(set.structuredContent).toMatchObject({ allowedEmails: ["client@example.com"] });
      expect(await h.service.isEmailAllowedForApp(app.id, "client@example.com")).toBe(true);
      expect(await h.service.isEmailAllowedForApp(app.id, "stranger@example.com")).toBe(false);

      const cleared = await h.client.callTool({
        name: "quick__set_allowed_emails",
        arguments: { slug: "client-app", emails: [] },
      });
      expect(cleared.isError ?? false).toBe(false);
      expect(await h.service.isEmailAllowedForApp(app.id, "stranger@example.com")).toBe(true);
    });
  });

  test("refuses a non-google app", async () => {
    await withTestAuth({}, async (ctx) => {
      const h = await setup(ctx);
      await deploy(h.client, "secret-app", "link");
      const res = await h.client.callTool({
        name: "quick__set_allowed_emails",
        arguments: { slug: "secret-app", emails: ["a@b.com"] },
      });
      expect(res.isError ?? false).toBe(true);
    });
  });

  test("on an unknown slug errors", async () => {
    await withTestAuth({}, async (ctx) => {
      const h = await setup(ctx);
      const res = await h.client.callTool({
        name: "quick__set_allowed_emails",
        arguments: { slug: "ghost", emails: ["a@b.com"] },
      });
      expect(res.isError ?? false).toBe(true);
    });
  });
});

describe("build_with_quick prompt", () => {
  test("is registered and documents the deploy loop and building blocks", async () => {
    await withTestAuth({}, async (ctx) => {
      const h = await setup(ctx);

      const list = await h.client.listPrompts();
      expect(list.prompts.map((p) => p.name)).toContain("build_with_quick");

      const got = await h.client.getPrompt({ name: "build_with_quick" });
      const msg = got.messages[0];
      if (msg === undefined || msg.content.type !== "text") {
        throw new Error("expected a text prompt message");
      }
      expect(msg.content.text).toContain("quick__deploy_files");
      expect(msg.content.text).toContain("quick__list_app_files");
      expect(msg.content.text).toContain("quick__get_app_file");
      expect(msg.content.text).toContain("/_api/db");
      expect(msg.content.text).toContain("/_api/files");
      expect(msg.content.text).toContain("dropped on the next deploy");
    });
  });

  // Guards against the guide drifting out of sync with the tool surface: a new
  // app-author-facing tool must be named in QUICK_BUILD_GUIDE (or, if it's a
  // management-only tool, added to the omit set below). See .claude/rules/tools.md.
  test("every registered tool is documented in the guide or explicitly omitted", async () => {
    await withTestAuth({}, async (ctx) => {
      const h = await setup(ctx);
      const omittedFromGuide = new Set([
        "quick__list_apps",
        "quick__create_app",
        "quick__list_share_links",
        "quick__revoke_share_link",
      ]);
      const documentedNames = new Set(QUICK_BUILD_GUIDE.split(/[^a-zA-Z0-9_-]+/));
      const { tools } = await h.client.listTools();
      const undocumented = tools
        .map((t) => t.name)
        .filter((name) => !omittedFromGuide.has(name) && !documentedNames.has(name));
      expect(undocumented).toEqual([]);
    });
  });
});
