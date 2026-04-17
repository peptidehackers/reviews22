# Maintain Memory Skill

> Keep memory clean enough to trust.

## Purpose

Consolidate, prune, and correct memory so future sessions inherit signal instead of noise.

## When to Use

Use during periodic maintenance, after major system changes, or when daily logs start contradicting current reality.

Also use it when a failed attempt, user correction, or postmortem produces a durable workflow lesson that should change future behavior.

## Maintenance Pass

1. Read recent daily memory files.
2. Extract durable facts, decisions, and decision-improvement rules.
3. Move stable facts into `workspace/MEMORY.md`.
4. Move recurring context into `workspace/entities/`.
5. Mark obsolete or contradicted notes as historical, not current truth.
6. If a correction exposed a repeatable mistake pattern, update the relevant workflow or skill note too.

## What Counts as Durable

- active projects
- current operating rules
- user preferences
- environment facts
- lessons that should affect future behavior
- verified prevention rules learned from failed attempts or corrections

## What to Avoid

- stale implementation details presented as current truth
- duplicate notes copied across multiple files
- fake certainty inherited from old logs
- one-off failures with no future decision value

## Output Format

```markdown
MEMORY MAINTENANCE
━━━━━━━━━━━━━━━━
Promoted:
- <fact moved to curated memory>
Superseded:
- <old note no longer current>
Workflow lessons:
- <durable decision rule captured>
Entity updates:
- <entity page changed>
━━━━━━━━━━━━━━━━
```
