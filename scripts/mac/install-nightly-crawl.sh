#!/bin/bash
# One-time setup (Kyle runs this once, on his Mac, from the repo root):
#   bash scripts/mac/install-nightly-crawl.sh
#
# Installs a launchd LaunchAgent that runs the Track B crawler
# (run-nightly-crawl.sh) automatically every night around 2am. After this,
# no manual commands are needed — just leave the Mac on and plugged in
# overnight periodically. See DECISIONS.md "Removing the founder as the
# crawl bottleneck" for the full explanation of what this does and why.
#
# Safe to rerun (e.g. after moving the repo) — unloads any existing copy
# first, then reinstalls with the current path.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
LABEL="com.seefood.nightlycrawl"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"

mkdir -p "$HOME/Library/LaunchAgents" "$REPO_DIR/logs"

if launchctl list "$LABEL" >/dev/null 2>&1; then
  echo "Existing job found — unloading before reinstall..."
  launchctl unload "$PLIST_PATH" 2>/dev/null || true
fi

cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$REPO_DIR/scripts/mac/run-nightly-crawl.sh</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>2</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>RunAtLoad</key>
    <false/>
    <key>StandardOutPath</key>
    <string>$REPO_DIR/logs/launchd.out.log</string>
    <key>StandardErrorPath</key>
    <string>$REPO_DIR/logs/launchd.err.log</string>
</dict>
</plist>
PLIST

launchctl load -w "$PLIST_PATH"

echo ""
echo "Installed. The crawler will run automatically every night around 2am"
echo "(only while this Mac is awake — it won't wake a sleeping Mac)."
echo ""
echo "Useful commands:"
echo "  Check it's loaded:     launchctl list | grep seefood"
echo "  Run it right now:      launchctl start $LABEL"
echo "  See tonight's log:     tail -f \"$REPO_DIR/logs/nightly-crawl-\$(date +%Y-%m-%d).log\""
echo "  Uninstall:             launchctl unload \"$PLIST_PATH\" && rm \"$PLIST_PATH\""
