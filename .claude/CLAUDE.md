# Quick — Agent Constitution

You are working in a pnpm-workspaces monorepo. Loaded every session.
**If you violate any rule, STOP and ask.**

Quick is a self-hosted multi-tenant static-app hosting platform: deploy a folder,
get a secure URL at `<slug>.${QUICK_DOMAIN}`, shared with clients via Google
sign-in or expiring secret links. The security model is load-bearing — read
`.claude/rules/security.md` before touching auth, cookies, sharing, or serving.

## Stack (locked)
- Runtime: Bun (current stable; never `node`, never `npx` — use `bun`, `pnpm dlx`)
- HTTP: Hono v4 (serves API + MCP + static React in ONE process)
- Frontend: React 19 + Vite + TanStack (Router, Query, Form) + Tailwind v4
- UI components: shadcn/ui (copy-paste, in `apps/web/src/components/ui/`) + Vaul + Sonner + Phosphor
- DB: bun:sqlite via Drizzle ORM (beta); migrations in `/drizzle`
- Auth: Better Auth (google + oneTap) for people; `jwt` + `@better-auth/oauth-provider`
  (OAuth 2.1 Authorization Server) for MCP clients like Claude. DO NOT hand-roll
  OAuth, sessions, CSRF, or bearer tokens. Use the Better Auth API.
- Validation: Valibot at HTTP boundaries (in `shared/`), Zod inside MCP tool defs ONLY
- Tests: bun:test; E2E via Playwright against the built Docker image
- Distribution: single Dockerfile, single Bun process per container
- License: Elastic License 2.0 — all NEW dependencies MUST be MIT/Apache-2.0/BSD/ISC

## Hard rules
1. NEVER use `any`. Use `unknown` and narrow. No escape hatch — no
   suppression directive will be accepted (see rule 14).
2. NEVER add a dependency without (a) justification in PR description,
   (b) verified npm provenance, (c) license check (MIT/Apache/BSD/ISC only).
3. ALWAYS write the failing test first. Order: red → green → refactor.
4. ALWAYS run `bun test` AND `bun run typecheck` before declaring done.
5. ALL discriminated unions use `kind:` and ts-pattern `.exhaustive()`.
   No naked `switch` without `assertNever`.
6. ALL IDs are branded types from `@quick/core/shared`. Never bare `string`.
7. SERVICES return `Result<T, E>`. Routes may throw; global `onError` handles it.
8. NEW APP = NEW PACKAGE under `packages/app-*`. Never put grocery code in
   chores; never modify `@quick/core` for app-specific logic.
9. RESPECT THE SUBPATH BOUNDARY. Code under `src/shared/` MUST run in the
   browser (no `bun:sqlite`, Drizzle, Hono, Node APIs). Adding a server-only
   import to a `shared/` file = build error + review block.

10. NEVER guess. If a fact is not directly verifiable from the code, library
    docs, or behavior in front of you, do ONE of:
    (a) Write a test that proves it.
    (b) Run the code (`bun run`, `bun test`, REPL, curl) and observe.
    (c) Read the dependency source in `node_modules`.
    (d) Ask Basile.
    Do NOT infer API shapes, types, or behavior from memory, training data,
    or convention. Do NOT invent paths, function names, config keys, or CLI
    flags. "I think this is how it works" is a bug.
    State uncertainty plainly. Wrong confident answers are worse than
    "I don't know yet."
    DOUBLE for Better Auth + shadcn — both evolve per minor version; always
    check installed types in `node_modules`.

11. BE DIRECT. DO NOT FLATTER. DO NOT TRY TO PLEASE.
    - No "great question," "great idea," "you're absolutely right."
    - Push back on proposals you think are wrong, with specifics.
    - No softening real disagreements with "but it depends."
    - When Basile is wrong, say so with evidence. Capitulate only on
      substance, not social pressure.
    - Sycophancy is a failure mode. Cost = shipped bugs.

12. MOBILE FIRST AS A DESIGN RULE — not a polish step.
    Every UI component is designed for a 360×780 viewport FIRST, then
    adapts UP via Tailwind breakpoints. NEVER design desktop-first and
    shrink down.
    - Drawer (Vaul) is the default modal pattern. Centered Dialog is
      desktop-only (use ResponsiveDialog pattern: Drawer < `sm`,
      Dialog ≥ `sm`).
    - Primary actions in the BOTTOM thumb zone. Top bar = identity +
      context only.
    - Touch targets ≥ 44×44 CSS px (`min-h-11 min-w-11`).
    - Base font ≥ 16px on inputs (`text-base`) to prevent iOS zoom.
    - No hover-only interactions.
    - Optimistic UI on every mutation; rollback via TanStack Query + Sonner.
    - Safe-area insets in standalone PWA mode.
    - `min-h-dvh` not `min-h-screen`.
    - Inputs always have `inputmode`, `autocomplete`, `autocapitalize`.
    See `.claude/rules/mobile.md` for the full checklist (pre-merge gate).
    See `.claude/rules/ui.md` for shadcn/ui + Vaul usage patterns.

