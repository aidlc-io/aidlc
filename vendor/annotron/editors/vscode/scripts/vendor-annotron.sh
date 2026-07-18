#!/usr/bin/env bash
# Copy the annotron package (server + CLI + runtime deps) into the extension so
# the .vsix is self-contained. react-dom/scheduler are dropped — merslim's
# headless SVG builders need `react` but not `react-dom`.
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"      # editors/vscode
ROOT="$(cd "$HERE/../.." && pwd)"             # annotron repo root
DEST="$HERE/vendor/annotron"

echo "vendoring annotron from $ROOT → $DEST"
rm -rf "$DEST"
mkdir -p "$DEST"

cp -R "$ROOT/bin" "$DEST/bin"
cp -R "$ROOT/src" "$DEST/src"
cp "$ROOT/package.json" "$DEST/package.json"

if [ ! -d "$ROOT/node_modules/merslim" ] || [ ! -d "$ROOT/node_modules/markdown-it" ]; then
  echo "ERROR: run 'npm install' in the annotron repo first (need markdown-it + merslim)." >&2
  exit 1
fi

cp -R "$ROOT/node_modules" "$DEST/node_modules"
# trim what the server never loads
rm -rf "$DEST/node_modules/react-dom" "$DEST/node_modules/scheduler" "$DEST/node_modules/.bin" "$DEST/node_modules/.package-lock.json"

echo "vendored size: $(du -sh "$DEST" | cut -f1)"
