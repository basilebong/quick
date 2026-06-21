import { isAbsolute, relative, resolve } from "node:path";
import { escapeHtml } from "@quick/core/server";
import type { TenantVariables } from "@quick/core/server";
import type { Context } from "hono";

// Sent on every served app asset. Apps are user-authored, so default to
// clickjacking + sniffing protections. We deliberately do NOT set a script/style
// CSP (it would break legitimate apps); per-app origin isolation is the real wall.
const SECURITY_HEADERS: Record<string, string> = {
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "content-security-policy": "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  "referrer-policy": "no-referrer",
};

const notDeployedPage = (slug: string): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Not deployed</title><style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:18vh auto;padding:0 1.25rem;color:#1a1a1a}h1{font-size:1.4rem}code{background:#f2f2f2;padding:.1rem .35rem;border-radius:.25rem}</style></head><body><h1>Nothing deployed yet</h1><p>Run <code>quick deploy</code> to publish <code>${escapeHtml(slug)}</code>.</p></body></html>`;

// Serves the current immutable deployment for the resolved tenant app. Runs after
// the share gate, so the viewer is already authorized.
export const createServeAppStatic = (opts: { appsDir: string }) => {
  const headersWith = (extra?: Record<string, string>): Record<string, string> => ({
    ...SECURITY_HEADERS,
    ...(extra ?? {}),
  });

  return async (c: Context<{ Variables: TenantVariables }>): Promise<Response> => {
    const tenant = c.var.tenant;
    if (tenant.kind !== "app") return c.notFound();
    const app = tenant.app;
    if (app.currentDeploymentId === null) {
      return c.html(notDeployedPage(app.slug), 200, headersWith());
    }

    const versionDir = resolve(opts.appsDir, app.slug, app.currentDeploymentId);
    const pathname = decodeURIComponent(new URL(c.req.url).pathname);
    const rel = pathname === "/" || pathname === "" ? "index.html" : pathname.replace(/^\/+/, "");
    const target = resolve(versionDir, rel);
    const within = relative(versionDir, target);
    if (within.startsWith("..") || isAbsolute(within)) return c.text("Forbidden", 403);

    const file = Bun.file(target);
    if (await file.exists()) return new Response(file, { headers: headersWith() });

    // SPA fallback to index.html.
    const index = Bun.file(resolve(versionDir, "index.html"));
    if (await index.exists()) {
      return new Response(index, {
        headers: headersWith({ "content-type": "text/html; charset=utf-8" }),
      });
    }
    return c.text("Not found", 404);
  };
};
