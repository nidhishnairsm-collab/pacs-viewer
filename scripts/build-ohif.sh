#!/usr/bin/env bash
# Clones (or updates) the OHIF Viewers repo, injects our config, builds it,
# and copies the output to ohif-dist/ at the project root.
#
# Usage: bash scripts/build-ohif.sh
#
# Requirements: git, node >=18, yarn
# Run from the project root.
set -e

REPO_URL="https://github.com/OHIF/Viewers.git"
SOURCE_DIR=".ohif-source"
OUTPUT_DIR="ohif-dist"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

echo "[OHIF] ── Step 1: Fetch source ──"
if [ -d "$SOURCE_DIR/.git" ]; then
  echo "[OHIF] Updating existing clone in $SOURCE_DIR..."
  git -C "$SOURCE_DIR" pull --ff-only
else
  echo "[OHIF] Cloning OHIF Viewers (shallow, default branch)..."
  git clone --depth 1 "$REPO_URL" "$SOURCE_DIR"
fi

echo ""
echo "[OHIF] ── Step 2: Copy config ──"
cp scripts/ohif-config.js "$SOURCE_DIR/platform/app/public/config/default.js"
echo "[OHIF] Config written to $SOURCE_DIR/platform/app/public/config/default.js"

echo ""
echo "[OHIF] ── Step 3: Install dependencies ──"
cd "$SOURCE_DIR"
yarn install --frozen-lockfile 2>/dev/null || yarn install

echo ""
echo "[OHIF] ── Step 4: Build ──"
# PUBLIC_URL sets the vite base so all asset paths are prefixed with /ohif/
cd platform/app
PUBLIC_URL=/ohif/ yarn build

echo ""
echo "[OHIF] ── Step 5: Copy dist ──"
cd "$PROJECT_ROOT"
rm -rf "$OUTPUT_DIR"
cp -r "$SOURCE_DIR/platform/app/dist" "$OUTPUT_DIR"
echo "[OHIF] Build complete → $OUTPUT_DIR/"
echo "[OHIF] Start the dev server and open http://localhost:3000/ohif/"
