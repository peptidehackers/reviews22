# Unfreeze Skill

> Remove the current freeze lock.

## Purpose

End a bounded edit window once the targeted work is complete.

## Behavior

- Set `active` to `false` in `~/.openclaw/workspace/state/freeze.json`
- Keep the last root and reason for auditability if useful
- Do not unfreeze implicitly after failed work; do it deliberately