13. USE RADIX PRIMITIVES — DO NOT WRITE INTERACTIVE COMPONENTS FROM SCRATCH.
    Any component that needs focus management, keyboard navigation, ARIA
    roles, or escape/click-outside handling MUST be built on Radix UI (or
    shadcn/ui, which wraps Radix). Non-exhaustive list of "needs Radix":
    dialog, drawer, dropdown menu, popover, context menu, select,
    combobox, tabs, accordion, tooltip, switch, checkbox, radio group,
    slider, progress, separator, toggle group, navigation menu, hover
    card, alert dialog, scroll area, collapsible, toolbar.
    Order of preference:
    (a) `bunx shadcn@latest add <component>` — wraps Radix, integrates
        with our Tailwind config. Almost always the right answer.
    (b) Install `@radix-ui/react-<primitive>` and write a thin styled
        wrapper in `apps/web/src/components/ui/` — only if shadcn doesn't
        ship the component.
    (c) Vaul for drawers/sheets (wraps Radix Dialog internally) — already
        in our stack.
    Exceptions: Sonner (toasts, own implementation), Framer Motion
    (animations, no a11y surface), pure layout components (no
    interactive state).
    NEVER write a dropdown / modal / menu / tab strip from scratch with
    `useState` + click-outside detection + manual keyboard handlers. You
    WILL miss something — focus trap, escape key, arrow nav, ARIA
    expanded state, scroll lock — and ship an accessibility regression
    that's invisible in code review.

## Commands
- Dev (host):      `bun run dev`             (server + Vite, hot reload)
- Dev (Docker):    `docker compose --profile dev up`  (bind-mounted hot reload)
- Test:            `bun test`
- Types:           `bun run typecheck`
- Lint + format:   `bun run check`           (Biome)
- Auth schema:     `bun run auth:generate`   then commit
- DB migrations:   `bun run db:generate`     then commit `/drizzle`
- UI components:   `bunx shadcn@latest add <name>`  in `apps/web`
- Prod image:      `docker build -t quick .`
- Prod run:        `docker run -v ./data:/data -p 3000:3000 quick`

## Where things live
- `packages/core/src/shared`   → branded IDs, Result, isomorphic helpers
- `packages/core/src/server`   → Better Auth, db, MCP plumbing, middleware
- `packages/app-*/src/shared`  → state machines, types, Valibot, errors
- `packages/app-*/src/server`  → Drizzle schema, Hono routes, services
- `packages/app-*/src/tools`   → MCP tool definitions
- `packages/app-*/src/ui`      → React feature components (re-usable)
- `apps/server`                → SINGLE runtime entry — composition only
- `apps/web/src/components/ui` → shadcn copy-paste primitives
- `apps/web/src/components`    → AppShell, layout, app-wide components
- `apps/web/src/features`      → feature wiring (imports `app-*/ui` + `app-*/shared`)

14. NEVER suppress a lint, type, or AST rule. No `// biome-ignore`,
    `// eslint-disable*`, `// @ts-ignore`, `// @ts-expect-error`,
    `// @ts-nocheck`, file-level `/* eslint-disable */`, or any equivalent
    directive. No allowlist file with per-path exceptions. No
    `// check-source-disable-next-line` (we don't ship one). If a rule is
    blocking you, the answer is to fix the code, not silence the rule. If
    the rule is genuinely wrong for the project, remove it from
    `biome.json` / `scripts/check-source.ts` in a separate PR with
    justification — but global, not per-line.
    Similarly: no `as` cast outside `as const`. No `!` non-null assertion.
    Use parsers, type guards, or `satisfies` / schema validation.

15. NEVER write comments by default. Code explains itself through naming and
    structure. Two and only two reasons to add a comment:
    (a) The code is confusing without it — a non-obvious invariant, a subtle
        correctness constraint, an algorithm whose intent isn't readable from
        the implementation.
    (b) It's a workaround for an external bug or platform quirk — link the
        issue / CVE / docs that justify it.
    Banned: WHAT-the-code-does comments, task/PR context, restating types,
    commented-out code (delete it; git remembers), section dividers, and
    speculative TODOs. The `// TODO(basile): tighten this <reason>` escape
    hatch from rule 1 is the one exception.
    See `.claude/rules/comments.md` for examples.

16. NEVER GUESS, AND NEVER BE LAZY. Two linked failure modes.
    GUESSING: if a fact isn't directly verifiable from the code, the library
    source, or observed behavior, you do not assert it. You VERIFY (write a
    test, run it, read the dependency in `node_modules`) or you ASK. This is
    rule 10 restated because it is the most-violated rule: "I think it works"
    is a bug. State uncertainty plainly.
    LAZINESS: when you hit friction, the answer is the correct fix, not a
    workaround that hides the problem.
    - Do NOT make a check pass by avoiding it: no excluding files from
      typecheck/lint, no loosening `tsconfig`/`biome.json`, no deleting or
      skipping a test to dodge a failure, no "temporary" hack. (This is the
      spirit of rule 14, beyond inline directives.)
    - Fix the root cause, not the symptom. If your own earlier mistake
      created the friction, undo the mistake — do not build scaffolding
      around it.
    - "It compiles / the test passes" is NOT the bar. The bar is: would a
      careful senior reviewer accept this as the right solution rather than a
      shortcut? If not, it is not done.
    - If the right way is large, unclear, or has real trade-offs, STOP and
      ask (rule 10d) — lay out the correct approach and its cost. Never
      silently take the cheap path to look finished.
    Laziness is a failure mode, like sycophancy (rule 11). Cost = tech debt
    and shipped bugs.

## See also
- `.claude/rules/security.md`
- `.claude/rules/types.md`
- `.claude/rules/testing.md`
- `.claude/rules/boundaries.md`
- `.claude/rules/tools.md`
- `.claude/rules/honesty.md`
- `.claude/rules/mobile.md`
- `.claude/rules/ui.md`
- `.claude/rules/comments.md`
- `.claude/rules/lint.md`
