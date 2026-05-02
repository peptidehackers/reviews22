# Memory Routing

**The intelligence is in orchestration, not storage.**

This document is a practical cheat sheet for choosing the right memory backend and saving durable results where they are easiest to recover.

## Memory Stack

| Backend | Type | Best For | CLI/API |
|---------|------|----------|---------|
| **Neo** | Local semantic | Pattern matching, code reasoning | `neo --semantic "query"` |
| **Mem0** | Cloud semantic | Cross-session patterns, decisions | `mcp__mem0__search-memories` |
| **MemPalace** | Exact recall | File locations, exact strings | `mempalace search "query"` |
| **OMX Wiki** | Structured knowledge | Architecture, decisions, APIs | MCP `omx_wiki` |
| **OMX Notepad** | Session working memory | Current task context | `~/.omx/notepad.md` |
| **OMX Project Memory** | Project state | Repo-specific patterns | MCP `omx_memory` |
| **OpenClaw Daily** | Chronological logs | What happened when | `~/.openclaw/workspace/memory/` |
| **OpenClaw Curated** | Durable facts | User prefs, rules | `~/.openclaw/workspace/MEMORY.md` |

## Default Save Locations

When work produces durable knowledge, write it to persistent memory immediately instead of leaving it only in chat.

### Quick default

- **Repo state / verified implementation fact** → OMX Project Memory
- **Architecture / decision / procedure** → OMX Wiki
- **Stable user or system preference** → OpenClaw `MEMORY.md`
- **Chronological raw note** → OpenClaw daily log

For significant changes, prefer writing to **both**:

- OMX Project Memory
- OMX Wiki

That gives both short-form retrieval and durable human-readable documentation.

## Routing Rules

### RECALL: "What pattern/decision exists for X?"
```
1. Neo (local semantic) → fast, code-aware
2. Mem0 (cloud semantic) → cross-session, broader
3. MemPalace (exact) → if specific file/string needed
```

### RECALL: "What file contains X?"
```
1. MemPalace → exact recall of file locations
2. Neo → if semantic match needed
```

### RECALL: "What did we decide about X?"
```
1. OMX Wiki → structured decisions
2. OpenClaw MEMORY.md → curated facts
3. Mem0 → if older pattern
```

### RECALL: "What happened recently?"
```
1. OMX Notepad → current session
2. OpenClaw daily logs → today/yesterday
3. OMX Project Memory → project-specific
```

### STORE: After successful fix/decision
```
1. Mem0 → for pattern recall
2. OMX Wiki → if architectural decision
3. OpenClaw MEMORY.md → if durable user preference
4. MemPalace → auto-indexed from files
```

Minimum save for important changes:

- at least one durable backend write
- for architecture/system behavior changes, both project-memory and wiki should be updated

### STORE: During work
```
1. OMX Notepad → working memory
2. OpenClaw daily log → chronological record
```
