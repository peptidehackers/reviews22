# Quality System

This workspace now uses a small workflow stack inspired by gstack, but trimmed to what is actually useful here.

## Default Flow

1. `triage-agent`
2. verbalize current-message intent, reset any prior execution mode, and confirm whether this turn is understanding, investigation, evaluation, or implementation
3. clarify objective, constraints, and success condition if the request is underspecified
4. for unfamiliar, external, or high-risk work, run `preflight`
5. when file locations, boundaries, or similar prior art are unclear, search first and read only targeted evidence before planning or editing
6. `plan-eng-review` for coding or system changes
7. apply `karpathy-guidelines` during planning, editing, cleanup, and review work
8. `investigate` before any bug fix whose cause is not proven
9. use `multifix` when a bug/regression needs diagnosis + repair + verification in one lane
10. `review-gate` for high-risk work
11. for approved bounded work, use `execution-loop`
12. after every mutation, verify the changed file, command output, test result, log, or state change before moving on
13. `qa-only` or direct verification
14. if verification fails, heal with the smallest patch or revert the last atomic change before continuing
15. if a failed attempt or user correction exposed a bad assumption, capture the lesson with `maintain-memory`
16. report only what `truth-policy.md` allows

`karpathy-guidelines` is the behavioral overlay for this flow. Its principle details live in `skills/conventions/karpathy.md`. Keep this file as the canonical execution order; keep the skill and convention files focused on how to execute that order well. `preflight` is a short grounding step for unfamiliar or risky work, not a parallel planning system.

## Lightweight Enforcement

- If the current message is asking for explanation, investigation, or evaluation only, do not silently continue implementation from a prior turn.
- If work is unfamiliar, external, or high-risk, the plan should include `Preflight evidence`.
- If file locations, touch points, or repo patterns are not already proven, the plan should include discovery evidence gathered by search plus targeted reads instead of guessed paths.
- If verification failure could leave partial damage, the plan should include a recovery path.
- `review-gate` should reject or modify plans that skip either requirement when it matters.
- If provider/model work is in scope, the plan should also respect `config/provider-failure-policy.md`.
- If provider/model work is in scope, the plan should name the current provider path, any verified fallback, and the stop condition when no safe fallback exists.
- If high-risk work still has multiple serious options after planning/investigation, use `advisory-board` as an escalation lane, not a default step.
- If work is approved and bounded, `execution-loop` is the default delivery lane.
- If a failed attempt reveals a durable mistake pattern, update workflow memory or the relevant skill instead of letting the lesson stay only in chat.

## Safety Skills

- `careful`: pause before destructive actions
- `freeze`: lock edits to one root
- `guard`: apply both
- `unfreeze`: remove the lock

## Freeze Lock

State file:

`~/.openclaw/workspace/state/freeze.json`

If active, mutating operations outside the configured `root` are blocked by governance.

Read-only work remains allowed outside the root.

## Runtime Truth

Claims about execution must still satisfy:

- file contents
- command output
- logs
- state changes
- verified code paths

If those are missing, the claim is not verified.
