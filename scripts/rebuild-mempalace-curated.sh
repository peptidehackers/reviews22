#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/runtime-env.sh"
ROOT="$OMX_REPO_ROOT"
STAGING_DIR="${MEMPALACE_STAGE_DIR:-$ROOT/.omx/mempalace-source}"
PALACE_PATH="${PALACE_PATH:-$HOME/.mempalace/palace}"
SOURCE_ITEMS="${MEMPALACE_SOURCE_ITEMS:-docs,scripts,templates,overlay,bin,omx,.gitignore}"

rm -rf "$STAGING_DIR" "$PALACE_PATH"
mkdir -p "$STAGING_DIR" "$PALACE_PATH"

IFS=',' read -r -a item_array <<< "$SOURCE_ITEMS"
for item in "${item_array[@]}"; do
  src="$ROOT/$item"
  dest="$STAGING_DIR/$item"
  if [[ -d "$src" ]]; then
    mkdir -p "$dest"
    rsync -a "$src/" "$dest/"
  elif [[ -f "$src" ]]; then
    mkdir -p "$(dirname "$dest")"
    cp -f "$src" "$dest"
  else
    echo "Skipping missing MemPalace source: $item"
  fi
done

echo "Curated MemPalace source staged at: $STAGING_DIR"

mempalace --palace "$PALACE_PATH" init "$STAGING_DIR" --yes
mempalace --palace "$PALACE_PATH" mine "$STAGING_DIR" --agent omx --limit 0
mempalace --palace "$PALACE_PATH" status
