#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/runtime-env.sh"

bash "$OMX_REPO_ROOT/scripts/sync-openclaw-setup.sh"
mkdir -p "$TARGET_HOME/.codex"
python3 "$OMX_REPO_ROOT/scripts/materialize-codex-templates.py"
bash "$OMX_REPO_ROOT/scripts/ensure-memory-backends.sh"
python3 "$OMX_REPO_ROOT/scripts/apply_permanence.py"
chmod +x "$OMX_REPO_ROOT/omx" "$OMX_REPO_ROOT/bin/omx-portable" "$OMX_REPO_ROOT"/scripts/*.sh "$OMX_REPO_ROOT"/scripts/*.py

echo "Codex portability files installed into $TARGET_HOME/.codex"
echo "OpenClaw setup copied to $TARGET_HOME/.openclaw"
echo "Overlay applied to the installed oh-my-codex package"
echo "Next: $OMX_REPO_ROOT/scripts/self-heal-codex.sh"
