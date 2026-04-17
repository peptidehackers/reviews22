# Plan Eng Review Skill

> Architecture before implementation.

## Purpose

Take a proposed coding or systems task and turn it into an execution plan that is:

- technically coherent
- bounded in scope
- explicit about edge cases
- explicit about verification

## When to Use

Use this before implementation when the request affects code, configuration, routing, schema, or system behavior.

If provider/model routing, fallback behavior, or external-LLM integration is involved, also apply `config/provider-failure-policy.md`.

## Preflight

For unfamiliar, external, or high-risk work, use `preflight` first or perform the same short grounding inline.
Carry its output forward as `Preflight evidence`.
If file locations, touch points, or prior art are still unclear, carry forward explicit `Discovery evidence` gathered by search plus targeted reads.
If the change could leave partial breakage behind when verification fails, also name a recovery path.

## Review Frame

### 1. Goal

- What user-facing outcome is required?
- What is out of scope?

### 2. Current system

- What exists already?
- What assumptions need to be checked in code or config?
- Which assumptions are still unproven?
- Which file locations, ownership boundaries, or examples are proven versus guessed?

### 3. Change surface

- Which files or modules are likely involved?
- What dependencies, interfaces, or contracts are touched?
- What is the smallest change surface that can work?

### 4. Risks

- What breaks if this is wrong?
- What irreversible effects exist?
- What hidden coupling might exist?
- If provider/model work is involved, what failure class are we dealing with and is any fallback actually verified?

### 5. Simplicity

- Is there a simpler alternative than the first idea?
- Are we adding abstraction, flexibility, or configurability that was not requested?
- Can this be solved by deletion, reuse, or a narrower patch?

### 6. Verification

- What direct proof will show the change worked?
- What should be tested manually or automatically?
- What should be verified before any broader cleanup is considered?
- What will be re-checked immediately after each mutation?

## Output Format

```markdown
ENG REVIEW
━━━━━━━━━━━━━━━━
Goal: <one sentence>
Scope: <bounded scope>
Preflight evidence: <files/commands/examples checked when needed>
Discovery evidence: <search results and targeted reads when locations were unclear>
Assumptions to verify: <flat list>
Likely touch points: <files/modules>
Smallest change: <bounded patch>
Risks: <flat list>
Verification: <tests/logs/state changes>
Recovery path: <small patch first, else revert last atomic change>
Provider path: <current provider/model path, when relevant>
Failure class: <billing | quota | auth | unsupported | payload/context | unknown>
Verified fallback: <currently verified alternative or none>
Stop condition: <what happens if no safe fallback exists>
Recommendation: APPROVE | MODIFY | ESCALATE
━━━━━━━━━━━━━━━━
```

## Standard

Do not greenlight implementation that still depends on guessing about system state.
Do not recommend an approach until you have named the smallest change that could satisfy the request.
Do not omit `Preflight evidence`, `Discovery evidence`, or `Recovery path` when the task shape clearly requires them.
Do not omit provider path, failure class, verified fallback, or stop condition when provider/model work is in scope.
