#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/env.sh"

cd "$OSL_REPO_ROOT"

if [[ $# -eq 0 ]]; then
  exec "$OSL_BASH_PATH" --login
else
  exec "$OSL_BASH_PATH" "$@"
fi
