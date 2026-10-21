#!/bin/bash
# Track B nightly wrapper — launched by launchd (com.seefood.nightlycrawl),
# not meant to be run by hand (though it's safe to: `bash scripts/mac/run-nightly-crawl.sh`).
#
# What it does, every night around 2am (only while the Mac is awake — launchd
# does not wake a sleeping Mac by default):
#   1. caffeinate -s keeps the Mac from sleeping for the duration of the run
#      (deliberate — a mid-crawl sleep would silently kill the DoorDash/
#      Grubhub Camoufox browser and leave the run half-finished).
#   2. Runs `npm run crawl -- --zone temecula --limit 60` — DoorDash + Grubhub
#      (the only sources that genuinely need this Mac's residential IP) plus
#      website/Menufy/Google/Gemini as a side effect of reusing the same
#      pipeline, for whichever restaurants are next in the corpus backlog
#      (see getSaturationBatch in src/lib/db.ts) or the fixed benchmark seed.
#   3. Logs everything to logs/nightly-crawl-YYYY-MM-DD.log so Kyle can check
#      what happened without watching it run.
set -uo pipefail

# launchd runs with a minimal PATH (no ~/.zshrc, no shell profile sourced) —
# launchd does not inherit an interactive shell's PATH. Use SeeFood's isolated,
# patched Node first; npm/npx remain in ~/.local/bin. Never fall back to an
# unpatched Node binary if the isolated runtime is missing.
SEEFOOD_NODE_BIN="$HOME/.local/share/seefood/node-v22.23.4/bin"
export PATH="$SEEFOOD_NODE_BIN:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
if [[ ! -x "$SEEFOOD_NODE_BIN/node" ]] || [[ "$("$SEEFOOD_NODE_BIN/node" --version)" != "v22.23.4" ]]; then
  echo "SeeFood nightly crawl stopped: patched Node 22.23.4 is not installed." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_DIR="$REPO_DIR/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/nightly-crawl-$(date +%Y-%m-%d).log"

cd "$REPO_DIR" || exit 1

{
  nightly_status=0
  echo "=== SeeFood nightly crawl — $(date) ==="
  # All live cities, including newly published cities; additive, zero paid calls.
  # A fixed reviewed-route refresh remains for linked ordering URLs; the corpus
  # runner discovers new sites and requires per-page identity for auto-import.
  if command -v caffeinate >/dev/null 2>&1; then
    caffeinate -s npx tsx scripts/rollout-structured-platforms.ts --publish --limit=60 || nightly_status=1
  else
    npx tsx scripts/rollout-structured-platforms.ts --publish --limit=60 || nightly_status=1
  fi
  npx tsx scripts/refresh-structured-platforms.ts --publish --limit=3 || nightly_status=1
  if command -v caffeinate >/dev/null 2>&1; then
    caffeinate -s npm run crawl -- --zone temecula --limit 60 || nightly_status=1
  else
    npm run crawl -- --zone temecula --limit 60 || nightly_status=1
  fi
  echo "=== Done — $(date) ==="
  exit "$nightly_status"
} >> "$LOG_FILE" 2>&1
