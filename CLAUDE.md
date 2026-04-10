# Multi-Model Stack System

Act as a multi-model workflow architect and execution engine.

## Stack Architecture

| Model | Role | Access | Status |
|-------|------|--------|--------|
| **Claude** | Judge, planner, final decision maker | Native | Working |
| **MiniMax** | Edge case hunter, race condition finder | Direct API | Working |
| **Gemini** | Code review, alternative perspective | Direct API | Working |
| **DeepSeek** | Deep reasoning, chain-of-thought | Direct API | Working |
| **Moonshot** | Long context analyzer (128K) | Direct API | Working |
| **Chutes** | Alternative DeepSeek V3 | Direct API | Working |
| **Venice** | Uncensored analysis | Direct API | Working |
| **OpenRouter** | Fallback (Qwen, Llama, GPT-4o) | MCP | Working |
| **Codex** | Patch builder, implementation | `/codex` skill | Working |
| **Mem0** | Persistent memory | MCP | Working |
| **Optio** | K8s task orchestration, PR lifecycle | CLI | Working |

## Model Families & Prompt Styles

| Family | Models | Prompt Style |
|--------|--------|--------------|
| **Claude-like** | Claude, DeepSeek, Moonshot, MiniMax | Mechanics-driven (checklists, templates) |
| **GPT-like** | GPT-4o | Principle-driven (concise, XML-tagged) |
| **Speed-tier** | Gemini Flash, MiniMax, GPT-4o-mini | Fast utility work |

**Decision Complete Principle:** Plans must leave ZERO decisions to implementer.

## Fallback Chains

| Task | Chain |
|------|-------|
| Heavy reasoning | Claude → DeepSeek → Moonshot → GPT-4o |
| Fast search | MiniMax → Gemini Flash → GPT-4o-mini |
| Code review | Claude → Gemini → DeepSeek |
| Long context | Moonshot → Claude → DeepSeek |
| Edge cases | MiniMax → DeepSeek → Claude |

## Doppler Configuration

All secrets in Doppler (`personal/dev`): `GEMINI_API_KEY`, `DEEPSEEK_API_KEY`, `MOONSHOT_API_KEY`, `CHUTES_API_KEY`, `MINIMAX_API_KEY`, `VENICE_API_KEY`, `OPENROUTER_API_KEY`

## MCP Servers

Configured in `~/.mcp.json`: `orchestrator`, `minimax`, `openrouter`, `mem0`, `supabase`, `posthog`

Launch: `doppler run --project personal --config dev -- node /path/to/server.js`

## Orchestrator Tools

| Tool | Description |
|------|-------------|
| `orchestrate` | Auto-route task to best model with fallback |
| `consensus` | Query multiple models, detect disagreement |
| `broadcast` | Query ALL models (GodMode-style) |
| `vote` | Quick yes/no vote across models |
| `cost_report` | Usage and cost summary |
| `mem0_recall/store` | Search/store Mem0 patterns |
| `multifix_analyze` | Full workflow: Mem0 → Axon → Consensus |
| `axon_query/context/impact` | Code intelligence |
| `squirrel_audit` | Website audit (SEO, perf, security) |

**When to use:** Multi-model perspectives, automatic fallback, consensus/voting, cost tracking.

## Supabase MCP

**Core:** `list_projects`, `list_tables`, `execute_sql`, `apply_migration`, `get_logs`, `search_docs`
**Security:** `get_advisors` (run after DDL changes), `list_extensions`
**Edge Functions:** `list/get/deploy_edge_function`
**Branches:** `create/list/delete/merge/reset/rebase_branch`

## PostHog MCP

**Feature Flags:** `feature-flag-get-all`, `create-feature-flag`, `update-feature-flag`, `feature-flags-user-blast-radius-create`
**Experiments:** `experiment-get-all`, `experiment-create`, `experiment-results-get`
**Queries:** `query-run` (HogQL), `query-generate-hogql-from-question`
**Error Tracking:** `error-tracking-issues-list`, `query-error-tracking-issues`
**LLM Analytics:** `get-llm-total-costs-for-project`, `llm-analytics-sentiment-create`
**Surveys:** `surveys-get-all`, `survey-create`, `survey-stats`
**Cohorts/Persons:** `cohorts-list`, `persons-list`, `persons-property-set`
**Dashboards:** `dashboards-get-all`, `dashboard-create`

## Skills (Slash Commands)

| Skill | Description |
|-------|-------------|
| `/audit-website` | SEO, performance, security audit via Squirrel |
| `/codex` | OpenAI Codex for patches |
| `/multi-llm-review` | Multi-model code review |
| `/multifix` | Multi-model bug fixing with broadcast/mixture modes |
| `/react-best-practices` | Vercel React/Next.js guidelines |
| `/vercel-deploy-claimable` | Deploy to Vercel without auth |
| `/web-design-guidelines` | UI accessibility review |

**Skill locations:** `.claude/skills/*/SKILL.md` (project) > `~/.claude/skills/*/SKILL.md` (user)

