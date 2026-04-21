# Codex Portability

## Overview

This repo provides a portable, self-healing Codex/OMX setup that survives npm updates and can be replicated across machines.
It now also carries a repo-owned `.openclaw` baseline adapted from `macbookprohomesetup`.

## Components

### Templates
- `templates/.codex/config.toml.template`
- `templates/.codex/hooks.json.template`
- `templates/openclaw.json.template`
- `templates/mempalace.yaml.template`

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
| `materialize_templates.py` | Render templates to ~/.openclaw/ |
| `sync-openclaw-setup.sh` | Sync repo-owned setup/.openclaw into ~/.openclaw/ |
| `apply_permanence.py` | Apply overlay to installed OMX |
| `ensure-memory-backends.sh` | Install Neo and MemPalace |
| `self-heal-codex.sh` | Run all setup steps |
| `self-heal.sh` | Full self-heal including .openclaw sync/materialization |
| `verify-runtime.sh` | Check .openclaw runtime files exist |
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
./scripts/install.sh
./scripts/self-heal.sh

# Verify
./scripts/verify-runtime.sh
./scripts/verify-codex-runtime.sh
./scripts/verify-codex-behavior.sh
```

## How It Works

1. `./omx` is called
2. If not skipped, runs `self-heal.sh --quiet`
3. Self-heal:
   - Syncs repo-owned `.openclaw` baseline
   - Materializes `.openclaw` templates
   - Materializes templates into ~/.codex/ and ~/.openclaw/.codex/
   - Ensures Neo and MemPalace are installed
   - Applies overlay files to installed oh-my-codex
   - Verifies OpenClaw + Codex runtime
4. Executes `npx oh-my-codex` with original args

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `OMX_PORTABLE_SKIP_GUARD` | 0 | Skip self-heal if set to 1 |
| `TARGET_HOME` | $HOME | Override home directory |

## Verified runtime hook proof

The managed OpenClaw hook `pre-execution-governance` is now enabled through:

- `hooks.internal.entries.pre-execution-governance.enabled = true`

Current verified behavior:

- OpenClaw loads the managed hook during gateway startup
- the hook writes a startup marker to:
  - `~/.openclaw/hooks/pre-execution-governance/runtime-hook.log`

This is the current proof artifact for real hook firing inside a live OpenClaw gateway process.

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
2. Run `./scripts/install.sh`
3. Run `./scripts/self-heal.sh`
4. Run `./scripts/verify-codex-behavior.sh`

To simulate a fresh user/home locally:

```bash
TARGET_HOME=/tmp/openclaw-fresh-home ./scripts/install.sh
TARGET_HOME=/tmp/openclaw-fresh-home ./scripts/self-heal.sh
TARGET_HOME=/tmp/openclaw-fresh-home ./scripts/verify-runtime.sh
TARGET_HOME=/tmp/openclaw-fresh-home ./scripts/verify-codex-runtime.sh
TARGET_HOME=/tmp/openclaw-fresh-home ./scripts/verify-codex-behavior.sh
```

## Troubleshooting

### Templates not materializing
```bash
python3 scripts/materialize-codex-templates.py
python3 scripts/materialize_templates.py
```

### Overlay not applying
```bash
python3 scripts/apply_permanence.py
```

### Memory backends missing
```bash
./scripts/ensure-memory-backends.sh
```
