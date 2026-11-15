#!/usr/bin/env bash
# One-command setup on a fresh Ubuntu 22.04/24.04 box. Oracle Always Free works.
# Usage: bash deploy/quickstart.sh
set -euo pipefail

echo "==> installing node 22, git, curl"
if ! command -v node >/dev/null || [ "$(node -v | cut -c2-3)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs git curl
fi

echo "==> installing dependencies"
npm ci --no-audit --no-fund

echo "==> building"
npm run build

if [ ! -f .env ]; then
  cp .env.example .env
  echo "!! .env created. Add GEMINI_API_KEY and/or GROQ_API_KEY, then re-run this script."
  exit 1
fi

echo "==> model status"
npm run agent:status || echo "!! no model configured yet - add a free key to .env"

echo "==> starting under pm2"
sudo npm i -g pm2 >/dev/null 2>&1 || npm i -g pm2
pm2 start dist/server.cjs --name hermes-jarvis --update-env
pm2 save

echo
echo "JARVIS is live on http://$(hostname -I | awk '{print $1}'):3000"
echo "Agent check:  curl -s localhost:3000/api/agent/status"
echo "Terminal use: npm run agent -- --approve \"<task>\""
