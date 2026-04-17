#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_HOME="${TARGET_HOME:-$HOME}"

mkdir -p "$TARGET_HOME/.openclaw"
rsync -a "$ROOT/setup/.openclaw/" "$TARGET_HOME/.openclaw/"

echo "Base setup copied to $TARGET_HOME/.openclaw"
