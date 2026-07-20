# Security rules (multi-tenant static hosting)

HARD rules for Quick, on top of the constitution.

## Cookie isolation — the load-bearing invariant
- NO cookie is EVER scoped to the parent domain (`.${QUICK_DOMAIN}`). Better Auth
  is host-only (no `crossSubDomainCookies`); keep it that way.
- All `*.${QUICK_DOMAIN}` are the SAME SITE, so `SameSite` does NOT isolate apps —
  host-only cookie scoping does. Both per-app credentials are host-only (no `Domain`):
  the google-mode session cookie (`quick_app_sess`) and the link-mode cookie
  (`quick_link`). One of these — matching the app's share mode — is what `/_api/*`
  requires; the owner's apex Better Auth session is never accepted on a tenant host.
- Cross-subdomain SSO goes through the apex one-time-code handoff
  (`/sso/grant` on the apex → `/sso/callback` on the tenant), never a shared cookie.
- A regression test MUST assert both `quick_app_sess` and `quick_link` carry no
  `Domain` attribute, and that `/_api/*` rejects a request bearing no valid per-app
  credential for the app's share mode.

## Secrets at rest
- Share-link tokens are random ≥256-bit values; store ONLY their SHA-256 hash.
  Show plaintext to the owner once; never persist or log it.
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
- The allowlist is the ONLY owner trust boundary: every allowlisted email is a
  co-equal operator of the instance and can manage every app. There is no per-app
  owner isolation — `apps.ownerUserId` is attribution (who created an app), NOT an
  authorization check, and the dashboard lists every app to every owner. Deploy as
  a single operator or a set of mutually trusting co-admins. Per-owner isolation
  (scoping each app to its creator) would be a deliberate future feature, not a
  bug in this model; do not "fix" it by adding owner filters to the app queries —
  that would break the all-apps dashboard listing.

## Deferred advisories

CI runs two supply-chain gates: `pnpm audit --audit-level=moderate` and (PR-only)
`actions/dependency-review-action`. They have separate ignore mechanisms, so a deferred
advisory must be listed in BOTH: `pnpm.auditConfig.ignoreGhsas` (root `package.json`) and
`allow-ghsas` (the dependency-review step in `.github/workflows/supply-chain.yml`). Exactly
one advisory is deferred:

- **GHSA-p2fr-6hmx-4528** — `@better-auth/oauth-provider`, CVSS 3.1 (moderate):
  unbound resource indicators let a client obtain an access token for an audience it
  wasn't consented for. The escalation requires **more than one** configured audience.
  Quick's OAuth server sets a single MCP resource (`validAudiences: [mcpResource]`),
  so there is no second audience to escalate to — **not exploitable in this config**.
  The fix ships only in the `1.7.0` prerelease line, and upgrading to 1.7 is a breaking
  migration (`@better-auth/mcp`, `/oauth2/*` endpoints, EOPT-incompatible RC types).
  **Remove it from both gates when we move to Better Auth 1.7 GA** (tracked in #13). The companion HIGH advisory
  (stored XSS, GHSA-86j7-9j95-vpqj) is NOT ignored — it is fixed by pinning
  `better-auth`/`@better-auth/oauth-provider` ≥ 1.6.23.

Do not add further entries without the same three things here: the ID, why we are not
exposed, and the condition that removes it. Never lower `--audit-level` to dodge an
advisory — that hides every future one too.