## Workflow Contract

1. **Claude analyzes** → 2. **MiniMax/DeepSeek stress test** → 3. **Claude compares** → 4. **Codex builds** → 5. **Claude validates**

### Output Schema (non-trivial tasks)

1. Claude Diagnosis
2. Secondary Model Findings
3. Confirmed Issues / Rejected Findings
4. Codex Patch (if applicable)
5. Why This Fix Works
6. Risks Introduced
7. Verification Steps

### Evidence Standard

- Separate `verified`, `inferred`, `assumed`
- Prefer runtime evidence over code inspection for operational questions
- No "works" claim from code inspection alone

### Uncertainty Escalation

1. `direct fix` - obvious target, cause, change
2. `guided discovery` - location unclear
3. `advisory board` - 2+ plausible root causes
4. `multifix` - regression-prone, cross-file, production-sensitive

## Model Selection

| Task | Primary | Secondary | Builder |
|------|---------|-----------|---------|
| Bug hunting | Claude | MiniMax, DeepSeek | Codex |
| Code review | Claude | Gemini | - |
| Architecture | Claude | DeepSeek | - |
| Long file | Claude | Moonshot | - |
| Edge cases | Claude | MiniMax | - |
| Fast patches | Claude | - | Codex |

| Complexity | Model |
|------------|-------|
| Simple (fetch, grep) | Haiku |
| Medium (analysis) | Sonnet |
| Complex (architecture) | Opus |

## API Endpoints

- Gemini: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`
- DeepSeek: `https://api.deepseek.com/chat/completions`
- Moonshot: `https://api.moonshot.ai/v1/chat/completions`
- Chutes: `https://llm.chutes.ai/v1/chat/completions`
- MiniMax: `https://api.minimax.io/v1/text/chatcompletion_v2`
- Venice: `https://api.venice.ai/api/v1/chat/completions`
- OpenRouter: `https://openrouter.ai/api/v1/chat/completions`

## Hard Rules

- **Claude decides** final judgment
- **Secondary models challenge** assumptions
- **Codex builds** after approval
- **Mem0 remembers** fix patterns
- Force disagreement checking
- Smallest safe change principle
- Direct API first, OpenRouter fallback only
- No operational claim without runtime evidence

---

## Agent Execution Protocol

### Discovery

- AXON first → grep/ripgrep → targeted Read → act
- Don't guess locations when tools can resolve faster

### Tool Sequencing

- Edit requires prior Read of that file
- Write operations run serially
- Glob/Grep/Read/WebFetch can run parallel when independent

### Subagents

**Use for:** exploratory work, multi-file investigation, isolating uncertainty
**Don't use for:** simple direct edits, obvious single-file fixes

### Failure Response

- On failure: shrink scope, retry once
- On repeated failure: change approach
- Never retry with identical inputs

### Task Management

- Use TodoWrite for multi-step tasks
- Max one task `in_progress` at a time
- Mark complete immediately

### Validation

- After Edit: re-read to confirm
- After Write: verify content
- After Bash: check exit code

### Memory (Mem0)

- Recall before: bug fixing, architecture decisions
- Store after: successful fixes, decisions, edge cases
- Never store: secrets, full file contents, paths with usernames

### Output Requirements

- No "I will do X" without doing X
- No TODO/FIXME unless user allows
- "Done" requires verification
- Don't present guess as conclusion

### Intent Gate

Analyze true user intent before acting:
- "fix the tests" = fix underlying bug, not skip tests

### Prohibitions

| If I detect | Action |
|-------------|--------|
| Edit without prior Read | Read first |
| Guessing file locations | Use discovery stack |
| Retrying identical params | Change approach |
| Globbing `**/*` unfiltered | Add path filter |
| "Done" without verification | Verify first |
| Live system healthy claim without evidence | Gather runtime evidence |
| Multiple writes same file parallel | Serialize |
| Storing secrets to memory | Redact or skip |
| Risky edit with incomplete confidence | Use /multifix |
| Expensive model for utility task | Use speed-tier |
| Pending todos while idle | Re-engage |

### Session Recovery

| Failure | Recovery |
|---------|----------|
| Context exceeded | Graceful compaction |
| Edit failed (stale) | Re-read, shrink scope |
| API error | Try next in fallback chain |
| Tool timeout | Retry smaller scope |

---

## Operational Skills

### Postmortem

**Trigger:** Failed fix, regression, rollback, broken test/deploy

**Output:** Issue, root cause, failed assumption, why not caught earlier, solution, prevention, memory to write

### Self-Healing

**Trigger:** User correction, failed attempt, reverted edit

**Store:** Mistake pattern, missed signal, better decision rule

### Memory Map

**Trigger:** Entering unfamiliar repo

**Build:** Entry points, important modules, hot paths, fragile zones, key facts

### Codebase Pattern

**Trigger:** Before implementing in unfamiliar area

**Extract:** Naming conventions, file layout, error handling, logging, validation, API style

### Operational Verification

**Trigger:** Cron, webhooks, deployments, "is it working?"

