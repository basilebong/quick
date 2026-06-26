import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuditRecorder } from "@quick/core/server";
import {
  type AppId,
  type ShareMode,
  type UserId,
  parseAppId,
  parseShareLinkId,
} from "@quick/core/shared";
import { match } from "ts-pattern";
import * as z from "zod";
import { type DeployFile, type HostingService, validateDeploymentFiles } from "../server/index.ts";
import { type HostingError, MAX_ALLOWED_EMAILS } from "../shared/index.ts";

// Canonical "how to build on Quick" guide. Surfaced two ways: the build_with_quick
// MCP prompt (user-invokable) and the server `instructions` (auto-surfaced), so the
// endpoint contracts live in exactly one place.
export const QUICK_BUILD_GUIDE = `# Building apps on Quick

Quick hosts static web apps. Each app is an immutable set of UTF-8 text files (HTML/CSS/JS/JSON), served at https://<slug>.<domain> on its own browser origin.

## Deploy and edit
- quick__deploy_files — publish or update an app. The file set MUST include index.html at the root; nested paths like assets/app.js are fine. Re-deploying a slug REPLACES the entire file set with a new immutable version, so always send EVERY file you want live, not just the ones you changed.
- quick__get_app_files — read an app's current files back before editing, then re-deploy the complete edited set. (Roll back to an earlier version from the dashboard.)
- Binary assets aren't supported through the tool; inline small ones as data: URIs, or upload them at runtime via file storage (below).

## Sharing
- google mode (default): anyone who signs in with Google can view; optionally restrict to specific addresses with quick__set_allowed_emails.
- link mode: access only via an expiring secret link from quick__create_share_link.

## Per-app backends (the building blocks)
A deployed app's own client-side JS can call two backends on its own origin with same-origin fetch (e.g. fetch("/_api/db/todos")). The signed-in viewer's session authorizes the request, so NEVER put API keys or tokens in the page. All data is scoped to that one app.

Document store — /_api/db/<collection>:
- GET    /_api/db/<collection>        -> { records }   list
- POST   /_api/db/<collection>        -> { record }    create (JSON body)
- GET    /_api/db/<collection>/<id>   -> { record }    read one
- PUT    /_api/db/<collection>/<id>   -> { record }    replace (JSON body)
- PATCH  /_api/db/<collection>/<id>   -> { record }    merge (JSON body)
- DELETE /_api/db/<collection>/<id>   -> { id }        delete

File storage — /_api/files:
- GET    /_api/files?prefix=<p>       -> { files }      list
- POST   /_api/files?path=<path>      -> { file }       upload (raw body + Content-Type header)
- GET    /_api/files/<path>           -> the file bytes
- DELETE /_api/files/<path>           -> { path }       delete

Prefer these building blocks over external services so apps stay self-contained. Build dynamic, stateful apps — not just static pages.`;

// All hosting tools are OWNER-only; mcp.ts only registers them when the MCP
// caller's identity is on the owner allowlist (any Google account can mint an
// MCP token, so this gate is essential).
export type HostingToolDeps = {
  service: HostingService;
  actor: UserId;
  audit: AuditRecorder;
  appUrl: (slug: string) => string;
};

const errorText = (e: HostingError): string =>
  match(e)
    .with({ kind: "not_found" }, () => "No such app.")
    .with({ kind: "invalid_input" }, (it) => it.message)
    .with({ kind: "conflict" }, (it) => it.message)
    .exhaustive();

const errorResult = (e: HostingError) => ({
  content: [{ type: "text" as const, text: errorText(e) }],
  isError: true,
});

const safely = async (label: string, p: Promise<void>): Promise<void> => {
  try {
    await p;
  } catch (e) {
    console.error(`hosting tool ${label} failed`, e);
  }
};

