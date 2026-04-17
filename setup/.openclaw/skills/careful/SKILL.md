# Careful Skill

> Pause before destructive operations.

## Purpose

Force a deliberate pass before commands or edits that can destroy data, rewrite history, or cause hard-to-reverse changes.

## High-Risk Examples

- `rm -rf`
- `git reset --hard`
- force push
- dropping tables
- deleting secrets or auth config
- broad file rewrites

## Behavior

1. Restate the exact destructive action.
2. Name the blast radius.
3. Prefer a reversible alternative when one exists.
4. If the action is still required, escalate for explicit confirmation.

## Output Format

```markdown
CAREFUL
━━━━━━━━━━━━━━━━
Action: <destructive action>
Blast radius: <what could be lost>
Safer option: <if any>
Decision: stop | review | escalate
━━━━━━━━━━━━━━━━
```
