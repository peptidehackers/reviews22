# Advisory Board Skill

> One judge, multiple challengers.

## Purpose

Use a structured advisory pass when a decision is too ambiguous, risky, or
important to trust to a single first draft.

This skill is **advisory only**. It does not replace the canonical OMX flow,
and it is not the default path for ordinary work.

## When to Use

Use this when:

- root cause is still ambiguous after investigation
- a plan is high-risk and serious alternatives exist
- architecture or security tradeoffs are disputed
- review feedback reveals multiple viable but conflicting approaches

Skip when:

- the task is routine and bounded
- the fix is already proven
- the extra challenger pass would add more delay than signal

## Operating Rule

- one owner still makes the final decision
- challenger opinions are inputs, not authority
- disagreements must be surfaced explicitly, not averaged away

## What To Produce

1. the question being decided
2. two or more challenger opinions
3. areas of agreement
4. areas of disagreement
5. the final decision owner’s judgment
6. why rejected alternatives lost

## Output Format

```markdown
ADVISORY BOARD
━━━━━━━━━━━━━━━━
Question: <decision being made>
Opinions:
- <challenger A>
- <challenger B>
Agreements:
- <shared conclusions>
Disagreements:
- <real tensions or alternate hypotheses>
Final decision:
- <chosen path>
Rejected alternatives:
- <option> | <why it lost>
━━━━━━━━━━━━━━━━
```

## Rule

If the challengers do not improve the clarity of the decision, stop. Do not
turn advisory-board into default ceremony.
