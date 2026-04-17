---
name: karpathy-guidelines
description: Apply Karpathy-style execution discipline to non-trivial coding, config, review, debugging, or refactor work so the agent makes fewer assumptions, keeps changes simpler, stays surgical, and verifies against explicit success criteria.
---

# Karpathy Guidelines Skill

Use this as a lightweight overlay for work that can sprawl or overcomplicate.

This workspace already has `triage-agent`, `plan-eng-review`, `review-gate`,
and `qa-only`. This skill does not replace them. It applies the Karpathy
convention to non-trivial work inside that existing flow.

Authoritative principle details live in `../conventions/karpathy.md`.

## When to Use

Use for:

- non-trivial coding changes
- config or routing edits
- bug fixes where the fix shape matters
- refactors that could overreach
- reviews of whether a planned change is too broad

Skip for:

- casual chat
- obvious one-line edits with clear proof
- report-only checks that already fit `qa-only`

## Quick Check

Before editing, be able to state:

- the actual goal
- the assumptions that still need evidence
- the smallest change that can work
- the proof that will decide success

## Local Workflow Mapping

1. `triage-agent` → capture goal, risk, and whether clarification is needed
2. `plan-eng-review` → challenge assumptions and simplify the approach
3. `review-gate` → for high-risk or quality-critical plans, reject changes that are broad, speculative, or weakly verified
4. execute the bounded change
5. `qa-only` or direct verification → prove the result

## Output Shape

```markdown
KARPATHY CHECK
━━━━━━━━━━━━━━━━
Goal: <one sentence>
Assumptions: <only the ones that matter>
Smallest change: <bounded patch shape>
Verification: <proof that will decide success>
━━━━━━━━━━━━━━━━
```

## Standard

If the work would still be acceptable after removing:

- one abstraction
- one extra file
- one speculative edge case

then remove it.
