#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QUIET=0
TARGET_HOME="${TARGET_HOME:-$HOME}"
if [[ "${1:-}" == "--quiet" ]]; then
  QUIET=1
fi

cd "$ROOT"

TARGET_HOME="$TARGET_HOME" bash scripts/sync-openclaw-setup.sh >/tmp/openclaw-sync.log
TARGET_HOME="$TARGET_HOME" python3 scripts/materialize_templates.py >/tmp/openclaw-materialize.log
bash scripts/self-heal-codex.sh >/tmp/openclaw-codex-self-heal.log
TARGET_HOME="$TARGET_HOME" bash scripts/verify-runtime.sh >/tmp/openclaw-verify-runtime.log

if [[ "$QUIET" -eq 0 ]]; then
  cat /tmp/openclaw-sync.log
  cat /tmp/openclaw-materialize.log
  cat /tmp/openclaw-codex-self-heal.log
  cat /tmp/openclaw-verify-runtime.log
fi
