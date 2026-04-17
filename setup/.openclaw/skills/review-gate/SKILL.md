# Review Gate (Chancellery) Skill

> **Chancellery** — The quality gate.

## Purpose

Review high-risk plans or plans whose quality is in doubt before execution. This gate can reject, narrow, or escalate a plan before expensive work begins.

## When to Use

- high-risk changes: config, auth, routing, dependency, architecture, destructive work
- plans that may be too broad, speculative, or weakly verified
- explicit review requests where the quality of the plan is the main question

## Review Checklist

### 1. Clarity ✓

- [ ] Is the goal unambiguous?
- [ ] Are success criteria defined?
- [ ] Is the scope bounded?

### 2. Context ✓

- [ ] Is relevant context included?
- [ ] Are constraints acknowledged?
- [ ] Is the codebase/project understood?
- [ ] If the work is unfamiliar, external, or high-risk, is `Preflight evidence` present?
- [ ] If file locations or touch points were unclear, is `Discovery evidence` present?

### 3. Approach ✓

- [ ] Is the proposed approach sound?
- [ ] Are there simpler alternatives?
- [ ] Is the complexity justified?

### 4. Surgical scope ✓

- [ ] Is the write surface proportional to the request?
- [ ] Does each changed file trace back to the task?
- [ ] Are unrelated cleanups deferred instead of folded in?

### 5. Verification ✓

- [ ] How will success be measured?
- [ ] Can partial progress be validated?
- [ ] Are rollback points defined?
- [ ] Does the plan verify mutations before claiming progress?

### 6. Risk ✓

- [ ] What could go wrong?
- [ ] Are destructive operations marked?
- [ ] Is user confirmation needed?

---
## Runtime Alignment (MANDATORY)

This skill must match the enforced runtime behavior:

- Use `~/.openclaw/config/truth-policy.md` for what can be claimed
- Use `~/.openclaw/config/boundary-contract.yaml` for what requires review
- Use `~/.openclaw/config/provider-failure-policy.md` for provider/model/fallback work
- Treat deleted budget/token systems as historical only; do not reference or recreate them

## What Review Actually Checks

### 1. Evidence quality

- Are claims backed by file contents, logs, command output, or verified code paths?
- Is any step described as executed when it was only planned or configured?
- If evidence is missing, mark the claim `not verified`

### 2. Change risk

- `low`: reads, inspection, reversible local work
- `medium`: normal edits with bounded scope
- `high`: config, auth, routing, dependency, or architecture changes
- `critical`: destructive or irreversible operations

Provider/model work should also be checked for retry and fallback quality against the provider failure policy.

### 3. Verification path

- Is there a concrete check after execution?
- Can the result be proven with logs, tests, or state changes?
- If not, require the plan to add one
- Does the plan specify how each mutation will be checked before the next step?

### 4. Diff discipline

- Is the proposed patch still the smallest one that can work?
- Is any adjacent cleanup actually required by the request?
- If the diff feels broad, send it back for simplification

### 5. Recovery path

- If verification fails, is there a small patch path first?
- If that fails, can the last atomic change be reverted cleanly?
- Does the plan avoid leaving a partially broken state behind?

### 6. Enforcement rule

- Reject or modify a plan that omits `Preflight evidence` when the task is unfamiliar, external, or high-risk.
- Reject or modify a plan that omits `Discovery evidence` when the task still depends on guessed paths, boundaries, or prior art.
- Reject or modify a plan that omits `Recovery path` when failed verification could leave partial damage.
- Reject or modify provider/model plans that omit current provider path, verified fallback, or a clear stop condition.

## Approval Standard

Approve only when the plan is:

- clear enough to execute without guessing
- bounded enough to avoid collateral damage
- simple enough to avoid speculative structure
- verifiable after the fact
- consistent with the runtime truth policy
- explicit enough about preflight/discovery/recovery when the task shape requires them
- explicit enough about provider path/fallback/stop condition when provider/model work is involved

Reject or modify plans that are merely plausible but not provable.

## Review Outcomes

- `APPROVE` when the plan is sound and proportionate
- `MODIFY` when the shape is right but still needs narrowing or stronger verification
- `REJECT` when the plan is speculative, too broad, or unsafe
- `ESCALATE` when the risk requires user approval

If multiple serious options remain unresolved, escalate to `advisory-board` rather than forcing false certainty.

## Review Output Format

```markdown
REVIEW
━━━━━━━━━━━━━━━━
Decision: APPROVE | MODIFY | REJECT | ESCALATE
Risk: low | medium | high | critical
Problem: <if any>
Required verification: <what must be shown after execution>
━━━━━━━━━━━━━━━━
```

## Contract Reference

See:

- `~/.openclaw/config/boundary-contract.yaml`
- `~/.openclaw/config/truth-policy.md`
