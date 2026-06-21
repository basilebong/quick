# Module boundaries

## The subpath contract

Each `packages/app-*` exports four entry points:

| Path        | Browser? | May import                                                       |
|-------------|----------|------------------------------------------------------------------|
| `./shared`  | yes      | `@quick/core/shared`, isomorphic libs (valibot, ts-pattern, ulid) |
| `./server`  | no       | `./shared`, `@quick/core/server`, Drizzle, Hono, `bun:sqlite` |
| `./tools`   | no       | `./shared`, `./server`, `@modelcontextprotocol/sdk`, Zod         |
| `./ui`      | yes      | `./shared`, React, shadcn primitives, Phosphor, Vaul             |

`apps/web` may only import `/shared` and `/ui` from app packages. Importing
`/server` or `/tools` from browser code is a build error.

## What MUST NOT appear under `src/shared/`

- `bun:sqlite`, Drizzle, Hono, `node:*` modules
- `process.env` reads (use `import.meta.env` in browser code, runtime config
  passed in from `server/` otherwise)
- The MCP SDK or Zod

If your "shared" function needs the DB, it isn't shared — split it.

## Core vs app

- `@quick/core` contains platform plumbing: auth, db wiring, MCP transport,
  audit log, branded IDs, Result, middleware.
- Per-app code lives in `packages/app-<name>`. Cross-app helpers do not exist.
  If two apps need the same thing, promote it to `core` only after a clear
  third use case shows up.

Never modify `core` to add feature-specific logic.

## Allowed cycles

None. Workspace dependencies are a DAG:

```
apps/web   → app-*/shared, app-*/ui, core/shared
apps/server → app-*/server, app-*/tools, core/server, core/shared
app-*/server → app-*/shared, core/server, core/shared
app-*/tools  → app-*/server, app-*/shared, core/server, core/shared
app-*/ui     → app-*/shared, core/shared
core/server  → core/shared
```

`apps/server` may not import from `apps/web` and vice versa — they share state
only through `@quick/core/shared` types and the HTTP RPC client.

## How to check

```bash
bun run typecheck     # catches forbidden cross-imports
bun run check         # catches missing `import type`
```
