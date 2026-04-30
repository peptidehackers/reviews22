# MCP Showcase

This is the Huashu-inspired integration layer for the workspace.

## What it is

A static HTML showcase that is **generated from the actual MCP servers and config files** for:

- `orchestrator-mcp`
- `minimax-mcp`

It is designed to serve four jobs at once:

1. Architecture explainer
2. Operator onboarding surface
3. Live router sandbox
4. Printable / shareable handoff artifact

## Why it exists

The original Huashu Design repo is valuable because it codifies workflow discipline:

- source-of-truth first
- real artifacts over vague descriptions
- one medium that can serve multiple outputs
- verification gates so the design layer does not drift

This showcase applies those ideas to MCP infrastructure without copying Huashu source material.

## Commands

From `orchestrator-mcp/`:

```bash
npm run showcase:build
npm run showcase:check
npm run showcase:serve
npm test
```

## Files

- `index.html` — the export-friendly static experience
- `app.js` — data-driven UI rendering + in-browser router preview
- `site.css` — responsive and print-aware styling
- `site-data.json` — generated source-of-truth artifact
- `lib/source-data.mjs` — MCP metadata extraction helpers
- `lib/showcase-data.mjs` — site data builder

## Drift protection

`site-data.json` is generated from:

- `orchestrator-mcp/server.js`
- `minimax-mcp/server.js`
- `orchestrator-mcp/router.js`
- `orchestrator-mcp/models.js`
- `orchestrator-mcp/config/router.json`
- `orchestrator-mcp/config/models.json`

Tests fail if the generated artifact is stale.
