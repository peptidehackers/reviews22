# Memory Operations

This workspace uses a small memory model inspired by gbrain, trimmed to what is useful here.

## Default Rule

Read memory before acting when prior context matters. Write memory after learning when the result should survive the session.

Choose the narrowest retrieval scope first using `workspace/RETRIEVAL-MAP.md`.

## Save What Matters

Important work is only easy to recover when it lands in repo-owned memory surfaces.

Write it down after any of these:

- architectural or workflow decisions
- fixes that reveal a reusable root cause or invariant
- corrections to prior assumptions
- changes to routing, security, provider behavior, or setup
- anything expected to survive a cleared chat/session

### Default save locations

After meaningful work, write the result to the smallest durable backend that fits:

- `~/.omx/project-memory.json` for repo state and verified implementation facts
- `~/.omx/wiki/` for architecture, decisions, procedures, and long-form reference
- `workspace/MEMORY.md` for durable user/system preferences and operating truths

Use `workspace/memory/YYYY-MM-DD.md` only as a chronological supplement, not as the only place important knowledge lives.

### Before you wrap up

Do not treat work as complete until:

1. the change is implemented
2. the change is verified
3. the durable result is written to persistent memory/docs when it should survive the session

If it only exists in the chat transcript, it is not sufficiently saved.

## Memory Layers

### 1. Daily logs

`workspace/memory/YYYY-MM-DD.md`

Use for raw session facts, actions, and observations.

### 2. Curated memory

`workspace/MEMORY.md`

Use for stable preferences, current operating rules, and active long-term context.

### 3. Entity pages

`workspace/entities/`

Use for recurring people, projects, and systems.

### 4. Retrieval map

`workspace/RETRIEVAL-MAP.md`

Use to decide where to look first instead of searching the whole workspace indiscriminately.

## Conflict Rule

If a daily log conflicts with current evidence:

- keep the historical note in the daily log
- update curated memory or the entity page with the current truth
- prefer the current verified state during future work

## Maintenance

Use `maintain-memory` periodically to:

- promote durable facts
- mark obsolete notes as superseded
- keep entity pages current
- keep retrieval scopes tight and discoverable
