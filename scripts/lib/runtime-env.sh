#!/usr/bin/env bash
set -euo pipefail

OMX_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET_HOME="${TARGET_HOME:-$HOME}"
OMX_TARGET_HOME="$TARGET_HOME"
OMX_DEFAULT_WORKDIR="${OMX_DEFAULT_WORKDIR:-$OMX_REPO_ROOT}"
OMX_CODEX_MODEL="${OMX_CODEX_MODEL:-gpt-5.4}"
OMX_MODEL_PRIMARY="${OMX_MODEL_PRIMARY:-openai-codex/gpt-5.4}"

resolve_oh_my_codex_root() {
  if [[ -n "${OH_MY_CODEX_ROOT:-}" ]]; then
    printf '%s\n' "$OH_MY_CODEX_ROOT"
    return
  fi
  PYTHONPATH="$OMX_REPO_ROOT${PYTHONPATH:+:$PYTHONPATH}" python3 - <<'PY'
from scripts.runtime_paths import detect_oh_my_codex_root
print(detect_oh_my_codex_root())
PY
}

OMX_OH_MY_CODEX_ROOT="$(resolve_oh_my_codex_root)"
