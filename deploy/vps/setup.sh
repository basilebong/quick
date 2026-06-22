#!/usr/bin/env bash
#
# Quick — install behind an existing host Caddy, using on-demand TLS (no DNS plugin).
#
# Idempotent. Configure quick.conf (copy quick.conf.example) then run as root from
# the bundle directory:
#
#     cp quick.conf.example quick.conf && "$EDITOR" quick.conf
#     sudo bash deploy/vps/setup.sh
#
# Per-box values come from quick.conf or matching env vars; nothing host-specific is
# baked into this script. It creates the deploy user + /opt/<user>, installs the
# caddy-less compose stack + a force-commanded CI deploy key, and splices apex +
# wildcard blocks into the host Caddyfile (validate-before-swap). It writes NO
# secrets; it prints the remaining manual steps at the end.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONF="${SCRIPT_DIR}/quick.conf"
TMPL="${SCRIPT_DIR}/caddy-quick.snippet.tmpl"
PLACEHOLDER_DOMAIN="quick.example.com"
MARKER_BEGIN="# >>> quick BEGIN"
OD_BEGIN="# >>> quick on_demand_tls BEGIN (managed by deploy/vps/setup.sh) >>>"
OD_END="# <<< quick on_demand_tls END (managed by deploy/vps/setup.sh) <<<"

