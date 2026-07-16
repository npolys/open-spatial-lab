#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_DIR="$ROOT/.runtime"
BACKEND_PID="$RUN_DIR/world-servers.pid"
FRONTEND_PID="$RUN_DIR/frontend.pid"
BACKEND_LOG="$RUN_DIR/world-servers.log"
FRONTEND_LOG="$RUN_DIR/frontend.log"
PORTS=(18151 18152 18153 18154 8143)

for command in node npm curl lsof; do
  if ! command -v "$command" >/dev/null 2>&1; then
    printf 'ERROR: required command is unavailable: %s\n' "$command" >&2
    exit 1
  fi
done

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
NPM_MAJOR="$(npm --version | cut -d. -f1)"
if [ "$NODE_MAJOR" != "22" ] || [ "$NPM_MAJOR" != "10" ]; then
  printf 'ERROR: Open Spatial Lab requires Node.js 22.x and npm 10.x (found Node %s, npm %s).\n' \
    "$(node --version)" "$(npm --version)" >&2
  exit 1
fi

mkdir -p "$RUN_DIR"
bash "$ROOT/stopOpenSpatialLab.sh" --quiet

for port in "${PORTS[@]}"; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    printf 'ERROR: port %s is already in use by another application.\n' "$port" >&2
    exit 1
  fi
done

node "$ROOT/tools/start-detached.mjs" "$BACKEND_PID" "$BACKEND_LOG" env \
  OSL_WOW_VALIDATE=1 BACKEND_AIRPORT_PORT=18154 \
  node src/orchestrator.js serve-backends

node "$ROOT/tools/start-detached.mjs" "$FRONTEND_PID" "$FRONTEND_LOG" env \
  BACKEND_A_PORT=18151 BACKEND_B_PORT=18152 BACKEND_LOBBY_PORT=18153 BACKEND_AIRPORT_PORT=18154 \
  node src/serve.js 8143

cleanup_on_error() {
  bash "$ROOT/stopOpenSpatialLab.sh" --quiet || true
}
trap cleanup_on_error ERR

for port in "${PORTS[@]}"; do
  ready=0
  for _ in {1..120}; do
    if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then ready=1; break; fi
    sleep 0.1
  done
  if [ "$ready" -ne 1 ]; then
    printf 'ERROR: service did not become ready on port %s. See %s.\n' "$port" "$RUN_DIR" >&2
    exit 1
  fi
done

if [ "$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8143/)" != "200" ]; then
  printf 'ERROR: launcher did not return HTTP 200. See %s.\n' "$FRONTEND_LOG" >&2
  exit 1
fi

trap - ERR
printf '\nOpen Spatial Lab is ready.\n'
printf 'Launcher:            http://127.0.0.1:8143/\n'
printf 'Lobby player:        http://127.0.0.1:8143/index.html?role=player&intro=bypass\n'
printf 'Location A observer: http://127.0.0.1:8143/index.html?role=source&intro=bypass\n'
printf 'Location B observer: http://127.0.0.1:8143/index.html?role=target&intro=bypass\n'
printf 'Stop:                npm stop\n'
