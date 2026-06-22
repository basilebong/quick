# Deploying Quick behind an existing reverse proxy

This bundle installs Quick onto a VPS that **already runs a reverse proxy on
80/443** (a shared box hosting other sites). Quick's own bundled Caddy is dropped;
the host proxy terminates TLS and reverse-proxies to the Quick app on a loopback
port.

> Deploying to a fresh box with nothing else on it? You don't need this bundle —
> use the repo's self-contained story instead (`docker-compose.yml` +
> `Dockerfile.caddy`), where Quick's own Caddy owns 80/443 and gets a wildcard
> cert via DNS-01. See the root `README.md`.

## The contract (any proxy)

Quick serves plain HTTP on one port and resolves the tenant from the `Host`
header. To front it with **any** proxy you need three things:

1. Run the app container bound to a loopback port (this bundle's
   `compose.behind-proxy.yml` uses `127.0.0.1:8003`).
2. Reverse-proxy **both** the apex and the wildcard to it, preserving `Host`:
   - `quick.example.com` → `127.0.0.1:8003`
   - `*.quick.example.com` → `127.0.0.1:8003`
3. Provide TLS for both names. A deployed app lives at `<slug>.quick.example.com`,
   so you need a cert that covers the wildcard.
4. Do **not** expose `/_internal/*` to the public. It's the loopback `ask` route
   (below); answering it publicly turns it into a deployed-slug oracle. This
   recipe's Caddyfile returns `404` for `/_internal/*` on both vhosts; nginx/Traefik
   users should add the equivalent deny.

How you do step 3 depends on the proxy:

| Host proxy | Wildcard TLS | Needs the `ask` endpoint? |
|---|---|---|
| **Caddy** (this recipe) | on-demand TLS — a per-subdomain cert issued via HTTP-01 on first request | **Yes** |
| nginx + certbot | one `*.quick.example.com` cert via **DNS-01** | No |
| Traefik | built-in ACME with a **DNS-01** provider | No |

The wildcard-cert approaches (nginx/Traefik) cover every subdomain with one cert,
so there is no per-subdomain issuance to gate. **On-demand TLS is the only
approach that needs the `ask` endpoint** (below) — it's specific to "stock Caddy,
no DNS plugin."

## How on-demand TLS works here

The wildcard site uses `tls { on_demand }`. On the first request to a new
`<slug>.quick.example.com`, Caddy obtains a certificate for that exact hostname
via HTTP-01 — so the first hit may stall ~1s, then it's cached.

