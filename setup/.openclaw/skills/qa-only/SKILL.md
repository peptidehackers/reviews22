# QA Only Skill

> Verify without changing code.

## Purpose

Run a verification pass that reports findings without making edits.

## When to Use

Use after implementation, during pre-merge checks, or when the user asks for review, verification, or a bug hunt without modifications.

## What to Check

- expected behavior from the request
- obvious regressions
- error paths and edge cases
- proof in logs, outputs, state changes, or UI behavior

## Output Format

```markdown
QA REPORT
━━━━━━━━━━━━━━━━
Verdict: pass | fail | inconclusive
Findings:
- <finding 1>
- <finding 2>
Evidence:
- <log/output/state reference>
Gaps:
- <what was not verified>
━━━━━━━━━━━━━━━━
```

## Rule

If something cannot be verified from current evidence, mark it inconclusive instead of passing it.
