# OpenClaw Governance

## Current Rules

- `config/truth-policy.md` governs what can be claimed.
- `config/boundary-contract.yaml` defines the current risk/review model.
- `hooks/pre-execution-governance/handler.ts` is the verified managed runtime hook entrypoint, and `runtime-hook.log` is the proof artifact for gateway startup firing.
- `hooks/pre-execution-governance/enforce.py` remains the repo-owned governance checker asset colocated with the hook.

## Safety

- Destructive or sprawling work should route through `careful`, `freeze`, or `guard`.
- Freeze state is stored in `workspace/state/freeze.json`.

## Memory Interaction

- Governance changes that affect future behavior should be written to curated memory and the relevant entity page.
- Historical logs are useful context, but current behavior must be established from current files and verified runtime behavior.
