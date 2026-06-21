export type SubdomainResult = { kind: "apex" } | { kind: "app"; label: string };

// Pure host -> tenant-label resolver. `host` is the raw Host header (may include
// a port); `rootDomain` is the apex Quick is served at (e.g. "quick.example.com",
// or "localhost" in dev where apps use "<slug>.localhost"). Returns the single
// subdomain label for an app, or "apex" for the dashboard host and anything that
// does not look like a single-label subdomain of the root.
export const parseSubdomain = (host: string, rootDomain: string): SubdomainResult => {
  const h = (host.split(":")[0] ?? "").trim().toLowerCase();
  const rd = rootDomain.toLowerCase();
  if (h === "" || h === rd) return { kind: "apex" };
  if (!h.endsWith(`.${rd}`)) return { kind: "apex" };
  const label = h.slice(0, h.length - rd.length - 1);
  if (label === "" || label.includes(".")) return { kind: "apex" };
  return { kind: "app", label };
};