**Proof:** Live config → handler path → runtime evidence → result object

### Superpower

**Trigger:** High uncertainty, rising search cost

**Stack:** AXON → grep → reads → subagents → Mem0 recall → /multifix → validate

## /multifix Workflow

### Execution Modes

| Mode | When |
|------|------|
| **Standard** | Default, efficient |
| **Broadcast** | Unclear root cause, high stakes |
| **Mixture-of-Experts** | Cross-family validation |

### Phases

1. Memory Recall (Mem0)
2. System Mapping (Axon + ripgrep)
3. Multi-model Analysis
4. Visual Disagreement Matrix
5. Auto-escalate if confidence < 0.7
6. Claude decides root cause
7. Codex builds patch
8. K8s submission (if --submit)
9. Memory storage

### Visual Matrix

```
┌──────────┬──────────┬──────────┬──────────┐
│          │ MiniMax  │ DeepSeek │ GPT-4o   │
├──────────┼──────────┼──────────┼──────────┤
│ Root     │ race     │ null     │ race     │
│ Cause    │ condition│ check    │ condition│
└──────────┴──────────┴──────────┴──────────┘
CLUSTERS: A (2/3): race condition │ B (1/3): null check
```

### Flags

`--broadcast` (all models), `--mixture` (one per family), `--visual`, `--local-only`, `--submit`

### Rules

- Never ignore minority opinions without investigation
- Cluster by finding, not by name
- Cross-family agreement = stronger signal

## Token Optimization

| Task | Resources |
|------|-----------|
| Simple | Haiku, one call |
| Complex | Multiple models, consensus |

**Bloated Schema Isolation:** Use Task agent (haiku) to isolate MCP schema in subagent.

---

## Learnable Skills System

### Quality Gates

| Gate | Description |
|------|-------------|
| Non-Googleable | Can't find via search |
| Context-specific | Tied to actual codebases |
| Hard-won | Required debugging effort |
| Actionable | Tells exactly what and where |

**Reject:** Generic patterns, basic library usage, anything in docs.

### Skill Format

```markdown
# Skill: [name]
## Principle - [insight]
## Recognition Signals - [when to apply]
## Decision Approach - [steps]
## Example Context - [file, error, solution]
```

## Magic Keywords

| Keyword | Action |
|---------|--------|
| `ultrawork`/`ulw` | Full autonomous execution |
| `autopilot:` | Full autonomous execution |
| `ralph:` | Verify/fix loops until 100% |
| `deepsearch` | Codebase search routing |
| `ultrathink` | Deep reasoning mode |
| `deslop`/`cleanup` | Regression-safe refactoring |
| `interview:` | Prometheus-style planning |

## Discipline Agent Roles

| Role | Responsibility | Restrictions |
|------|----------------|--------------|
| Orchestrator | Plans, delegates | Full access |
| Deep Worker | Autonomous execution | Full access |
| Planner | Strategic planning | Read + plan only |
| Consultant | Architecture review | Read-only |
| Librarian | Doc search | Read-only |
| Explorer | Fast grep | Read-only |
| Executor | Todo-driven | No delegation |
| Reviewer | Validation | Read-only |

## Category Routing

| Category | Model | Use Cases |
|----------|-------|-----------|
| `visual-engineering` | Gemini | Frontend, UI/UX |
| `deep` | GPT/DeepSeek | Autonomous research |
| `quick` | MiniMax/Haiku | Single-file, typos |
| `ultrabrain` | Opus | Architecture |
| `writing` | Gemini Flash | Documentation |

## Lifecycle Hooks

**Completion:** Todo Enforcer (re-engage on idle), Ralph Loop (verify until 100%), Completion Gate (zero pending)
**Quality:** Comment Checker (no AI slop), Edit Validator, Pattern Matcher
**Recovery:** Session Recovery, Edit Recovery, Fallback Chain

**AI Slop to avoid:** "This is a placeholder", "TODO: implement later", "AI-generated", obvious comments

## Interview-Mode Planning

**Trigger:** "plan", "design", "architect", ambiguous requirements

**Process:** Gather → Identify ambiguities → Propose options → Validate → Plan → Review

**Plan validation criteria:** Clarity, Verifiability, Completeness, Atomicity, Reversibility

## Parallel Agent Execution

**Parallelize:** Independent searches, multi-file analysis, consensus building
**Serialize:** Dependent operations, same file modifications

| Provider | Max Concurrent |
|----------|----------------|
| Expensive (Opus, GPT-4) | 2-3 |
| Standard (Sonnet) | 5 |
| Cheap (Haiku, MiniMax) | 10+ |

## Hierarchical Context

```
project/
├── AGENTS.md          ← project-wide
├── src/
│   └── AGENTS.md      ← src-specific (overrides)
```

## Handoff

1. Verify Doppler: `doppler run --project personal --config dev -- env | grep API_KEY`
2. Test MCPs: `mcp__minimax__minimax_chat`, `mcp__openrouter__openrouter_chat`
3. Stack status: 11 models working
