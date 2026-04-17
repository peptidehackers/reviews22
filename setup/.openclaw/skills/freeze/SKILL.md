# Freeze Skill

> Lock edits to a bounded path while debugging or implementing.

## Purpose

Prevent unrelated edits by constraining mutating work to one approved root.

## State File

Freeze state lives in:

`~/.openclaw/workspace/state/freeze.json`

## Activation Format

```json
{
  "active": true,
  "root": "/absolute/path/inside/workspace",
  "reason": "debug auth regression",
  "updatedAt": "2026-04-15T00:00:00Z"
}
```

## Behavior

- Mutating operations inside `root` are allowed to proceed normally.
- Mutating operations outside `root` should be blocked by governance.
- Read-only work outside `root` stays allowed.

## Use Cases

- debugging one module without collateral edits
- containing large refactors
- narrowing AI behavior during incident response
