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
`allow-ghsas` (the dependency-review step in `.github/workflows/supply-chain.yml`).

**No advisory is currently deferred.** The last one, GHSA-p2fr-6hmx-4528
(`@better-auth/oauth-provider` cross-audience token escalation), was removed on
2026-10-29 by migrating to `better-auth`/`@better-auth/oauth-provider`/`@better-auth/mcp`
1.7.14 (issue #13). That migration was forced: the frozen 1.6.x line (last release
1.6.33) also carries GHSA-965c-763c-88jm (critical), GHSA-r4xp-prcw-77qf and
GHSA-q84f-53jg-9ppm (high), and GHSA-44jh-23m7-hpcf (low), none backported. What the
migration changed, so a later bump does not undo it:
- MCP auth uses `mcp({ resource })` (persisted `oauth_resources` row + per-client
  `oauth_client_resources` links, `enforcePerClientResources` left at its `true`
  default). `oauthProvider` options are generic, so a removed option is silently
  ignored; `apps/server/src/mcp-oauth.test.ts` asserts the token audience instead.
- Pre-1.7 DCR clients have no resource link; `linkOAuthClientsToResource` runs at
  boot (`apps/server/src/index.ts`) and links them, or their refreshes fail with
  `invalid_target` (covered by the 1.6.33-fixture tests).
- `drizzle/0008_*.sql` is hand-corrected: drizzle-kit's table rebuilds copied columns
  that did not exist yet, and the new `NOT NULL` timestamp columns needed `COALESCE`
  (rows with no `expires_at` are dropped — they cannot be proven unexpired).
- `bun run auth:generate` uses the 1.7 CLI (`auth`); it still drops the hand-added
  `accounts_provider_account_unique` composite index, so re-add it after regenerating.

Do not add further entries without the same three things here: the ID, why we are not
exposed, and the condition that removes it. Never lower `--audit-level` to dodge an
advisory — that hides every future one too.

## Transitive overrides

`pnpm.overrides` in the root `package.json` exists ONLY to force-patch a vulnerable
*transitive* dependency that no direct-dependency upgrade can reach. Upgrading the
direct dependency is always preferred; reach for an override only after confirming
no released version of the parent pulls a fixed range. `package.json` cannot carry
comments, so each override is justified here:

- **`esbuild@<0.25.0` → `>=0.25.0`** (GHSA-67mh-4wv8-2f99, dev-server request
  smuggling). `drizzle-kit` → `@esbuild-kit/esm-loader` → `@esbuild-kit/core-utils`
  pins `esbuild: ~0.18.20`. `@esbuild-kit/*` is deprecated and unmaintained (its
  successor is `tsx`, which `drizzle-kit` also depends on), so the pin will never be
  fixed upstream. Verified still load-bearing: removing the override resolves
  `esbuild@0.18.20` and the audit fails. Re-verified 2026-10-15 against
  `drizzle-kit@0.31.11` (still latest stable): its published `dependencies` still list
  `@esbuild-kit/esm-loader: ^2.5.5`, and a fresh resolve without the override still
  pulls `esbuild@0.18.20` and fails the audit. Re-verified 2026-10-22 and 2026-10-29:
  `0.31.11` is still `latest` (`1.0.0` is only at `rc.5`), and removing the override
  still resolves `esbuild@0.18.20` and fails the audit. **Remove when
  `drizzle-kit` drops `@esbuild-kit/esm-loader`.**

Overrides are not a substitute for a real upgrade. Every entry above must be re-checked
on each dependency audit and dropped as soon as the upstream chain is fixed.
