// Single source of truth for app-slug validity, shared by the create API, the
// CLI, and host-based tenant resolution. A slug becomes a DNS label
// (`<slug>.quick.<domain>`) so it must be a valid hostname label.
export const SLUG_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

// Labels that must always resolve to the apex (dashboard / admin API / MCP),
// never to a tenant app.
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "_api",
  "_sso",
  "admin",
  "api",
  "app",
  "apps",
  "assets",
  "auth",
  "dashboard",
  "mcp",
  "static",
  "www",
]);

export const isValidSlug = (slug: string): boolean => SLUG_REGEX.test(slug);

export const isReservedSlug = (slug: string): boolean => RESERVED_SLUGS.has(slug.toLowerCase());

export const isUsableSlug = (slug: string): boolean => isValidSlug(slug) && !isReservedSlug(slug);
