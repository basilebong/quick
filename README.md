# Quick

A self-hosted **"drop a folder, get a secure URL"** platform for sharing static apps with clients,
behind per-app access control. Inspired by Shopify's [Quick](https://shopify.engineering/quick),
built on Bun · Hono · React · SQLite.

## What it does

- Ask **Claude** (over MCP) to deploy a set of files → your static app is live at
  `my-app.quick.<domain>` with automatic TLS.
- **Per-app sharing, modelled on Google Drive:**
  - **Google sign-in** — anyone who has the link and signs in with Google can view (identity is
    recorded for the access log). No allowlist.
  - **Secret link** — an expiring, revocable link; no sign-in at all.
- **Building blocks** for static apps, called over `/_api/*` on the app's own origin:
  - a per-app document **database**, and
  - per-app **file storage**.
- An owner **dashboard** and **Claude (MCP) tools** to drive it all.

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
packages/
  core/         platform plumbing: ids, auth, db, tenancy middleware, SSO, MCP
  app-hosting/  app registry, deployments, share-links, access log, MCP tools
  app-store/    per-app document database  (/_api/db)
  app-files/    per-app file storage       (/_api/files)
```

## Deploy on a VPS

Quick runs as four containers — **app · Caddy · Litestream · restic** — from one `docker compose`
profile on a single host with Docker installed.

**You provide:** a VPS with Docker + the Compose plugin and ports **80/443** open; a root domain
whose DNS is hosted on **Hetzner DNS** plus an API token scoped to that zone (for the wildcard
TLS DNS-01 challenge); a **Google OAuth** web client; and an S3-compatible **object storage** bucket
(e.g. Hetzner) for backups.

**1. Point DNS at the VPS** — two records, both to the VPS IP:

```
quick.example.com     A/AAAA → <vps-ip>     # apex: dashboard + owner API + MCP
*.quick.example.com   A/AAAA → <vps-ip>     # deployed apps
```

**2. Create the Google OAuth client** (type *Web application*) with one authorized redirect URI:

```
https://quick.example.com/api/auth/callback/google
```

**3. Configure `.env`** on the VPS:

```bash
git clone https://github.com/basilebong/quick && cd quick
cp .env.example .env
```

Fill it in (every key is documented inline in [`.env.example`](.env.example)). The production-specific
values:

```ini
QUICK_DOMAIN=quick.example.com
ACME_EMAIL=you@example.com
HETZNER_DNS_API_TOKEN=...              # scoped to the zone above
BETTER_AUTH_URL=https://quick.example.com
BETTER_AUTH_SECRET=...                 # openssl rand -hex 32
GOOGLE_ID=...
GOOGLE_SECRET=...
QUICK_ALLOWED_EMAILS=you@example.com   # owner account(s), comma-separated
MCP_HOST=quick.example.com
NODE_ENV=production
STORAGE_BOX_KEY=...                    # object-storage credentials (Litestream + restic)
STORAGE_BOX_SECRET=...
RESTIC_REPOSITORY=s3:https://fsn1.your-objectstorage.com/quick-backup/apps
RESTIC_PASSWORD=...
```

**4. Launch:**

```bash
docker compose --profile prod up -d --build
```

That starts:

- **app** — the Bun server on `:3000`; DB migrations run automatically on start and data persists
  under `./data`.
- **caddy** — terminates TLS on `:80/:443`: the apex cert via HTTP-01, the `*.quick.<domain>`
  wildcard via the Hetzner DNS-01 challenge.
- **litestream** — streams the SQLite DB (including inline file BLOBs) to object storage.
- **apps-backup** — a daily encrypted restic backup of deployed bundles + uploads under `/data/apps`.

Give Caddy a minute to obtain certificates (`docker compose --profile prod logs -f caddy`), then open
**https://quick.example.com** and sign in with an owner Google account.

**5. Deploy an app.** Connect Claude to `https://quick.example.com/mcp` — it discovers the OAuth
server and walks you through Google sign-in + the consent screen — then ask it to deploy:

> Deploy these files to `my-app` on Quick, then give me a 7-day secret link.

Claude calls `quick__deploy_files` and the app goes live at `my-app.quick.example.com`. To edit an
existing app, Claude reads the current files back with `quick__get_app_files`, changes them, and
re-deploys the full set (deploys are immutable, full-replacement versions; rollback from the
dashboard). Apps Claude deploys can call the per-app building blocks — the document database at
`/_api/db` and file storage at `/_api/files` — from their own client-side JS, so you can ask for
dynamic, stateful apps, not just static pages.

**Updating Quick itself:** re-run `docker compose --profile prod up -d --build` (migrations re-run idempotently).
The included `.github/workflows/deploy.yml` can instead build the images and SSH-deploy on push.

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
