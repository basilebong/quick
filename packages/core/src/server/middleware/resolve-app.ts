import { createMiddleware } from "hono/factory";
import { isUsableSlug, parseSubdomain } from "../../shared/index.ts";
import { notFoundAppPage } from "../html.ts";
import type { AppRegistry, TenantVariables } from "../tenant.ts";

// First middleware after logging: derive the tenant from the Host header. The
// apex host (dashboard/API/MCP) and reserved labels resolve to `apex`; a known
// app slug resolves to that app; an unknown app slug is a hard 404.
export const createResolveApp = (deps: { rootDomain: string; registry: AppRegistry }) =>
  createMiddleware<{ Variables: TenantVariables }>(async (c, next) => {
    const sub = parseSubdomain(c.req.header("host") ?? "", deps.rootDomain);
    // Reserved AND malformed labels resolve to the apex; only a usable slug is ever
    // looked up as a tenant (same validity gate the create API uses).
    if (sub.kind === "apex" || !isUsableSlug(sub.label)) {
      c.set("tenant", { kind: "apex" });
      return next();
    }
    const app = await deps.registry.findBySlug(sub.label);
    if (app === null) return c.html(notFoundAppPage(sub.label), 404);
    c.set("tenant", { kind: "app", app });
    return next();
  });
