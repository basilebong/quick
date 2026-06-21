# Module boundaries

## Packages
- `@quick/core` — platform plumbing: branded IDs, `Result`, host/slug parsing,
  Better Auth, db wiring, MCP transport, audit log, SSO, and the tenancy
  middleware (resolve-app, share-gate, origin-check, owner). Subpaths `./shared`
  (browser-safe) and `./server`.
- `@quick/app-hosting` — app registry, immutable deployments, share links, access
  log, personal access tokens, static serving, MCP tools. Subpaths `./shared`,
  `./server`, `./tools`.
- `@quick/app-store` — the `/_api/db` building block. `./shared`, `./server`.
- `@quick/app-files` — the `/_api/files` building block. `./shared`, `./server`.

## The subpath contract

| Path        | Browser? | May import                                                       |
|-------------|----------|------------------------------------------------------------------|
| `./shared`  | yes      | `@quick/core/shared`, isomorphic libs (valibot, ts-pattern, ulid) |
| `./server`  | no       | `./shared`, `@quick/core/server`, Drizzle, Hono, `bun:sqlite`, `node:*` |
| `./tools`   | no       | `./shared`, `./server`, `@modelcontextprotocol/sdk`, Zod         |

Dashboard UI lives in `apps/web` (not in packages). `apps/web` and `apps/cli` may
import ONLY `*/shared`. Importing `/server` or `/tools` from browser or CLI code
is a build error.

## What MUST NOT appear under `src/shared/`

- `bun:sqlite`, Drizzle, Hono, `node:*` modules, the MCP SDK, Zod
- `process.env` reads (use runtime config passed in from `server/`)

If your "shared" function needs the DB, it isn't shared — split it.

## Core vs app

`@quick/core` is platform plumbing and never imports an app package. The tenancy
middleware takes injected `AppRegistry` / `ShareResolver` interfaces, wired in
`apps/server` — so `core` stays app-agnostic and the graph stays acyclic. App
packages never import each other.

## The DAG (no cycles)

```
apps/web     → app-*/shared, core/shared
apps/cli     → app-hosting/shared, core/shared
apps/server  → app-*/server, app-hosting/tools, core/server, core/shared
app-*/server → app-*/shared, core/server, core/shared
app-hosting/tools → app-hosting/server, app-hosting/shared, core/server, core/shared
core/server  → core/shared
```

`apps/server` may not import from `apps/web`/`apps/cli` and vice versa.

## How to check

```bash
bun run typecheck     # catches forbidden cross-imports
bun run check         # catches missing `import type`
```
