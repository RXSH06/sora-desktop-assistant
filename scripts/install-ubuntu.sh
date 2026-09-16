#!/usr/bin/env bash
set -e

echo "=========================================================="
echo "    Octo Desktop AI Assistant - Ubuntu 24.04 Setup       "
echo "=========================================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

echo "[1/5] Checking system prerequisites..."
if ! command -v node >/dev/null 2>&1; then
    echo "Node.js is not installed. Please install Node.js (v20 or v22 LTS)."
    exit 1
fi
echo "✓ Node.js version: $(node -v)"
echo "✓ npm version: $(npm -v)"

echo "[2/5] Installing npm dependencies across monorepo workspaces..."
npm install

echo "[3/5] Installing Playwright Chromium browser binary..."
npx playwright install chromium || echo "Playwright install skipped or completed."

echo "[4/5] Building all packages & application..."
npm run build

echo "[5/5] Checking environment configuration..."
if [ ! -f "$ROOT_DIR/.env" ]; then
    echo "Creating .env from .env.example..."
    cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
    echo "⚠️ Please edit .env to set your GEMINI_API_KEY."
else
    echo "✓ Existing .env file found."
fi

# Make scripts executable
chmod +x "$ROOT_DIR/scripts/launch.sh" "$ROOT_DIR/scripts/autostart.sh" "$ROOT_DIR/scripts/openwakeword_worker.py" 2>/dev/null || true

echo "=========================================================="
echo "✓ Installation complete!"
echo "To launch Octo Assistant:"
echo "    ./scripts/launch.sh"
echo "=========================================================="
