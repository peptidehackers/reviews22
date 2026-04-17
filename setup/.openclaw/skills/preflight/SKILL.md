# Preflight Skill

> Do a short reality check before planning unfamiliar or high-risk work.

## Purpose

Prevent blind planning when the repo surface, integration boundary, or runtime
constraint is not already well understood.

## When to Use

Use this before planning when work is:

- unfamiliar to the current session
- external-integration heavy
- config, auth, routing, dependency, or architecture sensitive
- likely to fail if repo conventions or verification paths are guessed

Skip for:

- trivial local edits
- obvious one-file fixes with direct proof
- report-only verification passes

## Short Checklist

Before planning, be able to answer:

- What intent is this turn actually expressing?
- What does success look like?
- What file or surface likely matters?
- What runtime/config boundary constrains the change?
- What concrete verification path will prove success?

If any answer is still guessed, gather the smallest evidence that will ground it.

## What To Gather

Keep it short. Usually 3 items are enough:

1. discovery evidence: one or two relevant files, examples, or recent patterns
2. the config, tool, or runtime surface that constrains the change
3. the verification path you will use after implementation

If file locations or boundaries are still unclear, search first and read only the
smallest relevant evidence. Do not plan from guessed paths.

## Output Format

```markdown
PREFLIGHT
━━━━━━━━━━━━━━━━
Task: <one sentence>
Intent: understand | investigate | implement | evaluate
Discovery evidence: <files/examples/commands>
Constraint surface: <config/tool/runtime boundary>
Verification path: <tests/logs/state changes>
━━━━━━━━━━━━━━━━
```

## Rule

Preflight is a short grounding step, not a second discovery workflow. If it
starts sprawling, stop and return to the smallest evidence that can safely
bound the plan.
