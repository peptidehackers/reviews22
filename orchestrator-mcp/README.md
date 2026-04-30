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
npm run showcase:build
npm run showcase:serve
npm test
```

## Scripts

- `npm test` — run the full node test suite and verify `showcase/site-data.json`
- `npm run showcase:build` — regenerate the showcase data artifact
- `npm run showcase:check` — fail if the generated artifact is stale
- `npm run showcase:serve` — rebuild and serve the static showcase locally

## Notes on the integration

This implementation is **inspired by** Huashu Design's workflow principles:

- source-of-truth first
- HTML as a durable delivery medium
- verification before handoff

It does **not** copy Huashu source files or prompts.
