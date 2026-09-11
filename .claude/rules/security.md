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
  The fix shipped in the `1.7.0` GA release (2026-08-18). **Attempted the upgrade to
  1.7.1 on 2026-08-27 and reverted it**: `@better-auth/oauth-provider`/`@better-auth/mcp`
  1.7.1's own generated types for the `oauth2Authorize` endpoint (OpenAPI metadata,
  `items?: undefined` fields) do not satisfy `BetterAuthPlugin` under this repo's
  non-negotiable `exactOptionalPropertyTypes: true` — confirmed by unpacking the
  1.7.2 tarball directly (`npm pack @better-auth/oauth-provider@1.7.2`), which ships
  the identical broken shape, so the bump is not yet fixed upstream. This is a known,
  recurring category of upstream defect (see better-auth/better-auth#6127, #4804,
  #8855 for the same `exactOptionalPropertyTypes` incompatibility in other plugins),
  not something fixable from Quick's application code, and CLAUDE.md rule 14 forbids
  suppressing it with a cast or `@ts-expect-error` to force the migration through.
  The migration also requires a schema regen (`bun run auth:generate` /
  `bun run db:generate`) and touches `better-auth`'s `internalAdapter.createUser`
  signature (now `(issuer, accountId)`-scoped) — sized but not attempted further once
  the type-level blocker was hit. **Re-attempted on 2026-09-03 directly against the
  installed `1.7.2` package (not just its tarball)**: `tsc -b` still fails with the
  identical `oauth2Authorize`/`OpenAPIParameter.schema.items` incompatibility against
  `exactOptionalPropertyTypes: true` — confirmed unfixed upstream, not a stale-tarball
  artifact. Also found a new blocker on this pass: `1.7.x` split `mcpHandler` out of
  `@better-auth/oauth-provider` entirely into a separate `@better-auth/mcp` package
  (`packages/core/src/server/mcp/auth.ts` now fails with `Module
  "@better-auth/oauth-provider" has no exported member 'mcpHandler'`), so the
  migration also needs a new direct dependency and an import-path change in
  `createMcpAuthGuard`'s call site, on top of the still-unresolved type blocker.
  **Re-attempted on 2026-09-10 against the installed `1.7.3` package** (`better-auth`,
  `@better-auth/oauth-provider`, and the new `@better-auth/mcp` dependency, with
  `createMcpAuthGuard` switched to `@better-auth/mcp`'s `createMcpProtectedRequestHandler`,
  whose flattened `{ issuer, audience, jwksUrl }` options are a drop-in shape match):
  `tsc -b` still fails on the identical `oauth2Authorize`/`OpenAPIParameter.schema.items`
  incompatibility under `exactOptionalPropertyTypes: true` — confirmed unfixed upstream
  as of 1.7.3. This pass also surfaced a second, independent break: `better-auth@1.7.3`
  changes an internal adapter call signature our test helper depends on, failing three
  suites (`packages/core/src/server/assistants/routes.test.ts`,
  `packages/core/src/server/assistants/service.test.ts`,
  `packages/core/src/server/auth/auth.test.ts`,
  `packages/core/src/server/middleware/session.test.ts`) with `Expected 2 arguments,
  but got 1` — consistent with the `internalAdapter.createUser` `(issuer, accountId)`
  re-scoping already noted above, now hitting `packages/core/src/server/test/` directly
  instead of only being a theoretical size estimate. Reverted the attempt; nothing here
  is fixable from application code. **Re-attempt when a `@better-auth/oauth-provider`
  patch ships that fixes the `oauth2Authorize` OpenAPI parameter types under
  `exactOptionalPropertyTypes`** (tracked in #13). The companion HIGH advisory (stored
  XSS, GHSA-86j7-9j95-vpqj) is NOT ignored — it is fixed by pinning
  `better-auth`/`@better-auth/oauth-provider` ≥ 1.6.23.

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
  `esbuild@0.18.20` and the audit fails. **Remove when `drizzle-kit` drops
  `@esbuild-kit/esm-loader`.**
- **`brace-expansion@<5.0.9` → `>=5.0.9`** (GHSA-mh99-v99m-4gvg / CVE-2026-14257,
  unbounded expansion length → uncatchable OOM, plus GHSA-rgw5-rvv9-x895, a follow-up
  DoS via unbounded intermediate arrays that bypassed the first fix — `5.0.8` alone is
  no longer sufficient, hence the bumped floor). Reached at BUILD time only, via
  `vite-plugin-pwa` → `workbox-build` → `@trickfilm400/rollup-plugin-off-main-thread`
  → `ejs` → `jake` → `filelist` → `minimatch@5`, which pins `brace-expansion: ^2.0.1`.
  `filelist@2` moved to `minimatch@10` (fixed range), but `ejs@3.1.10` still pulls
  `jake@10`. Note `ejs`'s library code never actually requires `jake` — verified by
  grep, it is a packaging artifact — so nothing on our build path calls the vulnerable
  expander. The override is defence-in-depth to keep the audit gate honest. **Remove
  when `workbox-build` ships a `rollup-plugin-off-main-thread` that drops `ejs`, or
  when `ejs` moves to `jake@12`.**

Overrides are not a substitute for a real upgrade. Every entry above must be re-checked
on each dependency audit and dropped as soon as the upstream chain is fixed.
