# Investigate Skill

> No fix without diagnosis.

## Purpose

Find root cause before editing. This skill exists to prevent speculative fixes.

## When to Use

Use for bugs, regressions, flaky behavior, unclear failures, or any issue where the cause is not already proven.

## Method

1. Reproduce or restate the observed symptom.
2. Search first when the failing boundary, symbol, or file location is unclear.
3. Collect direct evidence from logs, code, config, and state using targeted reads.
4. Narrow to the smallest failing component or boundary.
5. Name the most likely root cause and the evidence for it.
6. Calibrate confidence honestly using the scale below.
7. If a prior attempt failed or the user corrected the premise, capture the failed assumption and what should be checked next time.
8. Only then propose or apply a fix.

## Confidence Scale

- `verified` — directly proven by current evidence or reproduction
- `high` — strong evidence with little ambiguity left
- `medium` — plausible but still needs confirmation
- `low` — weak hypothesis, substantial uncertainty remains
- `assumed` — speculation only; do not treat as diagnosis

## Output Format

```markdown
INVESTIGATION
━━━━━━━━━━━━━━━━
Symptom: <what is failing>
Evidence: <logs/files/state>
Root cause: <most likely cause or not yet proven>
Failed assumption: <if a wrong premise was exposed, else none>
Confidence: verified | high | medium | low | assumed
Next step: fix | gather more evidence | escalate
━━━━━━━━━━━━━━━━
```

## Rule

If the evidence does not support a root cause yet, say so. Do not patch blindly.
If multiple root causes remain plausible after investigation, escalate to `advisory-board` before choosing the fix path.
Do not label a diagnosis `high` or `verified` unless current evidence justifies it.
