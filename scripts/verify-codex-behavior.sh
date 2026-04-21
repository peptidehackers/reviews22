#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKDIR="${TARGET_HOME:-$HOME}"
RUN_HOME="${TARGET_HOME:-$HOME}"

echo "Verifying Codex behavior..."

errors=0

# Test memory write
echo "  Testing memory write..."
write_result=$(HOME="$RUN_HOME" TARGET_HOME="$RUN_HOME" ./omx memory write --input "{\"classification\":\"repo_state\",\"problem\":\"verification test\",\"context\":\"behavior check\",\"solution\":\"test solution\",\"failure\":\"none\",\"confidence\":\"verified\",\"source\":\"verify-behavior\",\"tags\":[\"test\"],\"verified\":true,\"workingDirectory\":\"$WORKDIR\"}" --json 2>&1) || true

if echo "$write_result" | grep -q "success\|written\|stored"; then
    echo "    memory write: OK"
else
    echo "    memory write: FAIL"
    ((errors++)) || true
fi

# Test memory search
echo "  Testing memory search..."
search_result=$(HOME="$RUN_HOME" TARGET_HOME="$RUN_HOME" ./omx memory search --input "{\"query\":\"verification test\",\"backend\":\"all\",\"workingDirectory\":\"$WORKDIR\"}" --json 2>&1) || true

if echo "$search_result" | grep -q "results\|matches\|found"; then
    echo "    memory search: OK"
else
    echo "    memory search: FAIL"
    ((errors++)) || true
fi

# Test memory list-backends
echo "  Testing memory list-backends..."
backends_result=$(HOME="$RUN_HOME" TARGET_HOME="$RUN_HOME" ./omx memory list-backends --input "{\"workingDirectory\":\"$WORKDIR\"}" --json 2>&1) || true

if echo "$backends_result" | grep -q "backends\|project-memory\|semantic"; then
    echo "    list-backends: OK"
else
    echo "    list-backends: FAIL"
    ((errors++)) || true
fi

# Test Neo (if available)
if command -v neo &>/dev/null; then
    echo "  Testing Neo semantic..."
    if neo --version &>/dev/null; then
        echo "    neo: OK"
    else
        echo "    neo: FAIL"
        ((errors++)) || true
    fi
fi

# Test MemPalace (if available)
if command -v mempalace &>/dev/null; then
    echo "  Testing MemPalace..."
    if mempalace status &>/dev/null; then
        echo "    mempalace: OK"
    else
        echo "    mempalace: FAIL"
        ((errors++)) || true
    fi
fi

if [[ $errors -eq 0 ]]; then
    echo "Behavior verification: PASS"
    exit 0
else
    echo "Behavior verification: FAIL ($errors errors)"
    exit 1
fi
