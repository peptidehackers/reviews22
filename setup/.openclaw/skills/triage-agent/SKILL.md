# Triage Agent (Crown Prince) Skill

> **Crown Prince** — The first line of defense.

## Purpose

Filter incoming messages and decide:
1. **Chat** → Auto-reply or ignore
2. **Task** → Forward to planning/orchestration
3. **Needs clarification** → Ask one bounded question

## When to Use

Before any agent work begins, run triage to avoid wasting tokens on casual conversation or misclassifying the user’s actual intent.

## Intent Gate (Mandatory)

Before routing, do three things:

1. **Verbalize detected intent** in one sentence.
   - research / understanding
   - investigation
   - implementation
   - evaluation / recommendation
   - chat
2. **Reset intent from the current message only.**
   - Do not carry implementation mode from a prior turn.
   - A new question is a question even if the previous turn was editing.
3. **Check implementation readiness.**
   - explicit implementation verb?
   - concrete enough scope?
   - no blocking ambiguity?
   - if any are missing, do not implement yet

## Triage Rules

### → SKIP (just chat, no action needed)

- Greetings ("hi", "hello", "what's up")
- Small talk ("how are you", "nice weather")
- Thanks/acknowledgments ("thanks", "ok", "done")
- Questions about the agent itself ("who are you", "what can you do")
- Reactions without requests ("cool", "interesting")

**Response**: Brief acknowledgment or `HEARTBEAT_OK` if in heartbeat context.

### → TASK (needs agent work)

- Explicit requests ("please...", "can you...", "I need...")
- Questions requiring research or analysis
- Code/debugging requests
- File operations
- Multi-step instructions
- Anything with temporal urgency ("now", "today", "ASAP")

**Response**: Forward to planning or review, depending on risk and clarity.

### → NEEDS_CLARIFICATION

Use when:

- the request could mean research or implementation
- success condition is unclear
- scope is too open-ended to execute safely
- multiple materially different behaviors are possible

**Response**: Ask one bounded clarifying question.

## Decision Tree

```
Incoming Message
    │
    ├─ Is it just chat / acknowledgment?
    │   └─ YES → Brief reply, STOP
    │
    ├─ Is current-message intent research/investigation only?
    │   └─ YES → Continue with read/search/report, NO edits
    │
    ├─ Is implementation explicitly requested and concrete enough?
    │   └─ YES → Forward to TASK queue
    │
    └─ Ambiguous?
        └─ Ask for clarification (1 question max)
```

## Example Triage

| Message | Intent | Decision | Action |
|---------|--------|----------|--------|
| "hey what's up" | chat | SKIP | "Not much! What can I help with?" |
| "thanks!" | chat | SKIP | (silent ack) |
| "can you check the logs" | investigation | TASK | inspect, no edits yet |
| "I need to deploy this" | implementation | TASK | forward to planning |
| "how does auth work?" | understanding | TASK | explain only, no edits |
| "fix the bug in auth.py" | implementation | TASK | forward to planning |

## Routing Discipline (MANDATORY)

Triage decides only three things:

1. `chat` — reply briefly, no workflow
2. `task` — continue to planning/review/execution
3. `needs_clarification` — ask one bounded question

Do not invent company, department, or budget metadata. Those systems are not part of the live quality model.

## What Triage Must Capture

- the user’s actual goal
- whether the request is informational, investigative, evaluative, or action-oriented
- whether execution would be risky
- what evidence will be needed to verify success later

## Escalate to Review When

- the request changes config, auth, routing, dependencies, or architecture
- the scope is ambiguous
- destructive operations are requested
- the success condition is unclear

## Minimal Triage Record

```markdown
TRIAGE
━━━━━━━━━━━━━━━━
Intent: chat | understand | investigate | implement | evaluate
Type: chat | task | needs_clarification
Goal: <one sentence>
Risk: low | medium | high | critical
Next step: reply | report | plan | review | ask
━━━━━━━━━━━━━━━━
```

## Contract Reference

See:

- `~/.openclaw/config/boundary-contract.yaml`
- `~/.openclaw/config/truth-policy.md`
