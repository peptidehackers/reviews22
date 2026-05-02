#!/usr/bin/env bash
set -euo pipefail

echo "Ensuring memory backends..."

resolve_python_bin() {
    if command -v python >/dev/null 2>&1; then
        printf '%s\n' "$(command -v python)"
        return
    fi
    printf '%s\n' "$(command -v python3)"
}

PYTHON_BIN="$(resolve_python_bin)"

# Check neo-reasoner
if "$PYTHON_BIN" -c "import neo" 2>/dev/null; then
    echo "  neo-reasoner: OK ($PYTHON_BIN)"
else
    echo "  neo-reasoner: MISSING - installing..."
    pip install neo-reasoner 2>/dev/null || pip install --user neo-reasoner
fi

# Check mempalace
if command -v mempalace &>/dev/null; then
    echo "  mempalace: OK ($(which mempalace))"
else
    echo "  mempalace: MISSING - installing via pipx..."
    pipx install mempalace 2>/dev/null || pip install --user mempalace
fi

# Verify Neo config
if [[ -f ~/.neo/config.json ]] || neo --config list &>/dev/null; then
    echo "  neo config: OK"
else
    echo "  neo config: initializing..."
    neo --config list || true
fi

echo "Memory backends ready"
