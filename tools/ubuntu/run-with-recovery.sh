#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/env.sh"

cd "$OSL_REPO_ROOT"

# No port-cleanup loop here — launchOpenSpatialLab.sh (which `npm start` below runs) already calls
# stopOpenSpatialLab.sh --quiet as its own first step, which does a strictly more thorough job:
# owned-PID kill first, then a port-based fallback that kills anything on OSL's 5 configured ports
# regardless of which process/checkout owns it (SIGTERM then SIGKILL, with a readiness wait) — the
# fix for a real, repeatedly-hit problem where a second, independent checkout of this repo silently
# keeps answering on port 8143 after this checkout's own stop/start cycle. A second, separate,
# weaker fuser-based kill here duplicated that work and could drift out of sync with it over time.
export PUPPETEER_EXECUTABLE_PATH="${PUPPETEER_EXECUTABLE_PATH:-/usr/bin/chromium-browser}"
exec npm start
