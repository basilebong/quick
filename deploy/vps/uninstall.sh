#!/usr/bin/env bash
#
# Quick — reverse the host-Caddy install. Idempotent. Run as root from the bundle:
#
#     sudo bash deploy/vps/uninstall.sh                 # stop stack, revert Caddy, KEEP data
#     sudo bash deploy/vps/uninstall.sh --purge-data    # also delete /opt/<user>/data
#     sudo bash deploy/vps/uninstall.sh --remove-user   # full teardown: user + /opt/<user> (incl. data)
#
# Caddy is reverted safely: the candidate config is validated BEFORE it replaces the
# live file, so a mistake can never take down the other sites on the box. DNS records
# live at your registrar and are not touched.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONF="${SCRIPT_DIR}/quick.conf"
MARKER_BEGIN="# >>> quick BEGIN"

log()  { printf '\033[1;32m[uninstall]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[uninstall]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[uninstall] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

PURGE_DATA=0
REMOVE_USER=0

conf_get() {
  [[ -f "$CONF" ]] || return 0
  sed -n "s/^[[:space:]]*${1}=//p" "$CONF" | tail -n1
}

load_config() {
  DEPLOY_USER="${DEPLOY_USER:-$(conf_get DEPLOY_USER)}"; DEPLOY_USER="${DEPLOY_USER:-quick}"
  OPT_DIR="${OPT_DIR:-/opt/${DEPLOY_USER}}"
  CADDYFILE="${CADDYFILE:-/etc/caddy/Caddyfile}"
}

parse_args() {
  for arg in "$@"; do
    case "$arg" in
      --purge-data)  PURGE_DATA=1 ;;
      --remove-user) REMOVE_USER=1 ;;
      -h|--help)
        grep -E '^#( |$)' "${BASH_SOURCE[0]}" | sed -E 's/^# ?//'
        exit 0 ;;
      *) die "unknown flag: $arg (try --help)" ;;
    esac
  done
}

preflight() {
  [[ "$(id -u)" -eq 0 ]] || die "must run as root: sudo bash deploy/vps/uninstall.sh"
  command -v caddy >/dev/null     || die "caddy not found"
  command -v systemctl >/dev/null || die "systemctl not found"
  [[ -f "$CADDYFILE" ]]           || die "$CADDYFILE not found"
}

stop_stack() {
  if [[ -f "$OPT_DIR/compose.yaml" ]]; then
    ( cd "$OPT_DIR" && docker compose down ) || warn "'docker compose down' failed (continuing)"
    log "stopped and removed containers"
  else
    log "no compose.yaml at $OPT_DIR; nothing to stop"
  fi
}

# Drop the marker region AND the on_demand_tls block from the global options, then
# validate the candidate BEFORE swapping it in.
revert_caddy() {
  if ! grep -qF "$MARKER_BEGIN" "$CADDYFILE" && ! grep -q 'on_demand_tls' "$CADDYFILE"; then
    log "no Quick Caddy blocks present; nothing to revert"
    return 0
  fi
  local candidate backup
  candidate="$(mktemp)"
  awk '
    /# <<< quick END/ { skip=0; next }
    /# >>> quick BEGIN/ { skip=1 }
    skip { next }
    { print }
  ' "$CADDYFILE" | awk '
    {
      if (rm) {
        for (i=1;i<=length($0);i++){c=substr($0,i,1); if(c=="{")d++; else if(c=="}")d--}
        if (d<=0) rm=0
        next
      }
      if ($0 ~ /^[[:space:]]*on_demand_tls[[:space:]]*\{/) {
        d=0
        for (i=1;i<=length($0);i++){c=substr($0,i,1); if(c=="{")d++; else if(c=="}")d--}
        if (d>0) rm=1
        next
      }
      print
    }
  ' > "$candidate"

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
  log "removed Quick Caddy blocks (backup: $backup) and reloaded caddy"
}

remove_disk() {
  if [[ "$REMOVE_USER" -eq 1 ]]; then
    if id -u "$DEPLOY_USER" >/dev/null 2>&1; then
      userdel "$DEPLOY_USER" || warn "userdel '$DEPLOY_USER' failed"
      log "removed system user '$DEPLOY_USER'"
    fi
    rm -rf "${OPT_DIR:?OPT_DIR unset}"
    warn "removed $OPT_DIR (including data)"
    return 0
  fi
  if [[ "$PURGE_DATA" -eq 1 ]]; then
    rm -rf "${OPT_DIR:?OPT_DIR unset}/data"
    warn "purged $OPT_DIR/data"
  else
    log "kept $OPT_DIR and its data (use --purge-data or --remove-user to delete)"
  fi
}

main() {
  parse_args "$@"
  load_config
  preflight
  stop_stack
  revert_caddy
  remove_disk
  log "uninstall complete. DNS records (at your registrar) were not touched."
}

main "$@"
