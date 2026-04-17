#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAGING_DIR="${STAGING_DIR:-$ROOT/.omx/mempalace-source}"
PALACE_PATH="${PALACE_PATH:-$HOME/.mempalace/palace}"

rm -rf "$STAGING_DIR" "$PALACE_PATH"
mkdir -p "$STAGING_DIR" "$PALACE_PATH"

rsync -a "$ROOT/docs/" "$STAGING_DIR/docs/"
rsync -a "$ROOT/scripts/" "$STAGING_DIR/scripts/"
rsync -a "$ROOT/templates/" "$STAGING_DIR/templates/"
rsync -a "$ROOT/overlay/" "$STAGING_DIR/overlay/"
rsync -a "$ROOT/bin/" "$STAGING_DIR/bin/"
cp -f "$ROOT/omx" "$STAGING_DIR/omx"
cp -f "$ROOT/.gitignore" "$STAGING_DIR/.gitignore"

echo "Curated MemPalace source staged at: $STAGING_DIR"

mempalace --palace "$PALACE_PATH" init "$STAGING_DIR" --yes
mempalace --palace "$PALACE_PATH" mine "$STAGING_DIR" --agent omx --limit 0
mempalace --palace "$PALACE_PATH" status
