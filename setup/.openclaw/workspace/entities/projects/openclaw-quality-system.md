# OpenClaw Quality System

## Current State

- The quality model is workflow-first, not budget-first.
- Active stages: triage, plan-eng-review, investigate, review-gate, execution, verification.
- Safety controls: careful, freeze, guard, unfreeze.
- Runtime enforcement is handled by the pre-execution governance hook.

## Verified Facts

- The Python enforcement script supports `allow`, `needs_review`, and `block`.
- The freeze lock is enforced through `workspace/state/freeze.json`.
- Writes outside an active freeze root are blocked.
- Reads outside an active freeze root remain allowed.

## Historical Notes

- Early April governance notes referenced budget and token accounting.
- Those notes are obsolete and should be treated as historical, not current behavior.

## Key Files

- `workspace/QUALITY-SYSTEM.md`
- `config/boundary-contract.yaml`
- `config/truth-policy.md`
- `hooks/pre-execution-governance/enforce.py`