export const registerHostingTools = (server: McpServer, deps: HostingToolDeps): void => {
  const { service, actor, audit, appUrl } = deps;

  server.registerPrompt(
    "build_with_quick",
    {
      title: "Build an app with Quick",
      description:
        "How to create, deploy, edit, and share an app on Quick — including the per-app document database and file storage that deployed apps can call from their own client-side JS.",
    },
    () => ({
      messages: [
        { role: "user" as const, content: { type: "text" as const, text: QUICK_BUILD_GUIDE } },
      ],
    }),
  );

  server.registerTool(
    "quick__list_apps",
    {
      title: "List apps",
      description: "List all deployed apps with their share mode and current version.",
      inputSchema: {},
    },
    async () => {
      const apps = await service.listApps();
      await safely(
        "audit",
        audit.record({
          userId: actor,
          action: "quick__list_apps",
          via: "mcp",
          metadata: { count: apps.length },
        }),
      );
      const text =
        apps.length === 0
          ? "No apps yet."
          : apps.map((a) => `${a.slug} — ${a.name} [${a.shareMode}]`).join("\n");
      return { content: [{ type: "text" as const, text }], structuredContent: { apps } };
    },
  );

  server.registerTool(
    "quick__create_app",
    {
      title: "Create app",
      description:
        "Register a new app slug with a share mode (it has no deployment until you publish files with quick__deploy_files).",
      inputSchema: {
        slug: z.string().min(1).max(63),
        name: z.string().trim().min(1).max(80),
        shareMode: z.enum(["google", "link"]),
      },
    },
    async ({ slug, name, shareMode }) => {
      const r = await service.createApp({ slug, name, shareMode }, actor);
      if (r.kind === "err") return errorResult(r.error);
      await safely(
        "audit",
        audit.record({
          userId: actor,
          action: "quick__create_app",
          via: "mcp",
          metadata: { slug },
        }),
      );
      return {
        content: [{ type: "text" as const, text: `Created app "${slug}" (${shareMode}).` }],
        structuredContent: { app: r.value },
      };
    },
  );

  server.registerTool(
    "quick__deploy_files",
    {
      title: "Deploy an app from files",
      description:
        'Publish a static app from a set of UTF-8 text files and make it live immediately at its URL. The set must include an index.html at the root; other files (CSS, JS, JSON, nested paths like assets/app.js) are served alongside it. Creates the app if the slug is new (default share mode: google — any signed-in Google account can view; pass shareMode "link" for secret-link-only access). Re-deploying an existing slug REPLACES the entire file set with a new version and keeps the current share mode — send every file you want live, not just the ones you changed. Call quick__get_app_files first to fetch the current files when editing. Binary assets are not supported; inline small ones as data: URIs. Deployed apps can call their own per-app backends from client-side JS on the same origin — a JSON document store at /_api/db and file storage at /_api/files — so you can build dynamic, stateful apps, not just static pages.',
      inputSchema: {
        slug: z.string().min(1).max(63),
        files: z.array(z.object({ path: z.string().min(1), content: z.string() })).min(1),
        shareMode: z.enum(["google", "link"]).optional(),
      },
    },
    async ({ slug, files, shareMode }) => {
      const deployFiles: DeployFile[] = files.map((f) => ({
        path: f.path,
        bytes: new TextEncoder().encode(f.content),
      }));
      const invalid = validateDeploymentFiles(deployFiles);
      if (invalid !== null) return errorResult(invalid);

      const existing = await service.findBySlug(slug);
      let appId: AppId;
      let mode: ShareMode;
      if (existing === null) {
        const created = await service.createApp(
          { slug, name: slug, shareMode: shareMode ?? "google" },
          actor,
        );
        if (created.kind === "err") return errorResult(created.error);
        appId = parseAppId(created.value.id);
        mode = created.value.shareMode;
      } else {
        appId = existing.id;
        mode = existing.shareMode;
      }

      const r = await service.createDeployment(appId, deployFiles, actor);
      if (r.kind === "err") return errorResult(r.error);

      await safely(
        "audit",
        audit.record({
          userId: actor,
          action: "quick__deploy_files",
          via: "mcp",
          metadata: { slug, version: r.value.version, fileCount: r.value.fileCount },
        }),
      );
      const url = appUrl(slug);
      return {
        content: [
          {
            type: "text" as const,
            text: `Deployed v${r.value.version} of "${slug}" (${mode}, ${r.value.fileCount} files) → ${url}`,
          },
        ],
        structuredContent: { url, shareMode: mode, deployment: r.value },
      };
    },
  );

  server.registerTool(
    "quick__get_app_files",
    {
      title: "Get an app's files",
      description:
        "Read back the files of an app's current live deployment so you can edit them and re-deploy. Returns each text file's path and UTF-8 content. Deploys are full-replacement, so send the complete edited set back to quick__deploy_files. Binary files are listed by path only (content omitted).",
      inputSchema: { slug: z.string().min(1) },
    },
    async ({ slug }) => {
      const app = await service.findBySlug(slug);
      if (app === null) return errorResult({ kind: "not_found" });
      const raw = await service.readCurrentDeploymentFiles(app.id);
      const decoder = new TextDecoder("utf-8", { fatal: true });
      const files: { path: string; content: string }[] = [];
      const binaryFiles: string[] = [];
      for (const f of raw) {
        try {
          files.push({ path: f.path, content: decoder.decode(f.bytes) });
        } catch {
          binaryFiles.push(f.path);
        }
      }
      await safely(
        "audit",
        audit.record({
          userId: actor,
          action: "quick__get_app_files",
          via: "mcp",
          metadata: { slug, fileCount: files.length },
        }),
      );
      const text =
        raw.length === 0
          ? `No deployment yet for "${slug}".`
          : `${files.length} file(s) in "${slug}":\n${files.map((f) => f.path).join("\n")}${
              binaryFiles.length > 0 ? `\n(binary, omitted: ${binaryFiles.join(", ")})` : ""
            }`;
      return {
        content: [{ type: "text" as const, text }],
        structuredContent: { slug, files, binaryFiles },
      };
    },
  );

  server.registerTool(
    "quick__set_allowed_emails",
    {
      title: "Set allowed emails",
      description:
        "Set the viewer email allowlist for a google-mode app (replaces the current list). Only these Google accounts may view it. Pass an empty list to allow any signed-in Google account.",
      inputSchema: {
        slug: z.string().min(1),
        emails: z.array(z.string().trim().email().max(254)).max(MAX_ALLOWED_EMAILS),
      },
    },
    async ({ slug, emails }) => {
      const app = await service.findBySlug(slug);
      if (app === null) return errorResult({ kind: "not_found" });
      const r = await service.updateApp(app.id, { allowedEmails: emails });
      if (r.kind === "err") return errorResult(r.error);
      await safely(
        "audit",
        audit.record({
          userId: actor,
          action: "quick__set_allowed_emails",
          via: "mcp",
          metadata: { slug, count: r.value.allowedEmails.length },
        }),
      );
      const text =
        r.value.allowedEmails.length === 0
          ? `Cleared the allowlist for ${slug}; any signed-in Google account can view it.`
          : `${slug} is now restricted to ${r.value.allowedEmails.length} email(s).`;
      return {
        content: [{ type: "text" as const, text }],
        structuredContent: { slug, allowedEmails: r.value.allowedEmails },
      };
    },
  );

  server.registerTool(
    "quick__list_share_links",
    {
      title: "List share links",
      description: "List the share links for an app by slug.",
      inputSchema: { slug: z.string().min(1) },
    },
    async ({ slug }) => {
      const app = await service.findBySlug(slug);
      if (app === null) return errorResult({ kind: "not_found" });
      const links = await service.listLinks(app.id);
      await safely(
        "audit",
        audit.record({
          userId: actor,
          action: "quick__list_share_links",
          via: "mcp",
          metadata: { slug, count: links.length },
        }),
      );
      return {
        content: [{ type: "text" as const, text: `${links.length} link(s) for ${slug}.` }],
        structuredContent: { links },
      };
    },
  );

  server.registerTool(
    "quick__create_share_link",
    {
      title: "Create share link",
      description: "Create an expiring secret link for an app (link-mode sharing, no sign-in).",
      inputSchema: {
        slug: z.string().min(1),
        expiresInHours: z.number().int().min(1).max(8760),
        label: z.string().trim().max(80).optional(),
      },
    },
    async ({ slug, expiresInHours, label }) => {
      const app = await service.findBySlug(slug);
      if (app === null) return errorResult({ kind: "not_found" });
      const r = await service.createLink(
        app.id,
        { label: label ?? "", expiresAt: Date.now() + expiresInHours * 3_600_000 },
        actor,
      );
      if (r.kind === "err") return errorResult(r.error);
      await safely(
        "audit",
        audit.record({
          userId: actor,
          action: "quick__create_share_link",
          via: "mcp",
          metadata: { slug, linkId: r.value.link.id },
        }),
      );
      const url = `${appUrl(slug)}/?t=${r.value.token}`;
      return {
        content: [{ type: "text" as const, text: `Share link (one-time, save it now): ${url}` }],
        structuredContent: { url, link: r.value.link },
      };
    },
  );

  server.registerTool(
    "quick__revoke_share_link",
    {
      title: "Revoke share link",
      description: "Revoke a share link by app slug and link id.",
      inputSchema: { slug: z.string().min(1), linkId: z.string().min(1) },
    },
    async ({ slug, linkId }) => {
      const app = await service.findBySlug(slug);
      if (app === null) return errorResult({ kind: "not_found" });
      const r = await service.revokeLink(app.id, parseShareLinkId(linkId));
      if (r.kind === "err") return errorResult(r.error);
      await safely(
        "audit",
        audit.record({
          userId: actor,
          action: "quick__revoke_share_link",
          via: "mcp",
          metadata: { slug, linkId },
        }),
      );
      return {
        content: [{ type: "text" as const, text: `Revoked link ${linkId} for ${slug}.` }],
        structuredContent: { id: r.value.id },
      };
    },
  );
};
