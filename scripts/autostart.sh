#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

AUTOSTART_DIR="$HOME/.config/autostart"
mkdir -p "$AUTOSTART_DIR"

DESKTOP_FILE="$AUTOSTART_DIR/octo-assistant.desktop"

cat << EOF > "$DESKTOP_FILE"
[Desktop Entry]
Type=Application
Version=1.0
Name=Octo Desktop Assistant
Comment=AI Desktop Companion with Gemini Live
Exec=bash "$ROOT_DIR/scripts/launch.sh"
Path=$ROOT_DIR
Terminal=false
StartupNotify=false
Categories=Utility;ArtificialIntelligence;
EOF

chmod +x "$DESKTOP_FILE"
echo "✓ Successfully installed autostart entry: $DESKTOP_FILE"
