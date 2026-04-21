#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/runtime-env.sh"

bash "$OMX_REPO_ROOT/scripts/sync-openclaw-setup.sh"
python3 "$OMX_REPO_ROOT/scripts/materialize_templates.py"

chmod +x "$OMX_REPO_ROOT/omx" "$OMX_REPO_ROOT"/bin/omx-portable "$OMX_REPO_ROOT"/scripts/*.sh "$OMX_REPO_ROOT"/scripts/*.py

echo "Base setup copied to $TARGET_HOME/.openclaw"
echo "Next: $OMX_REPO_ROOT/scripts/self-heal.sh"
