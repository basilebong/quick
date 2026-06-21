import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuditRecorder } from "@quick/core/server";
import { type UserId, parseShareLinkId } from "@quick/core/shared";
import { match } from "ts-pattern";
import * as z from "zod";
import type { HostingService } from "../server/index.ts";
import type { HostingError } from "../shared/index.ts";

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
        "Register a new app slug with a share mode (it has no deployment until you run `quick deploy`).",
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
