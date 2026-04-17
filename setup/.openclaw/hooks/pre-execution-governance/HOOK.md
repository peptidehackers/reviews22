---
name: pre-execution-governance
description: "Enforces governance policies before tool execution. Blocks unauthorized sources, requires review for risky tasks, and and self-healing for failures within retry limits."
metadata:
  openclaw:
    emoji: "🛡️"
    events:
      - before_tool_call
      - tool_result_persist
      - before_message_write
    requires:
      bins:
        - node
        - python3
      env:
        BOUNDARY_CONTRACT_PATH: ~/.openclaw/config/boundary-contract.yaml
      config:
        - hooks.internal.entries.pre-execution-governance.enabled
---

# Pre-Execution Governance Hook

This hook enforces governance policies before tool execution to prevent unauthorized operations and ensure quality control.

## What it does

- Intercepts `before_tool_call` events from the plugin system
- Records per-session discovery, mutation, and verification checkpoints
- Tracks discovered paths/surfaces from successful reads and searches
- Blocks mutating tools when no same-run discovery evidence matches the target surface
- Checks source authorization against allowed sources
- Evaluates task risk level using boundary contract
- Enforces an optional freeze lock for mutating work
- Rewrites completion claims when a mutation has no recorded verification yet
- Blocks execution for unauthorized sources
- Requires review for risky tasks before execution
- Implements controlled self-healing for failures (with retry limits)

## Risk Assessment

- **Low risk**: Simple read, cache, safe operations → Auto-execute
- **Medium risk**: Config changes, package installs, API calls → Auto-execute with validation
- **High risk**: File writes, deletes, architecture changes → Requires review
- **Critical risk**: System modifications, security changes → Reject/escalate

## Self-Healing

When failures occur, the hook attempts controlled fixes:
- **Config failures**: Retry with validated config
- **Auth failures**: Retry with fresh credentials
- **Network failures**: Retry with exponential backoff

**Retry Limits**: Maximum 2 attempts per failure class, then stops and reports.

## Freeze Lock

If `~/.openclaw/workspace/state/freeze.json` has `"active": true`, mutating operations are only allowed inside the configured `root`.

Read-only inspection outside that root remains allowed.

## Configuration

Enable in `~/.openclaw/openclaw.json`:

```json
{
  "hooks": {
    "internal": {
      "enabled": true,
      "entries": {
        "pre-execution-governance": {
          "enabled": true,
          "env": {
            "BOUNDARY_CONTRACT_PATH": "~/.openclaw/config/boundary-contract.yaml",
            "REVIEW_REQUIRED": "true",
            "MAX_RETRIES": "2"
          }
        }
      }
    }
  }
}
```

## Requirements

- Node.js (for handler execution)
- Python 3 (for governance logic)
- Boundary contract YAML file (optional, defaults to minimal rules)

## Governance State

Runtime checkpoints are stored in `~/.openclaw/workspace/state/governance-checkpoints.json`.
The hook updates this file from `tool_result_persist` and reads it before mutating tools or allowing completion-style assistant messages. Discovery evidence is matched against the mutation target path or subtree, not just the run in general.
