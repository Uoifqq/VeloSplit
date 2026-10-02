#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/../frontend"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 24 or newer is required. Install it from https://nodejs.org/"
  exit 1
fi

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if [ "$NODE_MAJOR" -lt 24 ]; then
  echo "Node.js 24 or newer is required. Current major version: $NODE_MAJOR"
  exit 1
fi

if [ ! -f node_modules/next/package.json ]; then
  echo "Installing VeloSplit dependencies..."
  npm ci
fi

echo "Starting VeloSplit. Open http://localhost:3000"
npm run dev -- --hostname 0.0.0.0
