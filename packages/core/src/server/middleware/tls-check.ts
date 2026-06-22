import type { Context } from "hono";
import { isUsableSlug, parseSubdomain } from "../../shared/index.ts";
import type { AppRegistry } from "../tenant.ts";

// Caddy's on-demand-TLS `ask` hook (unauthenticated): 2xx means "issue this cert".
// The SNI host arrives in `?domain`, NOT the Host header, because Caddy reaches this
// over a loopback proxy whose Host is the upstream address. Answering only for the
// apex + resolvable slugs stops cert issuance for arbitrary hostnames aimed at the
// IP (a Let's Encrypt rate-limit abuse vector).
export const createTlsCheck =
  (deps: { rootDomain: string; registry: AppRegistry }) =>
  async (c: Context): Promise<Response> => {
    const raw = c.req.query("domain");
    if (raw === undefined) return c.body(null, 404);
    const host = (raw.split(":")[0] ?? "").trim().toLowerCase();
    const rootDomain = (deps.rootDomain.split(":")[0] ?? "").trim().toLowerCase();
    if (host === "" || rootDomain === "") return c.body(null, 404);
    if (host === rootDomain) return c.body(null, 200);
    const sub = parseSubdomain(host, rootDomain);
    if (sub.kind === "app" && isUsableSlug(sub.label)) {
      const app = await deps.registry.findBySlug(sub.label);
      if (app !== null) return c.body(null, 200);
    }
    return c.body(null, 404);
  };
