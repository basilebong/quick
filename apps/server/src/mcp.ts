import type { HostingService } from "@quick/app-hosting/server";
import { QUICK_BUILD_GUIDE, registerHostingTools } from "@quick/app-hosting/tools";
import {
  type AuditRecorder,
  createAuthServerMetadataHandler,
  createMcpAuthGuard,
  createProtectedResourceMetadataHandler,
  deriveMcpAuthConfig,
  mcpHostGuard,
  runMcpRequest,
} from "@quick/core/server";
import type { UserId } from "@quick/core/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";

export type McpDeps = {
  baseURL: string;
  jwksOrigin: string;
  allowedHosts: readonly string[];
  hosting: HostingService;
  audit: AuditRecorder;
  isOwner: (actor: UserId) => Promise<boolean>;
  appUrl: (slug: string) => string;
};

export const mountMcp = (deps: McpDeps) => {
  const config = deriveMcpAuthConfig(deps.baseURL, deps.jwksOrigin);
  // Owner-gated: any Google account can mint an MCP token, so we only expose the
  // hosting tools — and the build guide that documents them — when the token's
  // subject is on the owner allowlist. A non-owner gets a bare, capability-less server.
  const handle = createMcpAuthGuard(config)(async (req, actor) => {
    const owner = await deps.isOwner(actor);
    return runMcpRequest(
      (server) => {
        if (owner) {
          registerHostingTools(server, {
            service: deps.hosting,
            actor,
            audit: deps.audit,
            appUrl: deps.appUrl,
          });
        }
      },
      req,
      owner ? { instructions: QUICK_BUILD_GUIDE } : undefined,
    );
  });

  const authServerMetadata = createAuthServerMetadataHandler(deps.baseURL);
  const protectedResourceMetadata = createProtectedResourceMetadataHandler(
    config.audience,
    config.issuer,
  );

  return new Hono()
    .get("/.well-known/oauth-authorization-server", () => authServerMetadata())
    .get("/.well-known/oauth-authorization-server/api/auth", () => authServerMetadata())
    .get("/.well-known/openid-configuration", () => authServerMetadata())
    .get("/.well-known/openid-configuration/api/auth", () => authServerMetadata())
    .get("/.well-known/oauth-protected-resource", () => protectedResourceMetadata())
    .get("/.well-known/oauth-protected-resource/mcp", () => protectedResourceMetadata())
    .use(
      "/mcp",
      cors({
        origin: "*",
        allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
        allowHeaders: [
          "Content-Type",
          "Authorization",
          "mcp-session-id",
          "mcp-protocol-version",
          "Last-Event-ID",
        ],
        exposeHeaders: ["mcp-session-id", "mcp-protocol-version", "WWW-Authenticate"],
      }),
    )
    .use("/mcp", mcpHostGuard(deps.allowedHosts))
    .all("/mcp", (c) => handle(c.req.raw));
};
