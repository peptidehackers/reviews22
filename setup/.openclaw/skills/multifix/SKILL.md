# Multifix Skill

Use `multifix` or `/multifix` for bugs and regressions that need disciplined multi-model analysis with automatic escalation.

## Summary

Multifix combines:
- **Mem0 recall** for relevant past fixes
- **Axon system mapping** for code structure
- **LLM Council consensus** with auto-escalation

## Council Integration

Multifix now uses the 3-stage LLM Council protocol:

| Mode | Stages | When to Use |
|------|--------|-------------|
| `auto` (default) | Starts quick, escalates when needed | Most bug fixes |
| `quick` | Stage 1 only | Simple, obvious bugs |
| `standard` | Stage 1 + peer review | Disagreement detection needed |
| `full` | All 3 stages | Critical bugs, architecture issues |

### Auto-Escalation

When `council_mode=auto` (default), multifix:
1. Starts with quick single-pass consensus
2. If disagreement count ≥ 2 OR confidence < 60%, escalates to full council
3. Full council adds:
   - **Anonymized peer review** (models critique each other without knowing identities)
   - **Chairman synthesis** (designated model consolidates into unified recommendation)

## Usage

```
/multifix "Race condition in cache invalidation"
```

With options:
```
/multifix {
  "bug_description": "Race condition in cache invalidation",
  "code_context": "// relevant code here",
  "entry_points": ["CacheManager.invalidate", "Cache.set"],
  "models": ["gpt4o", "claude", "deepseek", "minimax"],
  "council_mode": "auto",
  "auto_escalate": true
}
```

## Workflow

1. **Mem0 Recall** — Search for similar past bugs/fixes
2. **Axon System Map** — Trace call chains and impact from entry points
3. **LLM Council** — Multi-model analysis with peer review
4. **Cost Report** — Token usage summary

## Council Modes

### auto (default)
- Starts fast, upgrades when models disagree
- Best for most bugs

### quick
- Single-pass parallel queries
- No peer review
- Fast but may miss edge cases

### standard
- Adds anonymized peer review
- Models rank each other's responses
- Catches blind spots

### full
- Peer review + Chairman synthesis
- Gemini3pro (default) consolidates all findings
- Resolves disagreements with explicit rationale
- Preserves minority views for edge cases

## Output Structure

```
## Mem0 Recall
[Past similar fixes if found]

## Axon System Map
[Code structure and impact]

## LLM Council Analysis
Protocol: full-council
Auto-Escalated: Yes (disagreement detected)
Confidence: 87%

### Chairman Synthesis (gemini3pro)
[Unified recommendation]

### Peer Review Summary
Reviewer Agreement: 75%
Model Rankings: 1. claude, 2. gpt4o, 3. deepseek

## Individual Model Findings
### CLAUDE (92% confident)
...
### GPT4O (85% confident)
...

## Cost Report
...
```

## Local Alignment

If updating multifix, keep these aligned:
- `orchestrator-mcp/server.js` (multifix_analyze handler)
- `orchestrator-mcp/council.js` (council protocol)
- `skills/RESOLVER.md`
- `workspace/QUALITY-SYSTEM.md`
