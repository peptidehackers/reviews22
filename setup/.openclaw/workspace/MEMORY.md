# MEMORY.md

Curated long-term memory for main sessions only.

## User

- The user is in the `America/Los_Angeles` timezone.
- They prefer direct, high-signal answers over padded prose.
- They want the system to improve materially, not just accumulate documentation.

## System Priorities

- Quality is driven by workflow structure: triage, planning, investigation, review, execution, verification.
- Truth policy is strict: configured behavior is not runtime proof.
- Deleted budget/token accounting systems are historical only and must not be recreated.
- Risky work should be bounded with `careful`, `freeze`, or `guard` when appropriate.

## Current Quality Model

- The active quality stack is documented in `workspace/QUALITY-SYSTEM.md`.
- The managed runtime hook lives in `hooks/pre-execution-governance/` and currently proves gateway startup hook loading with a runtime marker log.
- The freeze lock is real and backed by `workspace/state/freeze.json`.
- Specialist skills exist for `plan-eng-review`, `investigate`, `qa-only`, and safety controls.

## Memory Rules

- Daily logs are raw notes, not always current truth.
- Curated memory and entity pages should be used for current durable state.
- Historical notes from the April 5 budget-era governance model are obsolete and should not guide current behavior.

## Active Threads

- Improve OpenClaw into a stronger quality-focused system using lessons from gstack and gbrain.
- Keep changes minimal, enforceable, and verified.
