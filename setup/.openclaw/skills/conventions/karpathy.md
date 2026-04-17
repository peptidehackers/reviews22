# Karpathy Convention

Adapt the Karpathy-style coding discipline as a thin overlay on the local
workflow, not as a replacement for it.

## The Four Principles

### 1. Think Before Coding

- clarify the real objective before editing
- name assumptions instead of silently picking one
- prove likely touch points with search and targeted reads when location is unclear
- note a simpler alternative when one exists
- if success is unclear, stop and define it first

### 2. Simplicity First

- prefer the smallest change that solves the actual request
- avoid speculative abstractions, extra configurability, and future-proofing
- reject broad rewrites when a bounded patch will do

### 3. Surgical Changes

- touch only files and lines justified by the request
- clean up only the mess created by your own change
- mention unrelated issues instead of silently fixing them

### 4. Goal-Driven Execution

- turn work into explicit success criteria
- pair each implementation step with a verification step
- re-check the changed file, output, or state immediately after each mutation
- report only what was actually proven

## Local Mapping

- `triage-agent` captures the real goal and whether clarification is needed
- `preflight` grounds unfamiliar work with small, current evidence
- `plan-eng-review` checks assumptions, scope, and the simplest valid approach
- `review-gate` rejects plans that are not bounded, provable, or proportionate
- `qa-only` or direct verification proves the result before completion

## Failure Pattern To Avoid

`guess -> overbuild -> touch adjacent code -> claim success without proof`

Replace it with:

`clarify -> search -> choose the smallest change -> keep the diff tight -> verify`