log()  { printf '\033[1;32m[setup]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[setup]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[setup] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

# ---- configuration (quick.conf, overridable by env) ------------------------
conf_get() {
  [[ -f "$CONF" ]] || return 0
  sed -n "s/^[[:space:]]*${1}=//p" "$CONF" | tail -n1
}

load_config() {
  QUICK_DOMAIN="${QUICK_DOMAIN:-$(conf_get QUICK_DOMAIN)}"
  APP_PORT="${APP_PORT:-$(conf_get APP_PORT)}";       APP_PORT="${APP_PORT:-8003}"
  DEPLOY_USER="${DEPLOY_USER:-$(conf_get DEPLOY_USER)}"; DEPLOY_USER="${DEPLOY_USER:-quick}"
  PUBLIC_IP="${PUBLIC_IP:-$(conf_get PUBLIC_IP)}";    PUBLIC_IP="${PUBLIC_IP:-<your-vps-ip>}"
  OPT_DIR="${OPT_DIR:-/opt/${DEPLOY_USER}}"
  ASK_PATH="${ASK_PATH:-/_internal/tls-check}"
  CADDYFILE="${CADDYFILE:-/etc/caddy/Caddyfile}"
  ASK_URL="http://127.0.0.1:${APP_PORT}${ASK_PATH}"
  APP_ADDR="127.0.0.1:${APP_PORT}"

  [[ -n "$QUICK_DOMAIN" && "$QUICK_DOMAIN" != "$PLACEHOLDER_DOMAIN" ]] \
    || die "set QUICK_DOMAIN in $CONF (copy quick.conf.example) or pass QUICK_DOMAIN=... — refusing to run with the placeholder"
  [[ "$QUICK_DOMAIN" =~ ^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$ ]] || die "QUICK_DOMAIN '$QUICK_DOMAIN' does not look like a domain"
  [[ "$APP_PORT" =~ ^[0-9]+$ ]] || die "APP_PORT must be numeric, got '$APP_PORT'"
}

# ---- preflight -------------------------------------------------------------
preflight() {
  [[ "$(id -u)" -eq 0 ]] || die "must run as root: sudo bash deploy/vps/setup.sh"
  command -v docker >/dev/null            || die "docker not found"
  docker compose version >/dev/null 2>&1  || die "docker compose plugin not found"
  command -v caddy >/dev/null             || die "caddy not found (this recipe needs the host's stock Caddy)"
  command -v systemctl >/dev/null         || die "systemctl not found"
  command -v ssh-keygen >/dev/null        || die "ssh-keygen not found"
  [[ -f "$CADDYFILE" ]]                   || die "$CADDYFILE not found (is the host Caddy installed?)"
  [[ -f "$TMPL" ]]                        || die "missing $TMPL (run from the bundle dir)"
  [[ -f "${SCRIPT_DIR}/compose.behind-proxy.yml" ]] || die "missing compose.behind-proxy.yml"
  [[ -f "${SCRIPT_DIR}/litestream.yml" ]]           || die "missing litestream.yml"
  [[ -f "${SCRIPT_DIR}/.env.example" ]]             || die "missing .env.example"
}

# ---- system user + directories --------------------------------------------
ensure_user() {
  if ! id -u "$DEPLOY_USER" >/dev/null 2>&1; then
    useradd --system --home-dir "$OPT_DIR" --shell /bin/bash "$DEPLOY_USER"
    log "created system user '$DEPLOY_USER'"
  fi
  if ! id -nG "$DEPLOY_USER" | tr ' ' '\n' | grep -qx docker; then
    usermod -aG docker "$DEPLOY_USER"
    log "added '$DEPLOY_USER' to the docker group"
  fi
  install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$OPT_DIR"
  install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$OPT_DIR/data"
}

# ---- curated stack ---------------------------------------------------------
install_stack() {
  install -m 640 -o root -g "$DEPLOY_USER" "${SCRIPT_DIR}/compose.behind-proxy.yml" "$OPT_DIR/compose.yaml"
  install -m 640 -o root -g "$DEPLOY_USER" "${SCRIPT_DIR}/litestream.yml"            "$OPT_DIR/litestream.yml"

  cat > "$OPT_DIR/deploy.sh" <<DEPLOY
#!/usr/bin/env bash
# Single source of truth for the deploy commands. The CI SSH key is force-commanded
# to run exactly this. COMPOSE_PROFILES=prod (from .env) activates the stack.
set -euo pipefail
cd ${OPT_DIR}
docker compose pull app
docker compose up -d
DEPLOY
  chown root:"$DEPLOY_USER" "$OPT_DIR/deploy.sh"
  chmod 750 "$OPT_DIR/deploy.sh"
  log "installed compose.yaml, litestream.yml, deploy.sh"

  if [[ ! -e "$OPT_DIR/.env" ]]; then
    install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "${SCRIPT_DIR}/.env.example" "$OPT_DIR/.env"
    log "installed starter $OPT_DIR/.env from .env.example — FILL IT IN (step 1 below)"
  else
    log "$OPT_DIR/.env already exists; left untouched"
  fi
}

# ---- CI deploy key (force-commanded) --------------------------------------
ensure_ci_key() {
  install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$OPT_DIR/.ssh"
  if [[ ! -e "$OPT_DIR/.ssh/id_ed25519" ]]; then
    ssh-keygen -t ed25519 -N '' -C 'quick-ci-deploy' -f "$OPT_DIR/.ssh/id_ed25519" >/dev/null
    chown "$DEPLOY_USER":"$DEPLOY_USER" "$OPT_DIR/.ssh/id_ed25519" "$OPT_DIR/.ssh/id_ed25519.pub"
    chmod 600 "$OPT_DIR/.ssh/id_ed25519"
    chmod 644 "$OPT_DIR/.ssh/id_ed25519.pub"
    log "generated CI deploy keypair at $OPT_DIR/.ssh/id_ed25519"
  else
    log "CI deploy keypair already present; preserved"
  fi
  # Lock the key to deploy.sh: sshd runs the forced command regardless of what the
  # client sends, and `restrict` disables pty/agent/port forwarding.
  printf 'restrict,command="%s/deploy.sh" %s\n' \
    "$OPT_DIR" "$(cat "$OPT_DIR/.ssh/id_ed25519.pub")" > "$OPT_DIR/.ssh/authorized_keys"
  chown "$DEPLOY_USER":"$DEPLOY_USER" "$OPT_DIR/.ssh/authorized_keys"
  chmod 600 "$OPT_DIR/.ssh/authorized_keys"
}

# ---- host Caddy ------------------------------------------------------------
render_snippet() {
  sed -e "s|@@QUICK_DOMAIN@@|${QUICK_DOMAIN}|g" \
      -e "s|@@APP_ADDR@@|${APP_ADDR}|g" \
      -e "s|@@ASK_URL@@|${ASK_URL}|g" \
      "$TMPL" | awk '/^# >>> quick BEGIN/{p=1} p{print}'
}

# The global options block is the first brace group; the on-demand ask directive
# belongs there (Caddy allows only one global block). True if the first non-comment,
# non-blank line opens a block with no address before it.
first_real_line_is_brace() {
  local line
  line="$(grep -vE '^[[:space:]]*(#|$)' "$1" | head -n1 || true)"
  [[ "$line" =~ ^[[:space:]]*\{ ]]
}

configure_caddy() {
  local candidate changed=0 snippet backup tmp
  candidate="$(mktemp)"
  cp "$CADDYFILE" "$candidate"

  if grep -qF "$OD_BEGIN" "$candidate" || grep -qF "ask ${ASK_URL}" "$candidate"; then
    log "Quick's on_demand_tls ask already present; global block left as-is"
  elif grep -q 'on_demand_tls' "$candidate"; then
    die "host Caddy already has a global on_demand_tls with a different ask endpoint. Caddy allows only ONE; merge Quick's ask ($ASK_URL) into the existing block by hand (or remove it), then re-run. Refusing to touch it."
  else
    tmp="$(mktemp)"
    if first_real_line_is_brace "$candidate"; then
      awk -v url="$ASK_URL" -v ob="$OD_BEGIN" -v oe="$OD_END" '
        BEGIN { ins = "\t" ob "\n\ton_demand_tls {\n\t\task " url "\n\t}\n\t" oe; depth=0; started=0; done=0 }
        {
          if (done) { print; next }
          out=""; n=length($0)
          for (i=1;i<=n;i++) {
            c=substr($0,i,1)
            if (c=="#") { out=out substr($0,i); break }
            if (c=="{") { depth++; started=1; out=out c; continue }
            if (c=="}") {
              if (started && depth==1) { out=out "\n" ins "\n"; done=1 }
              depth--; out=out c; continue
            }
            out=out c
          }
          print out
        }
      ' "$candidate" > "$tmp"
    else
      warn "no global options block found; prepending one with the on_demand_tls ask"
      { printf '%s\n{\n\ton_demand_tls {\n\t\task %s\n\t}\n}\n%s\n\n' "$OD_BEGIN" "$ASK_URL" "$OD_END"; cat "$candidate"; } > "$tmp"
    fi
    mv "$tmp" "$candidate"
    changed=1
    log "inserted on_demand_tls ask -> $ASK_URL"
  fi

  if grep -qF "$MARKER_BEGIN" "$candidate"; then
    log "Quick site blocks already present; skipping append"
  else
    snippet="$(render_snippet)"
    { printf '\n'; printf '%s\n' "$snippet"; } >> "$candidate"
    changed=1
    log "appended apex + wildcard site blocks for $QUICK_DOMAIN"
  fi

  if [[ "$changed" -eq 0 ]]; then
    rm -f "$candidate"
    log "host Caddy already configured; nothing to do"
    return 0
  fi

  if ! caddy validate --config "$candidate" --adapter caddyfile >/dev/null 2>&1; then
    warn "candidate Caddyfile FAILED validation — $CADDYFILE left UNTOUCHED:"
    caddy validate --config "$candidate" --adapter caddyfile || true
    die "kept the broken candidate at $candidate for inspection"
  fi

  backup="${CADDYFILE}.bak.$(date +%Y%m%d%H%M%S)"
  cp "$CADDYFILE" "$backup"
  install -m 0644 -o root -g root "$candidate" "$CADDYFILE"
  rm -f "$candidate"
  systemctl reload caddy
  log "Caddyfile updated (backup: $backup) and caddy reloaded"
}

# ---- manual steps ----------------------------------------------------------
print_next_steps() {
  cat <<BANNER

$(log "setup complete — remaining MANUAL steps:")

  1. Fill in the environment file (contains secrets):
       sudo -u $DEPLOY_USER nano $OPT_DIR/.env
     Required: BETTER_AUTH_URL=https://$QUICK_DOMAIN, BETTER_AUTH_SECRET
     (openssl rand -hex 32), GOOGLE_ID, GOOGLE_SECRET, QUICK_ALLOWED_EMAILS.
     Backups are opt-in: set COMPOSE_PROFILES=prod,backup and fill STORAGE_BOX_*
     + RESTIC_* to enable litestream + restic.

  2. GitHub -> repo Settings -> Environments -> 'production' -> add secrets:
       VPS_HOST    = $PUBLIC_IP
       VPS_SSH_KEY = the PRIVATE key at $OPT_DIR/.ssh/id_ed25519 (whole block,
                     incl. BEGIN/END lines). Print it deliberately when ready:
                       sudo cat $OPT_DIR/.ssh/id_ed25519

  3. DNS at your registrar — confirm A records for the apex AND the wildcard:
       $QUICK_DOMAIN        ->  $PUBLIC_IP
       *.$QUICK_DOMAIN      ->  $PUBLIC_IP

  4. Google OAuth -> Authorized redirect URI:
       https://$QUICK_DOMAIN/api/auth/callback/google

  5. Push to main. The deploy workflow builds + pushes the image and SSHes in as
     '$DEPLOY_USER'; the forced command runs $OPT_DIR/deploy.sh.

  Verify afterwards:
       curl -I https://$QUICK_DOMAIN/
       sudo -u $DEPLOY_USER docker compose -f $OPT_DIR/compose.yaml ps
       caddy validate --config $CADDYFILE --adapter caddyfile
BANNER
}

main() {
  load_config
  preflight
  ensure_user
  install_stack
  ensure_ci_key
  configure_caddy
  print_next_steps
}

main "$@"
