#!/bin/sh
# Déclenche la synchro FTP → Supabase sur l’app hébergée (Vercel, etc.).
# Variables : OPF_SYNC_URL, OPF_SYNC_TOKEN (fichier env ou export).

set -eu

ENV_FILE="${OPF_SYNC_ENV:-/etc/o-petit-frais-sync.env}"
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  . "$ENV_FILE"
fi

URL="${OPF_SYNC_URL:-}"
TOKEN="${OPF_SYNC_TOKEN:-}"

if [ -z "$URL" ] || [ -z "$TOKEN" ]; then
  echo "OPF_SYNC_URL et OPF_SYNC_TOKEN requis ($ENV_FILE)." >&2
  exit 1
fi

LOG_DIR="${OPF_SYNC_LOG_DIR:-/var/log/o-petit-frais}"
mkdir -p "$LOG_DIR" 2>/dev/null || LOG_DIR="/tmp"
LOG="$LOG_DIR/sync-$(date +%Y%m%d).log"

{
  echo "===== $(date -Iseconds) sync start ====="
  curl -fsS -m 600 -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "x-cron-secret: $TOKEN" \
    "$URL"
  echo ""
  echo "===== $(date -Iseconds) sync end ====="
} >>"$LOG" 2>&1
