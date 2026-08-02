#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

export OSL_REPO_ROOT="$REPO_ROOT"
export OSL_RUNTIME_DIR="${OSL_RUNTIME_DIR:-$REPO_ROOT/.runtime}"

if [[ -z "${OSL_BASH_PATH:-}" ]]; then
  if command -v bash >/dev/null 2>&1; then
    export OSL_BASH_PATH="$(command -v bash)"
  else
    export OSL_BASH_PATH="/usr/bin/bash"
  fi
fi

export OSL_FRONTEND_PORT="${OSL_FRONTEND_PORT:-8143}"
export OSL_BACKEND_A_PORT="${OSL_BACKEND_A_PORT:-18151}"
export OSL_BACKEND_B_PORT="${OSL_BACKEND_B_PORT:-18152}"
export OSL_BACKEND_LOBBY_PORT="${OSL_BACKEND_LOBBY_PORT:-18153}"
export OSL_BACKEND_AIRPORT_PORT="${OSL_BACKEND_AIRPORT_PORT:-18154}"

mkdir -p "$OSL_RUNTIME_DIR"
export PATH="$REPO_ROOT/tools:$PATH"
