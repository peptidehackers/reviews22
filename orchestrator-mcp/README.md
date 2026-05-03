# orchestrator-mcp

A multi-LLM MCP server that routes work to the best model, falls back when providers fail, tracks cost, supports consensus workflows, and exposes memory / audit tooling.

## What is included

### Core MCP server

`server.js` exposes tools for:

- routing and execution (`orchestrate`, `route_explain`, `call_model`)
- consensus and reasoning loops (`consensus`, `vote`, `council`, `smart_consensus`, `reasoning_loop`)
- prompt and context handling (`get_prompt`, `compress_context`, `session_info`)
- memory (`mem0_recall`, `mem0_store`)
- code intelligence and audits (`axon_*`, `squirrel_audit`, `posthog_guide`, `multifix_analyze`)
- governance and security (`cost_report`, `model_info`, `tool_status`, `validate_prompt`, permission controls)

### Source-synced showcase

The new `showcase/` directory is a complete HTML experience derived from the live MCP surfaces.

It includes:

- a polished architecture / onboarding page
- a live in-browser router lab
- a grouped tool atlas
- model and fallback summaries
- copy-pasteable operator recipes
- stale-file tests so the showcase cannot drift from the code

## Commands

```bash
npm install
npm run venice:check
npm run venice:models
npm run venice:ask -- "Say hello from Venice."
npm run venice:smoke
npm run showcase:build
npm run showcase:serve
npm test
```

## Environment

Direct-provider lanes require their matching API keys in the environment, for example:

```bash
export VENICE_API_KEY=...
```

Venice chat requests use the OpenAI-compatible endpoint at:

```text
https://api.venice.ai/api/v1/chat/completions
```

The default heavy-reasoning/base route is configured to use Venice.

That means heavy-reasoning tasks now:

1. **start on Venice**
2. **use Venice-compatible request fields** (`max_completion_tokens`)
3. **escalate through the configured fallback chain** if Venice is unavailable or fails

If you prefer Doppler-managed secrets, you can still launch the server with:

```bash
npm run start:doppler
```

## Venice operations

Check the local routing + environment wiring:

```bash
npm run venice:check
```

Run a live Venice smoke test with the current environment:

```bash
npm run venice:smoke
```

List the currently available Venice models:

```bash
npm run venice:models
```

Send a direct Venice prompt without going through the MCP router:

```bash
npm run venice:ask -- "Say hello from Venice."
```

If you use Doppler instead of exported environment variables, prefix any Venice command with `doppler run --`, for example:

```bash
doppler run -- npm run venice:smoke
```

## Scripts

- `npm test` — run the full node test suite and verify `showcase/site-data.json`
- `npm run venice:check` — verify Venice routing defaults and local env wiring
- `npm run venice:models` — list available Venice models from the live API
- `npm run venice:ask -- "..."` — send a direct prompt to Venice with the current environment
- `npm run venice:smoke` — make a live Venice call with the current environment
- `npm run start:doppler` — run the MCP server with Doppler-provided secrets
- `npm run showcase:build` — regenerate the showcase data artifact
- `npm run showcase:check` — fail if the generated artifact is stale
- `npm run showcase:serve` — rebuild and serve the static showcase locally

## LLM Council Protocol

The orchestrator includes a full 3-stage LLM Council implementation inspired by [Karpathy's llm-council](https://github.com/karpathy/llm-council) but deeply integrated with MCP infrastructure.

### Architecture

```
Stage 1: Initial Responses
├── All council members answer independently in parallel
├── Structured JSON responses with confidence scores
└── Evidence and reasoning chains captured

Stage 2: Peer Review (Anonymized)
├── Each model evaluates others without knowing identities
├── Rankings, insights, gaps, and contradictions identified
└── Synthesis recommendations collected

Stage 3: Chairman Synthesis
├── Designated model (default: gemini3pro) consolidates all input
├── Resolves disagreements with explicit rationale
├── Preserves minority views when applicable
└── Produces unified recommendation with action items
```

### Council Modes

| Mode | Stages | Best For |
|------|--------|----------|
| `quick` | Stage 1 only | Fast decisions, low stakes |
| `standard` | Stage 1 + 2 | Important decisions with disagreement detection |
| `full` | All 3 stages | Critical decisions requiring synthesis |

### Tools

**`council`** — Full 3-stage protocol
```json
{
  "prompt": "Should we use Redis or Postgres for session storage?",
  "mode": "full",
  "models": ["gpt4o", "claude", "deepseek", "minimax"]
}
```

**`smart_consensus`** — Auto-escalating consensus
```json
{
  "prompt": "Is this code change safe?",
  "auto_escalate": true,
  "escalate_threshold": 2,
  "min_confidence": 0.6
}
```

Starts with quick single-pass consensus. If disagreement count exceeds threshold or confidence drops below minimum, automatically escalates to full council.

### Configuration

Council settings live in `config/council.json`:

```json
{
  "modes": {
    "quick": { "skipPeerReview": true, "skipChairman": true, "maxModels": 3 },
    "standard": { "skipPeerReview": false, "skipChairman": true, "maxModels": 5 },
    "full": { "skipPeerReview": false, "skipChairman": false, "maxModels": 8 }
  },
  "anonymization": {
    "enabled": true,
    "labels": ["Analyst A", "Analyst B", "Analyst C", ...]
  },
  "chairman": {
    "model": "gemini3pro",
    "fallbackChain": ["claude45", "gpt54", "deepseek"],
    "includeMinorityViews": true
  }
}
```

### Key Improvements Over Single-Pass Consensus

| Feature | Single-Pass | Full Council |
|---------|------------|--------------|
| Peer critique | No | Yes (anonymized) |
| Bias prevention | No | Yes (identity hidden) |
| Disagreement resolution | Heuristic | Explicit with rationale |
| Minority views | Lost | Preserved |
| Final synthesis | None | Chairman-produced |
| Confidence | Per-model average | Weighted by peer agreement |

### Programmatic Usage

```javascript
import { runCouncil, fullCouncil, smartConsensus } from "./consensus.js";

// Quick council (stage 1 only)
const quick = await runCouncil(prompt, { mode: "quick" });

// Standard council (+ peer review)
const standard = await runCouncil(prompt, { mode: "standard" });

// Full council (all 3 stages)
const full = await fullCouncil(prompt, { models: ["gpt4o", "claude", "deepseek"] });

// Auto-escalating
const smart = await smartConsensus(prompt, models, {
  autoEscalate: true,
  escalateThreshold: 2,
  minConfidence: 0.6
});
```

---

## Notes on the integration

This implementation is **inspired by** Huashu Design's workflow principles:

- source-of-truth first
- HTML as a durable delivery medium
- verification before handoff

It does **not** copy Huashu source files or prompts.
