# minimax-mcp

An MCP server that exposes MiniMax as a fast secondary model lane for direct chat and structured analysis.

## Tools

- `minimax_chat` — direct prompt/response access
- `minimax_analyze` — structured analysis modes for review, debugging, comparison, and explanation

## Why it matters in this workspace

This server is now integrated into the `orchestrator-mcp/showcase/` experience so operators can understand where MiniMax fits inside the broader orchestration story:

- cheap / fast second opinions
- side-by-side analysis flows
- lightweight contrast against heavier routed execution

## Commands

```bash
npm install
npm run start
```

## Environment

Set:

- `MINIMAX_API_KEY`
- optional `MINIMAX_MODEL` (defaults to `MiniMax-M2.7`)
