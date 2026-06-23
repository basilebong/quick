# Lint, formatting, and commit rules

## No suppression. Ever.

Per CLAUDE.md rule 14. None of these are allowed anywhere in the repo:

- `// biome-ignore <...>`
- `// eslint-disable*`, `/* eslint-disable */`
- `// @ts-ignore`, `// @ts-expect-error`, `// @ts-nocheck`
- File-level disable comments at the top of any source file
- Per-path exception lists inside `biome.json`, `scripts/check-source.ts`,
  or anywhere else
- Renaming a forbidden API (`as`, `!`, etc.) to a wrapper just to launder
  the violation

If a rule is blocking, the fix is in the code: change the signature, parse
the value, add a type guard, restructure the logic. If the rule itself is
genuinely wrong, remove it from `biome.json` or `scripts/check-source.ts`
in a separate PR with a written justification — global, not per-line.

`check-source.ts` ships NO suppression mechanism on purpose. Don't add one.

## What runs

`pnpm check` (Biome) and `pnpm check:source` (TypeScript AST) both gate CI
and the `pre-commit` hook. `tsc -b` also runs at pre-commit. The `commit-msg`
hook runs `commitlint` against the commit message — see
[Commit messages](#commit-messages-commit-msg-hook).

## Biome

- Formatter: 2-space, double quotes, semicolons, trailing commas. Line width
  100. Defined in `biome.json`.
- Import ordering: `organizeImports.enabled = true`. Imports are sorted on
  save / on `pnpm lint:fix`. Manual re-ordering is wasted effort.
- `noExplicitAny: error`, `noNonNullAssertion: error`, `useImportType: error`,
  `useExportType: error`, `noUnusedImports: error`, `noUnusedVariables: error`.
- `useSortedClasses` (Tailwind class ordering) recognises `cn`, `clsx`, `cva`,
  `tw`.

## AST checks (`pnpm check:source`)

Implemented in `scripts/check-source.ts` (Bun + TypeScript compiler API).
Two rules:

### `no-bare-as`

Forbids `expr as Type` and `<Type>expr` casts. The only allowed form is
`expr as const`.

Wrong:
```ts
const u = JSON.parse(raw) as User;
const x = <string>value;
```

Right:
```ts
const parsed = userSchema.parse(raw);
const x = isString(value) ? value : "";
const tuple = [1, 2, 3] as const;
```

Narrow with type guards, ts-pattern, or schema validation (Valibot / Zod).
If you genuinely need an assertion (FFI-style boundary), wrap it in a
single named parser/guard so the cast is in one place.

### `sorted-exports`

Top-level `export { a, b, c }` blocks must be alphabetically sorted by
exported name (not local name). `export * from` and default exports are
unaffected.

Wrong:
```ts
export { z, a, m };
```

Right:
```ts
export { a, m, z };
```

This applies only to re-export statements — `export const`, `export function`,
etc. are not sorted (they're declarations, ordered for readability).

## Commit messages (`commit-msg` hook)

Commit messages MUST follow [Conventional Commits](https://www.conventionalcommits.org).
Enforced by `commitlint` (config `@commitlint/config-conventional`), wired as
the `commit-msg` lefthook job: `pnpm exec commitlint --edit {1}`.

Format:

```
<type>(<optional scope>)<optional !>: <subject>

<optional body, after one blank line>

<optional footer(s)>
```

Rules (config-conventional defaults; errors block the commit):

- `type` is required, lowercase, one of: `build`, `chore`, `ci`, `docs`,
  `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, `test`.
- `subject` is required and must NOT end with a period.
- Header (first line) ≤ 100 chars.
- A blank line must separate body from header (warning level).
- Breaking change: `!` after type/scope (`feat!:`) or a `BREAKING CHANGE:`
  footer.

Right:
```
feat(web): add responsive desktop dashboard shell
fix(deploy): reject path traversal in static serving
chore: bump biome to 1.9.4
```

Wrong:
```
Add dashboard          # no type
Feat: Add dashboard.   # capitalized type, trailing period
```

This is the recognised standard — deliberately NOT reverse-engineered from
this repo's history. Some commits predate it and would not pass; that is
expected.

## Setup

Hooks are managed by [lefthook](https://github.com/evilmartians/lefthook)
(config in `lefthook.yml`). Install with:

```bash
pnpm hooks:install   # one-time: writes .git/hooks/* via `lefthook install`
```

`pnpm install` does NOT install hooks automatically — `.npmrc` has
`ignore-scripts=true` (rule 2 / §8.2). The explicit step is intentional.
