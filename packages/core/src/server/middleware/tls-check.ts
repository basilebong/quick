import type { Context } from "hono";
import { isUsableSlug, parseSubdomain } from "../../shared/index.ts";
import type { AppRegistry } from "../tenant.ts";

// On-demand TLS gate for a fronting Caddy: it calls this unauthenticated before
// minting a per-subdomain certificate, treating 2xx as "issue" and anything else
// as "refuse". Allowing only the apex and slugs that resolve to a real deployed
// app stops Caddy from being coaxed into issuing certs for arbitrary hostnames
// aimed at the IP (a Let's Encrypt rate-limit / abuse vector). The hostname comes
// from the `domain` query param, not the Host header: Caddy reaches this route
// over a loopback reverse-proxy, so its Host is the upstream address, not the SNI.
// Fail-closed — any thrown error becomes a non-2xx and Caddy declines to issue.
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
