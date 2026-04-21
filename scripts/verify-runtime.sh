#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT/scripts/lib/runtime-env.sh"
cd "$ROOT"

python3 scripts/apply_permanence.py >/tmp/openclaw-apply-check.json

test -f "$TARGET_HOME/.openclaw/openclaw.json"
test -f "$TARGET_HOME/.openclaw/mempalace.yaml"
test -f "$TARGET_HOME/.openclaw/.codex/config.toml"
test -f "$TARGET_HOME/.openclaw/.codex/hooks.json"
test -f "$TARGET_HOME/.openclaw/workspace/MEMORY.md"
test -f "$TARGET_HOME/.openclaw/config/truth-policy.md"

bash scripts/verify-codex-runtime.sh >/tmp/openclaw-codex-runtime.log
cat /tmp/openclaw-codex-runtime.log
