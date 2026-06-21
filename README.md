# Quick

A self-hosted **"drop a folder, get a secure URL"** platform for sharing static apps with clients,
behind per-app access control. Inspired by Shopify's [Quick](https://shopify.engineering/quick),
built on the [onehouse](https://github.com/basilebong) stack (Bun · Hono · React · SQLite).

## What it does

- `quick deploy ./my-app` → your static site is live at `my-app.quick.<domain>` with automatic TLS.
- **Per-app sharing, modelled on Google Drive:**
  - **Google sign-in** — anyone who has the link and signs in with Google can view (identity is
    recorded for the access log). No allowlist.
  - **Secret link** — an expiring, revocable link; no sign-in at all.
- **Building blocks** for static apps, called over `/_api/*` on the app's own origin:
  - a per-app document **database**, and
  - per-app **file storage**.
- An owner **dashboard**, a `quick` **CLI**, and **Claude (MCP) tools** to drive it all.

## Stack

Bun · Hono v4 · React 19 / Vite / Tailwind v4 / shadcn · SQLite (`bun:sqlite`) + Drizzle ·
Better Auth (Google OAuth + OAuth 2.1 for MCP) · Caddy (wildcard TLS via Hetzner DNS-01) ·
Litestream + restic backups · Docker Compose on a single VPS.

## Architecture in one picture

```
slug.quick.<domain>  ──Caddy(*.quick TLS)──▶ Bun :3000 ─▶ resolveApp ─▶ shareGate ─▶ static files
                                                                      └▶ /_api/db, /_api/files
quick.<domain>       ──Caddy(apex TLS)─────▶ Bun :3000 ─▶ dashboard + /api/* (admin) + /mcp
```

A single Bun process resolves the app from the `Host` header, enforces the per-app share gate, and
serves both the static bundle and the building-block APIs. Each app is its **own browser origin**,
so apps can't read each other's storage; **no cookie is ever scoped to the parent domain** (see
`.claude/rules/security.md`).

## Layout

```
apps/
  server/   single Bun runtime (composition only)
  web/      owner admin dashboard (React)
  cli/      the `quick` CLI
packages/
  core/         platform plumbing: ids, auth, db, tenancy middleware, SSO, MCP
  app-hosting/  app registry, deployments, share-links, access log, MCP tools
  app-store/    per-app document database  (/_api/db)
  app-files/    per-app file storage       (/_api/files)
```

## Development

```bash
pnpm install
pnpm hooks:install      # one-time: lefthook pre-commit
pnpm dev                # Hono server + Vite, hot reload (use *.localhost for app subdomains)
pnpm test               # bun test
pnpm typecheck          # tsc -b
pnpm check              # biome lint + format
pnpm db:generate        # drizzle migration from schema
pnpm db:migrate         # apply migrations
```

See [`docs/`](docs/) and the per-directory `CLAUDE.md` files for conventions.

## License

[Elastic License 2.0](LICENSE). © 2026-present Basile.
