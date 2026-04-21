#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QUIET=0
TARGET_HOME="${TARGET_HOME:-$HOME}"

if [[ "${1:-}" == "--quiet" ]]; then
    QUIET=1
fi

cd "$ROOT"

echo "Running self-heal..."

# 1. Sync .openclaw baseline
if [[ $QUIET -eq 0 ]]; then
    TARGET_HOME="$TARGET_HOME" bash scripts/sync-openclaw-setup.sh
else
    TARGET_HOME="$TARGET_HOME" bash scripts/sync-openclaw-setup.sh >/dev/null 2>&1
fi

# 2. Materialize .openclaw templates
if [[ $QUIET -eq 0 ]]; then
    TARGET_HOME="$TARGET_HOME" python3 scripts/materialize_templates.py
else
    TARGET_HOME="$TARGET_HOME" python3 scripts/materialize_templates.py >/dev/null 2>&1
fi

# 3. Materialize codex templates
if [[ $QUIET -eq 0 ]]; then
    TARGET_HOME="$TARGET_HOME" python3 scripts/materialize-codex-templates.py
else
    TARGET_HOME="$TARGET_HOME" python3 scripts/materialize-codex-templates.py >/dev/null 2>&1
fi

# 4. Ensure memory backends
if [[ $QUIET -eq 0 ]]; then
    bash scripts/ensure-memory-backends.sh
else
    bash scripts/ensure-memory-backends.sh >/dev/null 2>&1
fi

# 5. Apply permanence overlay
if [[ $QUIET -eq 0 ]]; then
    python3 scripts/apply_permanence.py
else
    python3 scripts/apply_permanence.py >/dev/null 2>&1
fi

# 6. Verify runtime
if [[ $QUIET -eq 0 ]]; then
    TARGET_HOME="$TARGET_HOME" bash scripts/verify-codex-runtime.sh
else
    TARGET_HOME="$TARGET_HOME" bash scripts/verify-codex-runtime.sh >/dev/null 2>&1
fi

echo "Self-heal complete"
