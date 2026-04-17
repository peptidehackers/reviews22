#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_HOME="${TARGET_HOME:-$HOME}"

mkdir -p "$TARGET_HOME/.codex"
python3 "$ROOT/scripts/materialize-codex-templates.py"
bash "$ROOT/scripts/ensure-memory-backends.sh"
python3 "$ROOT/scripts/apply_permanence.py"
chmod +x "$ROOT/omx" "$ROOT/bin/omx-portable" "$ROOT"/scripts/*.sh "$ROOT"/scripts/*.py

echo "Codex portability files installed into $TARGET_HOME/.codex"
echo "Overlay applied to the installed oh-my-codex package"
echo "Next: $ROOT/scripts/self-heal-codex.sh"
