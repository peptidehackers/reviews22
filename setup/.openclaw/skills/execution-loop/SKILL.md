# Execution Loop Skill

> Execute, verify, heal, repeat.

## Purpose

Turn an approved bounded plan into fast, disciplined delivery.

This is the aggressive execution lane for work that is already scoped well
enough to move. It does **not** replace planning, investigation, review, or
truth checks.

## When to Use

Use this after the work is already:

- scoped
- planned
- approved enough to execute
- attached to a concrete verification path

Skip when:

- the request is still ambiguous
- root cause is still unproven
- the task needs advisory-board or review before action

## Loop

1. Execute the smallest valid step.
2. Verify against current evidence immediately after the mutation.
3. If verification fails, heal with the smallest patch.
4. If healing fails, revert the last atomic change.
5. If the failure exposed a wrong assumption, hand the lesson to `maintain-memory`.
6. Repeat until the bounded objective is complete.

## Verification Discipline

After each mutation, prove at least one of these before moving on:

- re-read the changed file and confirm the intended diff landed
- inspect the command output and exit status
- run the targeted test, check, or log that proves the step
- confirm the expected state change actually happened

## Standard

- action over ceremony
- proof over confidence
- smallest step over broad rewrite
- revert narrowly, never blindly
- do not say "done" before the post-mutation check

## Output Format

```markdown
EXECUTION LOOP
━━━━━━━━━━━━━━━━
Objective: <bounded objective>
Current step: <what was executed>
Verification: <what proved or failed>
Recovery: <small patch | revert last atomic change | none>
Lesson: <durable mistake pattern or none>
Next step: <continue | complete | escalate>
━━━━━━━━━━━━━━━━
```

## Rule

If the work no longer looks bounded, stop the loop and return to planning or
review instead of charging forward blindly.
