#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"
# Same default the other Ubuntu/WSL tooling uses (run-with-recovery.sh) — a real, installed-by-the
# apt-get line in the README Debian/Ubuntu chromium path, not a machine-specific browser location.
export PUPPETEER_EXECUTABLE_PATH="${PUPPETEER_EXECUTABLE_PATH:-/usr/bin/chromium-browser}"
npm run render-adapter-check
