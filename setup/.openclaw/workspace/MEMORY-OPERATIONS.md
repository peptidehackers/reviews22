# Memory Operations

This workspace uses a small memory model inspired by gbrain, trimmed to what is useful here.

## Default Rule

Read memory before acting when prior context matters. Write memory after learning when the result should survive the session.

Choose the narrowest retrieval scope first using `workspace/RETRIEVAL-MAP.md`.

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
