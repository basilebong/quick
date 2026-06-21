# @quick/core

Platform plumbing. Two subpath exports:

- `./shared` — isomorphic helpers (branded IDs, Result). MUST run in the
  browser. NO server-only imports.
- `./server` — Better Auth, Drizzle db wiring, MCP transport plumbing,
  audit log, Hono middleware. Server only.

## Local rules
- App-specific code does NOT live here. Auth and audit are platform concerns;
  grocery state machines are not.
- Anything added under `src/shared/` must compile and run in the browser. No
  `bun:sqlite`, no Drizzle, no Hono, no `node:*`.
- ID factories live in `src/shared/ids.ts`. Use `Brand<string, "Name">`; never
  bare string for an ID.
- `Result<T, E>` is the only return type for services across module boundaries.
