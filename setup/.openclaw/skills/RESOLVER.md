# Skills Resolver

Use this file to decide which skill or policy to apply first.

## Canonical Flow

For coding, debugging, review, and verification work, `workspace/QUALITY-SYSTEM.md` is the canonical flow. This file decides which skill or policy to layer onto that flow.

Default additions:

- `triage-agent` on every incoming request
- `advisory-board` only for ambiguous, high-risk, or contested decisions
- `preflight` for unfamiliar, external, or high-risk work before planning
- search-first discovery when locations, boundaries, or prior art are unclear; read only targeted evidence before acting
- `karpathy-guidelines` for non-trivial implementation, cleanup, refactor, or review work
- `investigate` before any bug fix whose cause is unclear
- `multifix` for bugs/regressions that need investigation + bounded repair + verification in one lane
- `review-gate` for high-risk work or when the quality of the plan is the question
- `execution-loop` for approved bounded work that should move fast
- `qa-only` for report-only verification passes
- `careful`, `freeze`, or `guard` for destructive or high-sprawl work
- `brain-ops` when prior memory could affect the answer, plan, or risk
- `config/truth-policy.md` for runtime claims
- `config/provider-failure-policy.md` for provider/model/fallback work
- `maintain-memory` after meaningful work when durable memory should be corrected or updated

## Routing Rules

### Casual or social messages

- Use `triage-agent`
- Prefer a brief response
- Do not invoke heavy workflows

### Normal bounded work

- Follow `workspace/QUALITY-SYSTEM.md`
- Add `preflight` if the repo surface or verification path is not already clear
- Add targeted discovery if file locations or existing patterns are still unproven
- Add `karpathy-guidelines` if the work could sprawl, overcomplicate, or over-edit
- Once approved and bounded, move through `execution-loop`

### High-risk work

- Follow `workspace/QUALITY-SYSTEM.md`
- Add `preflight`
- Add `advisory-board` when there are multiple serious options or unresolved tensions
- Add `review-gate`
- Add `careful`, `freeze`, or `guard` when the blast radius is wide or destructive
- Expect `review-gate` to reject missing `Preflight evidence`, discovery evidence, or `Recovery path` when they are required
- High-risk means config, auth, routing, dependency, architecture, or destructive changes

### Provider or model work

- Read `config/provider-failure-policy.md`
- Do not retry dead provider paths without new evidence
- Do not name fallback providers unless they are currently verified
- Expect planning and review to require current provider path, verified fallback, and a stop condition
- Keep provider claims inside `config/truth-policy.md`

### Bugs and regressions

- Use `investigate` first
- Add search-first discovery when the failing boundary or relevant files are still unclear
- Use `multifix` when the task needs diagnosis + smallest-safe repair + explicit verification in one lane
- Add `advisory-board` only if root cause remains ambiguous after investigation
- Then apply `karpathy-guidelines` if the fix shape could widen or overreach
- If a failed fix or user correction exposes a wrong assumption, route the lesson to `maintain-memory`
- Do not implement speculative fixes

### Verification requests

- Use `qa-only` when the user wants findings without edits
- Use `review-gate` when the quality of the plan is the main question
- Use `advisory-board` when multiple viable answers need a structured decision, not just a pass/fail review

### Aggressive delivery

- Use `execution-loop` when the task is already scoped and should move decisively
- Do not use it to bypass planning, investigation, review, or truth policy

### Memory-sensitive work

- Use `brain-ops` before answering questions about prior work, preferences, operating rules, or recurring projects
- Use `maintain-memory` when daily logs are noisy, duplicated, contradicted by current verified state, or when a correction produced a durable decision rule

### Runtime claims

- Always apply `config/truth-policy.md`
- If evidence is missing, say `not verified` or `cannot determine from current evidence`

## Anti-Patterns

- Do not recreate deleted budget or token-accounting systems
- Do not present configuration as runtime proof
- Do not skip lightweight repo-context checks when working in an unfamiliar surface
- Do not guess file locations or implementation boundaries when search and targeted reads can prove them
- Do not silently choose an implementation when ambiguity materially changes behavior
- Do not widen the diff with opportunistic cleanup or speculative abstractions
- Do not say a mutation worked until you have checked the changed file, output, or state directly
- Do not let long, polished prose substitute for verification
- Do not let user corrections or failed attempts die in chat if they should change future workflow behavior
