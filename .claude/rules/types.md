# Type rules

## `as` is banned (except `as const`)

`pnpm check:source` enforces this. The only allowed form is `expr as const`.
Narrow with type guards, ts-pattern, or schema parsing. Angle-bracket casts
(`<T>x`) are also blocked.

No exceptions, including for branded IDs:

- Use Valibot's `v.brand()` action to produce branded values. The cast lives
  inside Valibot, not in our code.
- Do NOT hand-roll `parseUserId = (s) => s as UserId`. The function fails
  `check:source`.
- The brand TYPE definition (`type UserId = Brand<string, "UserId">`) is
  fine — it contains no runtime cast.

```ts
import * as v from "valibot";

export const UserIdSchema = v.pipe(v.string(), v.minLength(1), v.brand("UserId"));
export type UserId = v.InferOutput<typeof UserIdSchema>;
export const parseUserId = (raw: unknown): UserId => v.parse(UserIdSchema, raw);
```

## `any` is banned

Biome's `noExplicitAny: error` blocks merge. Use `unknown` and narrow with type
guards, ts-pattern, or Valibot/Zod parse. Escape hatch:
`// TODO(basile): tighten this <reason>` — never silent.

## Branded IDs everywhere

`UserId`, `GroceryListId`, etc. live in `packages/core/src/shared/ids.ts`.
Never accept or return a bare `string` for an ID. At HTTP/MCP boundaries,
construct via the `parse*Id` helpers (they validate shape).

## Discriminated unions

Every union with ≥ 3 variants uses `kind:` and ts-pattern's `.exhaustive()`.
Naked `switch` without `assertNever(x)` is a review block.

```ts
import { match } from "ts-pattern";
match(value)
  .with({ kind: "a" }, () => ...)
  .with({ kind: "b" }, () => ...)
  .exhaustive();
```

## Result over throw — at module boundaries

Services return `Result<T, AppError>` (`@quick/core/shared`). Routes may
throw; the global `onError` handler maps known errors to status codes.

## tsconfig

Driven by `tsconfig.base.json`. Strictness flags are non-negotiable; do not
relax them on a per-package basis.

- `noUncheckedIndexedAccess` — `array[i]` is `T | undefined`
- `exactOptionalPropertyTypes` — `{ foo?: string }` is not `{ foo: string | undefined }`
- `verbatimModuleSyntax` — use `import type` / `export type`
- `useUnknownInCatchVariables` — `catch (e)` is `unknown`

## Inferring from Drizzle

```ts
import type { groceryItems } from "./schema";
export type GroceryItemRow = typeof groceryItems.$inferSelect;
export type GroceryItemInsert = typeof groceryItems.$inferInsert;
```

Re-export from `shared/types.ts`. Never declare row types by hand — they drift.
