#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_HOME="${TARGET_HOME:-$HOME}"

bash "$ROOT/scripts/sync-openclaw-setup.sh"
TARGET_HOME="$TARGET_HOME" python3 "$ROOT/scripts/materialize_templates.py"

chmod +x "$ROOT/omx" "$ROOT"/bin/omx-portable "$ROOT"/scripts/*.sh "$ROOT"/scripts/*.py

echo "Base setup copied to $TARGET_HOME/.openclaw"
echo "Next: $ROOT/scripts/self-heal.sh"
