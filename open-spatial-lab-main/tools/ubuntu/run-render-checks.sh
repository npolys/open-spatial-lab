#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"
export PUPPETEER_EXECUTABLE_PATH="/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
npm run render-adapter-check