To stop Caddy from minting certs for arbitrary hostnames pointed at the IP (and
burning Let's Encrypt rate limits), Caddy is told to **ask** the app first. The
global options block gets:

```
on_demand_tls {
	ask http://127.0.0.1:8003/_internal/tls-check
}
```

Caddy calls `GET …/_internal/tls-check?domain=<sni-host>` before each issuance.
The app (`packages/core/src/server/middleware/tls-check.ts`) returns `200` only
for the apex and for `<slug>` values that resolve to a known app (a created slug),
and `404` otherwise. The route is unauthenticated, read-only, and runs ahead of the
share gate.

> **Let's Encrypt limits:** on-demand issues one cert per new subdomain. LE allows
> ~50 certificates per registered domain per week. Fine for normal use; if you
> expect to churn through many subdomains rapidly, prefer a wildcard DNS-01 cert.

## Prerequisites

- A host already running **stock Caddy** (`caddy.service`) with a single global
  options block and a writable `/etc/caddy/Caddyfile`.
- Docker + the Compose plugin.
- DNS **A records** at your registrar, both pointing at the VPS:
  - `quick.example.com` → `<your-vps-ip>`
  - `*.quick.example.com` → `<your-vps-ip>`
- The ghcr image is public, so the box pulls anonymously (no `docker login`).

## Files

| File | Purpose |
|---|---|
| `setup.sh` | Idempotent installer (run with `sudo`). |
| `uninstall.sh` | Safe reversal (validate-before-swap; keeps data by default). |
| `compose.behind-proxy.yml` | App (loopback) + opt-in litestream + restic backups (behind the `backup` profile). No Caddy. Installed as `/opt/quick/compose.yaml`. |
| `litestream.yml` | SQLite replication config (installed alongside). |
| `caddy-quick.snippet.tmpl` | The apex + wildcard Caddy blocks; `setup.sh` renders the `@@PLACEHOLDERS@@` from `quick.conf`. |
| `quick.conf.example` | Per-box values (domain, port, user, IP). Copy to `quick.conf` (gitignored). |
| `.env.example` | App runtime env (secrets). Installed as `/opt/quick/.env` if absent. |

Nothing host-specific or secret is committed: `quick.conf` is gitignored, the CI
SSH key is generated on the box, and `.env` ships only as a placeholder example.

## Run order

```bash
# on the VPS, from the bundle directory:
cp quick.conf.example quick.conf
"$EDITOR" quick.conf            # set QUICK_DOMAIN, APP_PORT, DEPLOY_USER, PUBLIC_IP
sudo bash setup.sh
```

`setup.sh` then prints the remaining **manual** steps:

1. **Fill `/opt/quick/.env`** — `BETTER_AUTH_URL=https://<your domain>`,
   `BETTER_AUTH_SECRET` (`openssl rand -hex 32`), `GOOGLE_ID`, `GOOGLE_SECRET`,
   `QUICK_ALLOWED_EMAILS`. Backups are opt-in: set `COMPOSE_PROFILES=prod,backup`
   and fill `STORAGE_BOX_*` / `RESTIC_*` to enable litestream + restic.
2. **GitHub → Settings → Environments → `production` → secrets:**
   - `VPS_HOST` = your VPS IP
   - `VPS_SSH_KEY` = the **private** key `setup.sh` prints (also at
     `/opt/quick/.ssh/id_ed25519`)
3. **DNS** — confirm the two A records above exist.
4. **Google OAuth** → Authorized redirect URI
   `https://<your domain>/api/auth/callback/google`.
5. **Push to `main`** → the `deploy` workflow builds + pushes the image and SSHes
   in as the deploy user; the forced command runs `/opt/quick/deploy.sh`
   (`docker compose pull app && docker compose up -d`).

## Verify

```bash
curl -I https://quick.example.com/                       # 200/302
# deploy a test app, then (first hit stalls ~1s while the cert issues):
curl -I https://demo.quick.example.com/
# the ask endpoint: real slug -> 200, bogus slug -> 404
curl -so /dev/null -w '%{http_code}\n' 'http://127.0.0.1:8003/_internal/tls-check?domain=demo.quick.example.com'
sudo -u quick docker compose -f /opt/quick/compose.yaml ps
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

## Uninstall

```bash
sudo bash uninstall.sh                 # stop stack, revert Caddy, KEEP data
sudo bash uninstall.sh --purge-data    # also delete /opt/quick/data
sudo bash uninstall.sh --remove-user   # full teardown: user + /opt/quick (incl. data)
```

Caddy is reverted by stripping the two marked regions Quick added (the site blocks
and the `on_demand_tls` directive), validating the candidate **before** it replaces
the live file, so the other sites on the box are never put at risk. DNS records live
at your registrar and are not touched.

## Notes

- Default `DEPLOY_USER` is `quick` and the path is `/opt/quick`. If you change
  `DEPLOY_USER` in `quick.conf`, also update `username:` and the script path in
  `.github/workflows/deploy.yml`.
- `APP_PORT` appears in both `quick.conf` (Caddy + ask URL) and `.env` (the compose
  port mapping). Keep them in sync.
- The bundled-Caddy assets at the repo root (`Dockerfile.caddy`,
  `docker-compose.yml`) are intentionally kept for the self-contained / other-host
  story; this recipe simply doesn't use them.
