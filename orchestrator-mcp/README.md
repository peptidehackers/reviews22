# orchestrator-mcp

A multi-LLM MCP server that routes work to the best model, falls back when providers fail, tracks cost, supports consensus workflows, and exposes memory / audit tooling.

## What is included

### Core MCP server

`server.js` exposes tools for:

- routing and execution (`orchestrate`, `route_explain`, `call_model`)
- consensus and reasoning loops (`consensus`, `vote`, `reasoning_loop`)
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

## Notes on the integration

This implementation is **inspired by** Huashu Design's workflow principles:

- source-of-truth first
- HTML as a durable delivery medium
- verification before handoff

It does **not** copy Huashu source files or prompts.
