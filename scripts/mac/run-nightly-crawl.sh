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
# node/npm live in ~/.local/bin on this Mac and simply aren't found
# otherwise ("npm: No such file or directory"), even though the exact same
# script works fine when run by hand from an interactive Terminal. Covers
# the other common install locations too (Homebrew, nvm-less system npm)
# so this keeps working if node's install method ever changes.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_DIR="$REPO_DIR/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/nightly-crawl-$(date +%Y-%m-%d).log"

cd "$REPO_DIR" || exit 1

{
  echo "=== SeeFood nightly crawl — $(date) ==="
  if command -v caffeinate >/dev/null 2>&1; then
    caffeinate -s npm run crawl -- --zone temecula --limit 60
  else
    npm run crawl -- --zone temecula --limit 60
  fi
  echo "=== Done — $(date) ==="
} >> "$LOG_FILE" 2>&1
