# Testing rules

## Runner

`bun:test`. Jest-compatible API. Shipped with Bun — no extra runner to
install. Run with `bun test`.

```ts
import { describe, test, expect, beforeEach } from "bun:test";
```

## Pyramid

| Layer        | What                                                                | Where                              | Budget   |
|--------------|---------------------------------------------------------------------|------------------------------------|----------|
| Unit         | Pure functions (state machines, parsers, ID constructors)           | `packages/*/src/shared/**.test.ts` | < 2 s    |
| Integration  | Hono + Better Auth + MCP against `:memory:` SQLite with migrations  | `packages/*/src/server/**.test.ts` | < 15 s   |
| MCP tools    | Tool handlers via API-key auth                                      | `packages/*/src/tools/**.test.ts`  | < 5 s    |
| E2E          | One happy path per app, against built Docker image                  | `apps/web/e2e/`                    | < 30 s/scenario |

State-machine tests run once and cover both server and client behavior — same
code runs in both.

## TDD loop

1. Failing unit test for the state transition (in `shared/`)
2. Green in `shared/state.ts`
3. Failing integration test for the HTTP route
4. Green in `server/routes.ts` + `server/service.ts`
5. Failing MCP tool test
6. Green in `tools/`
7. (Non-trivial React only) failing component test
8. Refactor

## No mocks

Boot a real fresh `:memory:` SQLite with real Drizzle migrations and a real
Better Auth instance for every test. Pattern (will live in
`packages/core/src/server/test/withTestContext.ts` once core is built):

```ts
await withTestContext(async (ctx, user) => {
  const app = new Hono().route("/", groceryRoutes);
  const res = await app.request("/lists/L1/items", {
    method: "POST",
    headers: { cookie: user.sessionCookie },
    body: JSON.stringify({ name: "Milk" }),
  });
  expect(res.status).toBe(201);
});
```

Mocks are only acceptable for: outbound network (Google OAuth in unit tests),
filesystem when the test isn't about FS behavior, and time (use Bun's fake
timers). Mocking your own modules is a smell — fix the design.

## Coverage targets

- State machines: 100%
- Service layer: ≥ 80% lines
- HTTP routes: happy + auth-fail + validation-fail per endpoint
- React: only non-trivial logic

CI gate: coverage cannot decrease.

## E2E

Playwright against the built Docker image. Run with `bun run e2e`. One scenario
per feature:

- Sign in with passkey
- Add a grocery item, mark purchased, restore

E2E is slow — keep it small. Regressions in pure logic must be caught at the
unit/integration layer.

## What "done" looks like

Before declaring done:
- `bun test` green
- `bun run typecheck` green
- `bun run check` green (Biome)
- New code has tests (rule 3)
- If UI: verified on a real 360×780 viewport (`.claude/rules/mobile.md`)
