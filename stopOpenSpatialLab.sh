#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_DIR="$ROOT/.runtime"
QUIET="${1:-}"
PORTS=("${OSL_FRONTEND_PORT:-8143}" "${OSL_BACKEND_A_PORT:-18151}" "${OSL_BACKEND_B_PORT:-18152}" "${OSL_BACKEND_LOBBY_PORT:-18153}" "${OSL_BACKEND_AIRPORT_PORT:-18154}")

owned_pid() {
  local pid="$1"
  local cwd
  kill -0 "$pid" >/dev/null 2>&1 || return 1
  cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)"
  [ "$cwd" = "$ROOT" ]
}

for file in "$RUN_DIR/world-servers.pid" "$RUN_DIR/frontend.pid"; do
  if [ ! -f "$file" ]; then continue; fi
  pid="$(tr -cd '0-9' < "$file" || true)"
  if [ -n "$pid" ] && owned_pid "$pid"; then
    kill "$pid" >/dev/null 2>&1 || true
  fi
done

for _ in {1..80}; do
  alive=0
  for file in "$RUN_DIR/world-servers.pid" "$RUN_DIR/frontend.pid"; do
    [ -f "$file" ] || continue
    pid="$(tr -cd '0-9' < "$file" || true)"
    if [ -n "$pid" ] && owned_pid "$pid"; then alive=1; fi
  done
  [ "$alive" -eq 0 ] && break
  sleep 0.1
done

for file in "$RUN_DIR/world-servers.pid" "$RUN_DIR/frontend.pid"; do
  [ -f "$file" ] || continue
  pid="$(tr -cd '0-9' < "$file" || true)"
  if [ -n "$pid" ] && owned_pid "$pid"; then
    kill -9 "$pid" >/dev/null 2>&1 || true
  fi
  rm -f "$file"
done

# Fallback: these ports are dedicated to OSL, and this script's whole job is guaranteeing a clean
# slate for the next `npm start` — there's no legitimate case where some OTHER process should be
# left holding one of them. Confirmed necessary in practice, not just theoretical: a second,
# separate checkout of this repo, started independently (its PID untracked by THIS checkout's own
# .runtime/*.pid files, so invisible to the cwd-scoped kill above), kept answering on 8143 with
# stale pre-portal/pre-equipment code after this checkout's own stop+start cycle — reintroducing
# already-fixed bugs, twice, in the same debugging session. Kill by port, not just by this
# checkout's own tracked PIDs.
for port in "${PORTS[@]}"; do
  pids="$(lsof -t -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  [ -z "$pids" ] && continue
  # shellcheck disable=SC2086
  kill $pids >/dev/null 2>&1 || true
done
for _ in {1..80}; do
  busy=0
  for port in "${PORTS[@]}"; do
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1 && busy=1
  done
  [ "$busy" -eq 0 ] && break
  sleep 0.1
done
for port in "${PORTS[@]}"; do
  pids="$(lsof -t -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  [ -z "$pids" ] && continue
  # shellcheck disable=SC2086
  kill -9 $pids >/dev/null 2>&1 || true
done

for port in "${PORTS[@]}"; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    printf 'WARNING: port %s remains occupied and could not be freed.\n' "$port" >&2
  fi
done

if [ "$QUIET" != "--quiet" ]; then
  printf 'Open Spatial Lab stopped. Configured frontend and world-server ports are released.\n'
fi
