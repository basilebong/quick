# Comment rules

## Default: no comments

Well-named identifiers explain *what* the code does. The code itself shows *how*. Don't restate either.

If you can delete the comment and a future reader wouldn't be confused, delete it. If you're writing the comment because you feel obligated, delete it.

## When to write one

Only two reasons:

1. **The code is confusing without it.** A non-obvious invariant, a counter-intuitive ordering requirement, a subtle correctness constraint, an algorithm whose intent isn't readable from the implementation.
2. **It's a workaround explanation.** A bug in a dependency, a platform quirk, a hack that exists because of something external — link to the issue / CVE / docs that justifies the workaround.

That's it.

## What NOT to comment

- WHAT the code does. The identifiers should already say so.
- The current task or PR ("added for the X flow", "fix for #123", "used by Y"). Belongs in the PR description; rots in the codebase.
- TODOs that aren't immediately actionable. File an issue instead.
- Section dividers (`// ===== Setup =====`). Functions and modules are the dividers.
- Commented-out code. Delete it; git remembers.
- Restating types or signatures the type system already encodes.
- Docstrings on internal functions whose name + signature already tells you everything.

## Examples

BAD:
```ts
// Increment counter
counter++;

// Get the user by id
const user = await db.user.findById(id);

// TODO: implement this later
// export const foo = () => ...
```

GOOD (workaround):
```ts
sqlite.exec("PRAGMA busy_timeout = 5000");
sqlite.exec("PRAGMA wal_autocheckpoint = 1000");
sqlite.exec("PRAGMA journal_size_limit = 67108864");
sqlite.exec("VACUUM");
```
(no comment needed — pragmas are self-explanatory)

GOOD (non-obvious invariant):
```ts
await server.connect(transport);
return transport.handleRequest(c.req.raw);
```
(no comment needed)

GOOD (real workaround):
```ts
const port = Number(process.env.PORT ?? 3000);
```
(no comment needed)

GOOD (genuinely needed):
```ts
await new Promise((r) => setTimeout(r, 50));
```
Add: `// Bun.serve race: socket not bound until next tick. See oven-sh/bun#12345.`

## No escape hatch

There is no `// TODO(basile)` carve-out. Per CLAUDE.md rule 14, no
suppression / disable / ignore directives of any kind. If the type system
or a lint rule blocks you, fix the code.
