# OMX Memory Architecture

## Overview

The OMX memory system is a 3-layer architecture that provides repo-owned, portable, self-healing memory persistence.

Related doc:

- [codex-portability.md](./codex-portability.md)

Related baseline:

- `setup/.openclaw/` now mirrors the reference repo's portable OpenClaw workspace/governance layer
- managed OpenClaw hook firing is currently proven by `~/.openclaw/hooks/pre-execution-governance/runtime-hook.log`

Configurable defaults:

- home path via `TARGET_HOME`
- default working directory via `OMX_DEFAULT_WORKDIR`
- Codex model via `OMX_CODEX_MODEL`
- OpenClaw primary model via `OMX_MODEL_PRIMARY`
- MemPalace source list via `MEMPALACE_SOURCE_ITEMS`

## 3-Layer Design

```
┌─────────────────────────────────────────────────────────────┐
│                    LAYER 1: ENTRY                            │
│  ./omx → self-heal → installed oh-my-codex CLI              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                LAYER 2: PERMANENCE/OVERLAY                   │
│  templates/ + overlay/ + scripts/                           │
│  - materialize-codex-templates.py                           │
│  - apply_permanence.py                                       │
│  - self-heal-codex.sh                                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                LAYER 3: MEMORY BACKENDS                      │
│  ┌──────────────┬──────────────┬──────────────┐             │
│  │ project-mem  │  notepad     │  wiki        │             │
│  │ (.omx/)      │  (.omx/)     │  (.omx/)     │             │
│  └──────────────┴──────────────┴──────────────┘             │
│  ┌──────────────┬──────────────┐                            │
│  │ Neo          │  MemPalace   │                            │
│  │ (semantic)   │  (exact)     │                            │
│  └──────────────┴──────────────┘                            │
└─────────────────────────────────────────────────────────────┘
```

## Control Flow

```
./omx <command>
    │
    ├── [if not OMX_PORTABLE_SKIP_GUARD=1]
    │       │
    │       └── scripts/self-heal.sh --quiet
    │               │
    │               ├── sync-openclaw-setup.sh
    │               ├── materialize_templates.py
    │               ├── materialize-codex-templates.py
    │               ├── ensure-memory-backends.sh
    │               ├── apply_permanence.py
    │               ├── verify-runtime.sh
    │               └── verify-codex-runtime.sh
    │
    └── <detected installed oh-my-codex CLI> "$@"
```

## File Ownership

| Path | Owner | Purpose |
|------|-------|---------|
| `templates/.codex/` | Repo | Codex config templates |
| `overlay/manifest.json` | Repo | Overlay file hashes |
| `overlay/oh-my-codex/` | Repo | Patched OMX files |
| `scripts/` | Repo | Self-heal and verification |
| `~/.codex/` | Generated | Materialized config |
| `~/.omx/` | Runtime | OMX state and memory |
| `~/.neo/` | Runtime | Neo semantic index |

## Memory Backends

### project-memory
- Location: `.omx/project-memory.json`
- Purpose: Project-specific patterns and decisions
- API: `omx memory read/write`

### notepad
- Location: `.omx/notepad.md`
- Purpose: Working memory for current session
- API: `omx notepad read/write`

### wiki
- Location: `.omx/wiki/`
- Purpose: Persistent structured knowledge
- API: `omx wiki read/write/search`

### semantic-memory (Neo)
- Location: `~/.neo/` or project `.neo/`
- Purpose: Semantic code reasoning
- API: `neo --semantic "query"`
- Role: Pattern matching across codebase

### MemPalace
- Location: `~/.mempalace/` or indexed files
- Purpose: Exact recall of file locations and strings
- API: `mempalace search/status`
- Role: Fallback for precise lookups
- Curated rebuild: `./scripts/rebuild-mempalace-curated.sh`

## Routed Memory Operations

### Write
```bash
omx memory write --input '{
  "classification": "repo_state",
  "problem": "...",
  "solution": "...",
  "confidence": "verified",
  "workingDirectory": "/path/to/repo"
}' --json
```

### Search
```bash
omx memory search --input '{
  "query": "error handling",
  "backend": "all",
  "workingDirectory": "/path/to/repo"
}' --json
```

### List Backends
```bash
omx memory list-backends --input '{
  "workingDirectory": "/path/to/repo"
}' --json
```

## Durable Memory Defaults

This system should not rely on chat state for important outcomes.

For meaningful completed work:

- verified implementation facts should be written to OMX project-memory
- architecture, decisions, and procedures should be written to OMX wiki
- stable user/system preferences should be promoted into OpenClaw `MEMORY.md`

If a result only exists in the session transcript, it is not durably saved.

## Operational Commands

```bash
# Self-heal (run automatically by ./omx)
./scripts/self-heal.sh

# Verify runtime setup
./scripts/verify-runtime.sh
./scripts/verify-codex-runtime.sh

# Verify behavior
./scripts/verify-codex-behavior.sh

# Ensure memory backends
./scripts/ensure-memory-backends.sh

# Check MemPalace status
mempalace status

# Check Neo index
neo --version
ls ~/.neo/index.json
```

## Known Limitations

1. **Neo LLM Auth**: Neo's `base_url` config doesn't properly route auth. Use with local embedding only for now.
2. **MemPalace Broad Index**: Initial index may be too broad. Run `mempalace mine /specific/path` for targeted indexing.
3. **Overlay Fragility**: npm updates can overwrite overlay files. Self-heal re-applies on each run.

## Best Next Improvements

1. Neo provider fix for custom base URLs
2. Cross-agent memory sharing via shared workingDirectory
3. Optional narrower routing heuristics for high-noise exact-recall queries
