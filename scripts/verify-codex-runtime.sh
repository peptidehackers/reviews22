#!/usr/bin/env bash
set -euo pipefail

echo "Verifying Codex runtime..."

errors=0

# Check config.toml
if [[ -f ~/.codex/config.toml ]]; then
    echo "  config.toml: OK"
else
    echo "  config.toml: MISSING"
    ((errors++)) || true
fi

# Check hooks.json
if [[ -f ~/.codex/hooks.json ]]; then
    echo "  hooks.json: OK"
else
    echo "  hooks.json: MISSING"
    ((errors++)) || true
fi

# Check AGENTS.md
if [[ -f ~/.codex/AGENTS.md ]]; then
    echo "  AGENTS.md: OK"
else
    echo "  AGENTS.md: MISSING"
    ((errors++)) || true
fi

# Check omx command
if command -v omx &>/dev/null; then
    echo "  omx: OK ($(omx --version 2>/dev/null | head -1))"
else
    echo "  omx: MISSING"
    ((errors++)) || true
fi

# Check overlay files match
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$ROOT/overlay/manifest.json"
OMX_ROOT="$(npm root -g)/oh-my-codex"

if [[ -f "$MANIFEST" ]] && [[ -d "$OMX_ROOT" ]]; then
    mismatches=0
    while IFS= read -r line; do
        rel_path=$(echo "$line" | cut -d'"' -f2)
        expected_hash=$(echo "$line" | cut -d'"' -f4)
        target="$OMX_ROOT/$rel_path"
        if [[ -f "$target" ]]; then
            actual_hash=$(shasum -a 256 "$target" | cut -d' ' -f1)
            if [[ "$actual_hash" != "$expected_hash" ]]; then
                ((mismatches++)) || true
            fi
        fi
    done < <(grep -E '^\s*"dist|src' "$MANIFEST")
    
    if [[ $mismatches -eq 0 ]]; then
        echo "  overlay: OK"
    else
        echo "  overlay: $mismatches files need update"
        ((errors++)) || true
    fi
else
    echo "  overlay: SKIP (no manifest or omx not installed)"
fi

if [[ $errors -eq 0 ]]; then
    echo "Runtime verification: PASS"
    exit 0
else
    echo "Runtime verification: FAIL ($errors errors)"
    exit 1
fi
