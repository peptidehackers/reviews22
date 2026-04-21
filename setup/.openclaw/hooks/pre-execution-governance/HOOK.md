---
name: pre-execution-governance
description: "Verifies OpenClaw runtime hook wiring at gateway startup and keeps the governance handler assets available in the managed hook directory."
metadata:
  openclaw:
    emoji: "🛡️"
    events:
      - gateway:startup
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

This managed hook proves that OpenClaw is loading repo-owned hook code from `~/.openclaw/hooks/` at runtime.

On `gateway:startup`, it writes a runtime marker file so we can verify that the hook really fired inside a live OpenClaw gateway process.

The same directory also carries the TypeScript/Python governance assets used by the OMX/OpenClaw stack for stricter external verification and future tool-governance integration.

## What it does

- Fires on `gateway:startup`
- Writes a runtime marker to `~/.openclaw/hooks/pre-execution-governance/runtime-hook.log`
- Confirms the managed hook directory is active and loadable
- Keeps the governance assets colocated for future deeper integration

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
          "enabled": true
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

## Runtime Marker

Successful startup should append a line to:

`~/.openclaw/hooks/pre-execution-governance/runtime-hook.log`
