#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/env.sh"

cd "$OSL_REPO_ROOT"
exec "$OSL_BASH_PATH" "$OSL_REPO_ROOT/launchOpenSpatialLab.sh"
