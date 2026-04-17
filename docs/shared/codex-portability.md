# Codex Portability

## Overview

This repo provides a portable, self-healing Codex/OMX setup that survives npm updates and can be replicated across machines.

## Components

### Templates
- `templates/.codex/config.toml.template`
- `templates/.codex/hooks.json.template`

Placeholders:
- `{{HOME}}` - User home directory
- `{{OH_MY_CODEX_ROOT}}` - npm global oh-my-codex path

### Overlay
- `overlay/manifest.json` - SHA256 hashes of patched files
- `overlay/oh-my-codex/` - Patched files to apply

Key patched files:
- `dist/mcp/memory-server.js` - Backend-aware memory routing
- `dist/cli/index.js` - CLI entry with memory support
- `dist/scripts/codex-native-pre-post.js` - Hook script

### Scripts

| Script | Purpose |
|--------|---------|
| `materialize-codex-templates.py` | Render templates to ~/.codex/ |
| `apply_permanence.py` | Apply overlay to installed OMX |
| `ensure-memory-backends.sh` | Install Neo and MemPalace |
| `self-heal-codex.sh` | Run all setup steps |
| `verify-codex-runtime.sh` | Check config files exist |
| `verify-codex-behavior.sh` | Check memory commands work |

### Entry Points

| Entry | Purpose |
|-------|---------|
| `./omx` | Self-healing wrapper |
| `bin/omx-portable` | Alternative entry point |

## Setup

```bash
# Initial setup
./scripts/self-heal-codex.sh

# Verify
./scripts/verify-codex-runtime.sh
./scripts/verify-codex-behavior.sh
```

## How It Works

1. `./omx` is called
2. If not skipped, runs `self-heal-codex.sh --quiet`
3. Self-heal:
   - Materializes templates into ~/.codex/
   - Ensures Neo and MemPalace are installed
   - Applies overlay files to installed oh-my-codex
   - Verifies runtime
4. Executes `npx oh-my-codex` with original args

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `OMX_PORTABLE_SKIP_GUARD` | 0 | Skip self-heal if set to 1 |
| `TARGET_HOME` | $HOME | Override home directory |

## Memory Architecture

See [omx-memory-architecture.md](./omx-memory-architecture.md) for details on the memory backend stack.

## Curated exact-recall rebuild

To rebuild MemPalace from repo-owned, high-signal sources only:

```bash
./scripts/rebuild-mempalace-curated.sh
```

This stages a curated source tree under `.omx/mempalace-source/` and rebuilds the default MemPalace palace from:

- `docs/`
- `scripts/`
- `templates/`
- `overlay/`
- `bin/`
- `omx`
- `.gitignore`

## Replication

To replicate this setup on another machine:

1. Clone the repo
2. Run `./scripts/self-heal-codex.sh`
3. Run `./scripts/verify-codex-behavior.sh`

## Troubleshooting

### Templates not materializing
```bash
python3 scripts/materialize-codex-templates.py
```

### Overlay not applying
```bash
python3 scripts/apply_permanence.py
```

### Memory backends missing
```bash
./scripts/ensure-memory-backends.sh
```
