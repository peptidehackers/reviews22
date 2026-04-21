#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/runtime-env.sh"

mkdir -p "$TARGET_HOME/.openclaw"
rsync -a "$OMX_REPO_ROOT/setup/.openclaw/" "$TARGET_HOME/.openclaw/"

echo "Base setup copied to $TARGET_HOME/.openclaw"
