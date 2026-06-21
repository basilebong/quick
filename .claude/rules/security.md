# Security rules (multi-tenant static hosting)

HARD rules for Quick, on top of the constitution.

## Cookie isolation — the load-bearing invariant
- NO cookie is EVER scoped to the parent domain (`.${QUICK_DOMAIN}`). Better Auth
  is host-only (no `crossSubDomainCookies`); keep it that way.
- All `*.${QUICK_DOMAIN}` are the SAME SITE, so `SameSite` does NOT isolate apps —
  host-only cookie scoping does. The per-app session cookie (`quick_app_sess`) is
  host-only and is the ONLY credential `/_api/*` accepts.
- Cross-subdomain SSO goes through the apex one-time-code handoff
  (`/_sso/start` → `/_sso/callback`), never a shared cookie.
- A regression test MUST assert `quick_app_sess` carries no `Domain` attribute, and
  that `/_api/*` rejects a request not bearing this host-only cookie.

## Secrets at rest
- Share-link tokens and personal access tokens are random ≥256-bit values; store
  ONLY their SHA-256 hash. Show plaintext to the owner once; never persist or log it.
- Never log a raw token or a `?t=` query value. The link redeem path strips `?t=`
  via a clean-URL redirect with `Referrer-Policy: no-referrer`.

## Slugs
- Slug validity + the reserved set live in ONE place: `@quick/core/shared`
  (`reserved-slugs.ts`). The create API, the CLI, and host resolution all use it.

## Served apps
- Served app responses set `X-Frame-Options: DENY`, `X-Content-Type-Options:
  nosniff`, and a minimal `frame-ancestors 'none'` CSP. Do NOT add a script/style
  CSP — it would break legitimate user apps; per-app origin isolation is the wall.
- Static serving rejects path traversal (resolve + verify the path stays under the
  immutable version directory).

## Owner gating
- Any Google account may sign in (to view a google-mode app). Owner-only surfaces
  (dashboard, deploy API, MCP tools) are gated PER REQUEST against
  `QUICK_ALLOWED_EMAILS` (`createRequireOwner` / `createOwnerAuth`), never at sign-up.
