#!/usr/bin/env node

/**
 * Multi-LLM Orchestrator MCP Server
 *
 * Provides intelligent routing, fallback chains, consensus building, and cost tracking
 * for multi-model workflows.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { routeTask, explainRouting, classifyTask } from "./router.js";
import {
  executeWithFallback,
  executeSingle,
  callModel,
  setPermissionMode,
  getPermissionMode,
  PERMISSION_MODES,
  validatePrompt,
  getModelTrust,
  TRUST_LEVELS,
  createSession,
  getSession,
  endSession,
  getMetrics,
  onProgress
} from "./fallback.js";
import { getDenialHistory } from "./permissions.js";
import { compressContext, getSessionSummary, COMPRESSION_LAYERS } from "./session.js";
import { buildConsensus, quickVote } from "./consensus.js";
import { getUsageSummary, formatCostReport, estimateCost, resetUsage, getRecentUsage } from "./cost.js";
import { getPrompt, buildPrompt, listPromptTemplates, getPromptComparison } from "./prompts.js";
import {
  listModels,
  listTaskTypes,
  getFallbackChain,
  getModelCost,
  getModelFamily,
  MODEL_COSTS,
  FALLBACK_CHAINS
} from "./models.js";
import {
  searchMemories,
  addMemory,
  getMemories,
  formatMemoriesForContext,
  buildFixMemory,
  isMem0Available
} from "./mem0.js";
import {
  isAxonAvailable,
  axonQuery,
  axonContext,
  axonImpact,
  axonDeadCode,
  axonCypher,
  axonDiff,
  buildSystemMap
} from "./axon.js";
import {
  auditWebsite,
  quickAudit,
  fullAudit,
  formatAuditForAnalysis,
  AUDIT_CATEGORIES
} from "./squirrel.js";

const server = new Server(
  {
    name: "orchestrator-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "orchestrate",
        description:
          "Auto-route a task to the best model with automatic fallback. Analyzes the task, selects the optimal model based on task type, and executes with fallback through the model chain if needed. Optionally includes Mem0 recall for context.",
        inputSchema: {
          type: "object",
          properties: {
            task: {
              type: "string",
              description: "The task description or prompt to execute",
            },
            content: {
              type: "string",
              description: "Optional content to analyze (code, text, etc.)",
            },
            task_type: {
              type: "string",
              enum: ["heavy-reasoning", "fast-search", "code-review", "edge-cases", "long-context", "security", "architecture", "debug", "uncensored"],
              description: "Force a specific task type instead of auto-detecting",
            },
            system: {
              type: "string",
              description: "Optional system prompt",
            },
            max_tokens: {
              type: "number",
              description: "Maximum tokens in response (default: 4096)",
            },
            use_memory: {
              type: "boolean",
              description: "Include Mem0 recall for relevant context (default: false)",
            },
          },
          required: ["task"],
        },
      },
      {
        name: "consensus",
        description:
          "Query multiple models in parallel, detect disagreements, and build consensus. Use for important decisions that benefit from multiple perspectives. Optionally includes Mem0 recall.",
        inputSchema: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "The prompt to send to all models",
            },
            models: {
              type: "array",
              items: {
                type: "string",
                enum: ["minimax", "deepseek", "moonshot", "gemini", "gpt4o", "gpt4omini", "gpt54", "gpt54mini", "qwen", "llama", "venice", "chutes"],
              },
              description: "Models to query (default: auto-selected based on task)",
            },
            task_type: {
              type: "string",
              enum: ["heavy-reasoning", "fast-search", "code-review", "edge-cases", "long-context", "security", "architecture", "debug"],
              description: "Task type to auto-select models if not specified",
            },
            system: {
              type: "string",
              description: "Optional system prompt",
            },
            use_memory: {
              type: "boolean",
              description: "Include Mem0 recall for relevant context (default: false)",
            },
          },
          required: ["prompt"],
        },
      },
      {
        name: "vote",
        description:
          "Quick yes/no vote across multiple models. Returns decision based on majority.",
        inputSchema: {
          type: "object",
          properties: {
            question: {
              type: "string",
              description: "The yes/no question to vote on",
            },
            models: {
              type: "array",
              items: {
                type: "string",
                enum: ["minimax", "deepseek", "moonshot", "gemini", "gpt4o", "gpt4omini"],
              },
              description: "Models to query (default: [minimax, deepseek, gpt4o])",
            },
          },
          required: ["question"],
        },
      },
      {
        name: "cost_report",
        description:
          "Get usage and cost summary for all models in this session. Shows calls, tokens, and costs per model.",
        inputSchema: {
          type: "object",
          properties: {
            format: {
              type: "string",
              enum: ["text", "json"],
              description: "Output format (default: text)",
            },
            reset: {
              type: "boolean",
              description: "Reset usage tracking after generating report",
            },
          },
        },
      },
      {
        name: "route_explain",
        description:
          "Explain how a task would be routed without executing it. Shows task classification, selected model, fallback chain, and reasoning.",
        inputSchema: {
          type: "object",
          properties: {
            task: {
              type: "string",
              description: "The task to analyze routing for",
            },
          },
          required: ["task"],
        },
      },
      {
        name: "model_info",
        description:
          "Get information about available models, costs, and fallback chains.",
        inputSchema: {
          type: "object",
          properties: {
            model: {
              type: "string",
              description: "Specific model to get info about (optional)",
            },
            list_type: {
              type: "string",
              enum: ["models", "costs", "chains", "families"],
              description: "What to list (default: models)",
            },
          },
        },
      },
      {
        name: "call_model",
        description:
          "Directly call a specific model without routing or fallback. Use when you know exactly which model you want.",
        inputSchema: {
          type: "object",
          properties: {
            model: {
              type: "string",
              enum: ["minimax", "deepseek", "moonshot", "gemini", "gpt4o", "gpt4omini", "gpt54", "gpt54mini", "qwen", "llama", "venice", "chutes"],
              description: "Model to call",
            },
            prompt: {
              type: "string",
              description: "The prompt to send",
            },
            system: {
              type: "string",
              description: "Optional system prompt",
            },
            max_tokens: {
              type: "number",
              description: "Maximum tokens in response (default: 4096)",
            },
          },
          required: ["model", "prompt"],
        },
      },
      {
        name: "get_prompt",
        description:
          "Get the appropriate prompt template for a task type and model family. Supports dual-prompt (mechanics vs principles).",
        inputSchema: {
          type: "object",
          properties: {
            task_type: {
              type: "string",
              enum: ["codeReview", "debug", "edgeCases", "security", "architecture"],
              description: "Type of task",
            },
            model: {
              type: "string",
              description: "Model to get prompt for (determines mechanics vs principles)",
            },
            context: {
              type: "string",
              description: "Content to include in the prompt",
            },
            compare: {
              type: "boolean",
              description: "If true, return both mechanics and principles versions for comparison",
            },
          },
          required: ["task_type"],
        },
      },
      {
        name: "mem0_recall",
        description:
          "Search Mem0 for relevant memories before analysis. Use to recall past bugs, fixes, patterns, and learned context.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query (bug type, error message, file name, symptom)",
            },
            limit: {
              type: "number",
              description: "Maximum memories to return (default: 10)",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "mem0_store",
        description:
          "Store a fix pattern or learning to Mem0 for future reference.",
        inputSchema: {
          type: "object",
          properties: {
            content: {
              type: "string",
              description: "The memory content to store (bug type, root cause, fix approach, etc.)",
            },
            bug_type: {
              type: "string",
              description: "Type of bug (optional, for structured storage)",
            },
            root_cause: {
              type: "string",
              description: "Root cause (optional)",
            },
            fix_approach: {
              type: "string",
              description: "How it was fixed (optional)",
            },
            files_affected: {
              type: "array",
              items: { type: "string" },
              description: "Files that were affected (optional)",
            },
          },
          required: ["content"],
        },
      },
      {
        name: "multifix_analyze",
        description:
          "Full multifix workflow: Mem0 recall → Axon system map → Multi-model consensus → Cost report. Use for bug fixing with memory-enhanced analysis.",
        inputSchema: {
          type: "object",
          properties: {
            bug_description: {
              type: "string",
              description: "Description of the bug or issue",
            },
            code_context: {
              type: "string",
              description: "Relevant code, stack traces, or system map",
            },
            entry_points: {
              type: "array",
              items: { type: "string" },
              description: "Symbols/functions to analyze with Axon (optional)",
            },
            models: {
              type: "array",
              items: {
                type: "string",
                enum: ["minimax", "deepseek", "gemini", "gpt4o", "moonshot", "venice"],
              },
              description: "Models to use (default: [minimax, deepseek, gemini])",
            },
            skip_memory: {
              type: "boolean",
              description: "Skip Mem0 recall (default: false)",
            },
            skip_axon: {
              type: "boolean",
              description: "Skip Axon system mapping (default: false)",
            },
          },
          required: ["bug_description"],
        },
      },
      {
        name: "axon_query",
        description:
          "Search the Axon knowledge graph for code symbols, relationships, and patterns.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query (function name, class, pattern)",
            },
            limit: {
              type: "number",
              description: "Maximum results (default: 20)",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "axon_context",
        description:
          "Get 360-degree context for a symbol: callers, callees, dependencies, usages.",
        inputSchema: {
          type: "object",
          properties: {
            symbol: {
              type: "string",
              description: "Symbol to analyze (function, class, variable)",
            },
          },
          required: ["symbol"],
        },
      },
      {
        name: "axon_impact",
        description:
          "Get blast radius analysis: what would be affected if this symbol changes.",
        inputSchema: {
          type: "object",
          properties: {
            symbol: {
              type: "string",
              description: "Symbol to analyze for impact",
            },
          },
          required: ["symbol"],
        },
      },
      {
        name: "axon_dead_code",
        description:
          "Find dead/unused code in the repository.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "squirrel_audit",
        description:
          "Audit a website for SEO, performance, security, accessibility, and 15+ other categories with 230+ rules.",
        inputSchema: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "URL to audit",
            },
            coverage: {
              type: "string",
              enum: ["quick", "surface", "full"],
              description: "Coverage mode: quick (fast), surface (one per pattern), full (comprehensive)",
            },
            max_pages: {
              type: "number",
              description: "Maximum pages to crawl (default: 50)",
            },
          },
          required: ["url"],
        },
      },
      {
        name: "posthog_guide",
        description:
          "Get guidance on using PostHog MCP tools for analytics, experiments, feature flags, and insights.",
        inputSchema: {
          type: "object",
          properties: {
            topic: {
              type: "string",
              enum: ["experiments", "feature-flags", "insights", "events", "surveys", "all"],
              description: "PostHog topic to get guidance on",
            },
          },
        },
      },
      {
        name: "tool_status",
        description:
          "Check availability of all integrated tools (Axon, Squirrel, Mem0, PostHog, models).",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "set_permission_mode",
        description:
          "Set the permission mode for model calls. Modes: default (interactive), plan (read-only), auto (auto-approve safe ops), bypass (skip all checks).",
        inputSchema: {
          type: "object",
          properties: {
            mode: {
              type: "string",
              enum: ["default", "plan", "auto", "bypass"],
              description: "Permission mode to set",
            },
          },
          required: ["mode"],
        },
      },
      {
        name: "get_security_status",
        description:
          "Get current security status: permission mode, trust levels, recent denials, session metrics.",
        inputSchema: {
          type: "object",
          properties: {
            include_denials: {
              type: "boolean",
              description: "Include recent denial history (default: true)",
            },
            include_metrics: {
              type: "boolean",
              description: "Include session metrics (default: true)",
            },
          },
        },
      },
      {
        name: "validate_prompt",
        description:
          "Validate a prompt for security issues without executing. Returns issues found and severity.",
        inputSchema: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "Prompt to validate",
            },
            model: {
              type: "string",
              description: "Model to validate against (affects trust level)",
            },
          },
          required: ["prompt"],
        },
      },
      {
        name: "compress_context",
        description:
          "Compress context using 3-layer compression (snip → semantic → summary) to fit token limits.",
        inputSchema: {
          type: "object",
          properties: {
            text: {
              type: "string",
              description: "Text to compress",
            },
            max_tokens: {
              type: "number",
              description: "Target max tokens (default: 8000)",
            },
            layer: {
              type: "string",
              enum: ["snip", "semantic", "summary"],
              description: "Starting compression layer (default: snip)",
            },
          },
          required: ["text"],
        },
      },
      {
        name: "session_info",
        description:
          "Get current session info including transcript length, model usage, tokens, and costs.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // === ORCHESTRATE ===
    if (name === "orchestrate") {
      const { task, content, task_type, system, max_tokens = 4096, use_memory = false } = args;

      // Route the task
      const route = routeTask(task_type || task);

      // Optional: Mem0 recall
      let memoryContext = "";
      if (use_memory && isMem0Available()) {
        const memoryResult = await searchMemories(task, { limit: 5 });
        if (memoryResult.success && memoryResult.memories.length > 0) {
          memoryContext = `\n\n## Relevant Memories\n${formatMemoriesForContext(memoryResult.memories)}\n`;
        }
      }

      const fullPrompt = content ? `${task}${memoryContext}\n\n${content}` : `${task}${memoryContext}`;

      // Get appropriate prompt template if available
      const taskTypeMapping = {
        "code-review": "codeReview",
        "debug": "debug",
        "edge-cases": "edgeCases",
        "security": "security",
        "architecture": "architecture"
      };

      let finalPrompt = fullPrompt;
      const templateType = taskTypeMapping[route.taskType];
      if (templateType && content) {
        finalPrompt = getPrompt(templateType, route.primaryModel, content);
      }

      // Execute with fallback
      const result = await executeWithFallback(
        finalPrompt,
        route.fallbackChain,
        { system, maxTokens: max_tokens }
      );

      if (!result.success) {
        return {
          content: [{
            type: "text",
            text: `## Orchestration Failed\n\n**Task Type:** ${route.taskType}\n**Chain Attempted:** ${route.fallbackChain.join(" → ")}\n\n**Errors:**\n${result.attempts.map(a => `- ${a.model}: ${a.error}`).join("\n")}`
          }],
          isError: true,
        };
      }

      return {
        content: [{
          type: "text",
          text: `## Orchestrator Result\n\n**Task Type:** ${route.taskType}\n**Model Used:** ${result.model}\n**Fallback Chain:** ${route.fallbackChain.join(" → ")}\n${result.failedModels.length > 0 ? `**Failed Models:** ${result.failedModels.join(", ")}\n` : ""}\n---\n\n${result.result}`
        }],
      };
    }

    // === CONSENSUS ===
    if (name === "consensus") {
      const { prompt, models, task_type, system, use_memory = false } = args;

      // Determine which models to use
      let targetModels = models;

      // Handle string input (parse JSON if needed)
      if (typeof targetModels === "string") {
        try {
          targetModels = JSON.parse(targetModels);
        } catch {
          targetModels = targetModels.split(",").map(m => m.trim());
        }
      }

      if (!targetModels || !Array.isArray(targetModels) || targetModels.length === 0) {
        const route = routeTask(task_type || prompt);
        targetModels = route.consensusModels;
      }

      // Optional: Mem0 recall
      let memorySection = "";
      let finalPrompt = prompt;
      if (use_memory && isMem0Available()) {
        const memoryResult = await searchMemories(prompt, { limit: 5 });
        if (memoryResult.success && memoryResult.memories.length > 0) {
          const memoryContext = formatMemoriesForContext(memoryResult.memories);
          memorySection = `## Mem0 Recall\n\n${memoryContext}\n\n---\n\n`;
          finalPrompt = `${memoryContext}\n\n${prompt}`;
        }
      }

      const result = await buildConsensus(finalPrompt, targetModels, { system });

      if (!result.success) {
        return {
          content: [{
            type: "text",
            text: `## Consensus Failed\n\n${result.error}\n\n${result.errors ? result.errors.map(e => `- ${e.model}: ${e.error}`).join("\n") : ""}`
          }],
          isError: true,
        };
      }

      // Format individual responses
      let responsesText = "";
      for (const resp of result.responses) {
        responsesText += `### ${resp.model.toUpperCase()} (${resp.family})\n\n${resp.response}\n\n---\n\n`;
      }

      return {
        content: [{
          type: "text",
          text: `${memorySection}## Consensus Analysis\n\n${result.summary}\n\n---\n\n## Individual Responses\n\n${responsesText}`
        }],
      };
    }

    // === VOTE ===
    if (name === "vote") {
      const { question, models = ["minimax", "deepseek", "gpt4o"] } = args;

      const result = await quickVote(question, models);

      if (!result.success) {
        return {
          content: [{
            type: "text",
            text: `## Vote Failed\n\n${result.error}`
          }],
          isError: true,
        };
      }

      let votesText = "";
      for (const vote of result.votes) {
        votesText += `- **${vote.model}**: ${vote.vote}\n  ${vote.reasoning}...\n\n`;
      }

      return {
        content: [{
          type: "text",
          text: `## Vote Result\n\n**Decision:** ${result.decision}\n**Confidence:** ${(result.confidence * 100).toFixed(0)}%\n**Tally:** YES: ${result.yesVotes}, NO: ${result.noVotes}\n\n### Individual Votes\n\n${votesText}`
        }],
      };
    }

    // === COST REPORT ===
    if (name === "cost_report") {
      const { format = "text", reset: shouldReset = false } = args;

      if (format === "json") {
        const summary = getUsageSummary();
        const recent = getRecentUsage(10);

        if (shouldReset) {
          resetUsage();
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify({ summary, recent }, null, 2)
          }],
        };
      }

      const report = formatCostReport();

      if (shouldReset) {
        resetUsage();
      }

      return {
        content: [{
          type: "text",
          text: report
        }],
      };
    }

    // === ROUTE EXPLAIN ===
    if (name === "route_explain") {
      const { task } = args;
      const explanation = explainRouting(task);

      return {
        content: [{
          type: "text",
          text: `## Routing Analysis\n\n**Task:** ${explanation.task}\n**Classification:** ${explanation.classification}\n**Selected Model:** ${explanation.selectedModel}\n**Prompt Style:** ${explanation.promptStyle}\n**Parallel Execution:** ${explanation.parallelExecution}\n\n**Fallback Chain:**\n${explanation.fallbackChain.map((m, i) => `${i + 1}. ${m}`).join("\n")}\n\n**Consensus Models:** ${explanation.consensusModels.join(", ")}\n\n**Reasoning:** ${explanation.reasoning}`
        }],
      };
    }

    // === MODEL INFO ===
    if (name === "model_info") {
      const { model, list_type = "models" } = args;

      if (model) {
        const cost = getModelCost(model);
        const family = getModelFamily(model);
        const chains = Object.entries(FALLBACK_CHAINS)
          .filter(([_, chain]) => chain.includes(model))
          .map(([type]) => type);

        return {
          content: [{
            type: "text",
            text: `## Model: ${model}\n\n**Family:** ${family.family}\n**Prompt Style:** ${family.promptStyle}\n**Traits:** ${family.traits.join(", ")}\n\n**Cost (per 1M tokens):**\n- Input: $${cost.input}\n- Output: $${cost.output}\n\n**Provider:** ${cost.provider}\n\n**Used in Fallback Chains:** ${chains.join(", ") || "none"}`
          }],
        };
      }

      switch (list_type) {
        case "models":
          return {
            content: [{
              type: "text",
              text: `## Available Models\n\n${listModels().map(m => {
                const c = MODEL_COSTS[m];
                return `- **${m}**: $${c.input}/$${c.output} (${c.provider})`;
              }).join("\n")}`
            }],
          };

        case "costs":
          return {
            content: [{
              type: "text",
              text: `## Model Costs (per 1M tokens)\n\n| Model | Input | Output | Provider |\n|-------|-------|--------|----------|\n${listModels().map(m => {
                const c = MODEL_COSTS[m];
                return `| ${m} | $${c.input} | $${c.output} | ${c.provider} |`;
              }).join("\n")}`
            }],
          };

        case "chains":
          return {
            content: [{
              type: "text",
              text: `## Fallback Chains\n\n${Object.entries(FALLBACK_CHAINS).map(([type, chain]) =>
                `**${type}:**\n${chain.map((m, i) => `  ${i + 1}. ${m}`).join("\n")}`
              ).join("\n\n")}`
            }],
          };

        case "families":
          return {
            content: [{
              type: "text",
              text: `## Model Families\n\n**Claude-like (mechanics prompts):**\nclaude, deepseek, moonshot, minimax\n\n**GPT-like (principles prompts):**\ngpt4o, gpt4omini\n\n**Speed-tier (fast/cheap):**\nminimax, gemini, gpt4omini`
            }],
          };

        default:
          return {
            content: [{ type: "text", text: "Unknown list type" }],
            isError: true,
          };
      }
    }

    // === CALL MODEL ===
    if (name === "call_model") {
      const { model, prompt, system, max_tokens = 4096 } = args;

      const result = await executeSingle(model, prompt, { system, maxTokens: max_tokens });

      if (!result.success) {
        return {
          content: [{
            type: "text",
            text: `## ${model.toUpperCase()} Failed\n\n${result.error}`
          }],
          isError: true,
        };
      }

      return {
        content: [{
          type: "text",
          text: `## ${model.toUpperCase()} Response\n\n${result.result}`
        }],
      };
    }

    // === GET PROMPT ===
    if (name === "get_prompt") {
      const { task_type, model = "claude", context, compare } = args;

      if (compare) {
        const comparison = getPromptComparison(task_type);
        if (!comparison) {
          return {
            content: [{ type: "text", text: `No template for task type: ${task_type}` }],
            isError: true,
          };
        }

        return {
          content: [{
            type: "text",
            text: `## Prompt Comparison: ${task_type}\n\n### Mechanics (Claude-like) - ${comparison.mechanicsLength} chars\n\n\`\`\`\n${comparison.mechanics}\n\`\`\`\n\n### Principles (GPT-like) - ${comparison.principlesLength} chars\n\n\`\`\`\n${comparison.principles}\n\`\`\``
          }],
        };
      }

      const prompt = getPrompt(task_type, model, context || "");

      return {
        content: [{
          type: "text",
          text: `## Prompt for ${task_type} (${getModelFamily(model).promptStyle} style)\n\n\`\`\`\n${prompt}\n\`\`\``
        }],
      };
    }

    // === MEM0 RECALL ===
    if (name === "mem0_recall") {
      const { query, limit = 10 } = args;

      if (!isMem0Available()) {
        return {
          content: [{
            type: "text",
            text: "## Mem0 Not Configured\n\nMEM0_API_KEY is not set. Add it to Doppler or environment variables."
          }],
          isError: true,
        };
      }

      const result = await searchMemories(query, { limit });

      if (!result.success) {
        return {
          content: [{
            type: "text",
            text: `## Mem0 Recall Failed\n\n${result.error}`
          }],
          isError: true,
        };
      }

      const formatted = formatMemoriesForContext(result.memories);

      return {
        content: [{
          type: "text",
          text: `## Mem0 Recall\n\n**Query:** ${query}\n**Found:** ${result.memories.length} memories\n\n${formatted}`
        }],
      };
    }

    // === MEM0 STORE ===
    if (name === "mem0_store") {
      const { content, bug_type, root_cause, fix_approach, files_affected } = args;

      if (!isMem0Available()) {
        return {
          content: [{
            type: "text",
            text: "## Mem0 Not Configured\n\nMEM0_API_KEY is not set. Add it to Doppler or environment variables."
          }],
          isError: true,
        };
      }

      // Build structured content if metadata provided
      let memoryContent = content;
      if (bug_type || root_cause || fix_approach || files_affected) {
        memoryContent = buildFixMemory({
          bugType: bug_type || "unknown",
          rootCause: root_cause || content,
          fixApproach: fix_approach || "see content",
          filesAffected: files_affected || [],
          edgeCases: [],
          modelFindings: null,
          consensus: null
        });
      }

      const result = await addMemory(memoryContent, {
        metadata: { bug_type, source: "orchestrator" }
      });

      if (!result.success) {
        return {
          content: [{
            type: "text",
            text: `## Mem0 Store Failed\n\n${result.error}`
          }],
          isError: true,
        };
      }

      return {
        content: [{
          type: "text",
          text: `## Memory Stored\n\n**Preview:** ${result.content}\n\n✓ Successfully stored to Mem0`
        }],
      };
    }

    // === MULTIFIX ANALYZE ===
    if (name === "multifix_analyze") {
      const {
        bug_description,
        code_context = "",
        entry_points = [],
        models = ["minimax", "deepseek", "gemini"],
        skip_memory = false,
        skip_axon = false
      } = args;

      const sections = [];

      // Step 1: Mem0 Recall
      let memoryContext = "";
      if (!skip_memory && isMem0Available()) {
        const memoryResult = await searchMemories(bug_description, { limit: 5 });
        if (memoryResult.success && memoryResult.memories.length > 0) {
          memoryContext = formatMemoriesForContext(memoryResult.memories);
          sections.push(`## Mem0 Recall\n\n${memoryContext}`);
        } else {
          sections.push("## Mem0 Recall\n\nNo relevant memories found.");
        }
      } else if (skip_memory) {
        sections.push("## Mem0 Recall\n\nSkipped (--skip-memory)");
      } else {
        sections.push("## Mem0 Recall\n\nMem0 not configured (MEM0_API_KEY missing)");
      }

      // Step 2: Axon System Map
      let axonContext = "";
      if (!skip_axon && isAxonAvailable() && entry_points.length > 0) {
        const systemMap = await buildSystemMap(entry_points);
        if (systemMap.success && systemMap.results.length > 0) {
          axonContext = systemMap.results.map(r =>
            `### ${r.symbol}\n${r.context || r.impact || "No data"}`
          ).join("\n\n");
          sections.push(`## Axon System Map\n\n${axonContext}`);
        } else {
          sections.push("## Axon System Map\n\nNo results for entry points.");
        }
      } else if (skip_axon) {
        sections.push("## Axon System Map\n\nSkipped (--skip-axon)");
      } else if (!isAxonAvailable()) {
        sections.push("## Axon System Map\n\nAxon not available");
      } else {
        sections.push("## Axon System Map\n\nNo entry points provided. Use `entry_points` parameter.");
      }

      // Step 3: Build analysis prompt
      const analysisPrompt = `Analyze this bug for root cause, edge cases, and potential fixes.

${memoryContext ? `## Relevant Past Fixes\n${memoryContext}\n` : ""}

${axonContext ? `## System Map (from Axon)\n${axonContext}\n` : ""}

## Bug Description
${bug_description}

${code_context ? `## Code Context\n${code_context}` : ""}

Provide:
1. Likely root cause
2. Edge cases to consider
3. Potential fix approach
4. Risks of the fix`;

      // Step 4: Multi-model consensus
      const consensusResult = await buildConsensus(analysisPrompt, models, {
        system: "You are an expert debugger. Be specific and actionable."
      });

      if (!consensusResult.success) {
        sections.push(`## Multi-Model Analysis\n\n**Error:** ${consensusResult.error}`);
      } else {
        sections.push(`## Multi-Model Analysis\n\n${consensusResult.summary}`);

        // Individual responses
        sections.push("## Individual Model Findings\n");
        for (const resp of consensusResult.responses) {
          sections.push(`### ${resp.model.toUpperCase()}\n\n${resp.response}\n`);
        }
      }

      // Step 5: Cost report
      const costReport = formatCostReport();
      sections.push(`## Cost Report\n\n${costReport}`);

      return {
        content: [{
          type: "text",
          text: sections.join("\n\n---\n\n")
        }],
      };
    }

    // === AXON QUERY ===
    if (name === "axon_query") {
      const { query, limit = 20 } = args;

      if (!isAxonAvailable()) {
        return {
          content: [{
            type: "text",
            text: "## Axon Not Available\n\nAxon CLI is not installed or not in PATH."
          }],
          isError: true,
        };
      }

      const result = await axonQuery(query, { limit });

      if (!result.success) {
        return {
          content: [{
            type: "text",
            text: `## Axon Query Failed\n\n**Query:** ${query}\n**Error:** ${result.error}`
          }],
          isError: true,
        };
      }

      return {
        content: [{
          type: "text",
          text: `## Axon Query Results\n\n**Query:** ${query}\n\n${result.results}`
        }],
      };
    }

    // === AXON CONTEXT ===
    if (name === "axon_context") {
      const { symbol } = args;

      if (!isAxonAvailable()) {
        return {
          content: [{
            type: "text",
            text: "## Axon Not Available\n\nAxon CLI is not installed or not in PATH."
          }],
          isError: true,
        };
      }

      const result = await axonContext(symbol);

      if (!result.success) {
        return {
          content: [{
            type: "text",
            text: `## Axon Context Failed\n\n**Symbol:** ${symbol}\n**Error:** ${result.error}`
          }],
          isError: true,
        };
      }

      return {
        content: [{
          type: "text",
          text: `## Axon Context: ${symbol}\n\n${result.context}`
        }],
      };
    }

    // === AXON IMPACT ===
    if (name === "axon_impact") {
      const { symbol } = args;

      if (!isAxonAvailable()) {
        return {
          content: [{
            type: "text",
            text: "## Axon Not Available\n\nAxon CLI is not installed or not in PATH."
          }],
          isError: true,
        };
      }

      const result = await axonImpact(symbol);

      if (!result.success) {
        return {
          content: [{
            type: "text",
            text: `## Axon Impact Failed\n\n**Symbol:** ${symbol}\n**Error:** ${result.error}`
          }],
          isError: true,
        };
      }

      return {
        content: [{
          type: "text",
          text: `## Axon Impact Analysis: ${symbol}\n\n${result.impact}`
        }],
      };
    }

    // === AXON DEAD CODE ===
    if (name === "axon_dead_code") {
      if (!isAxonAvailable()) {
        return {
          content: [{
            type: "text",
            text: "## Axon Not Available\n\nAxon CLI is not installed or not in PATH."
          }],
          isError: true,
        };
      }

      const result = await axonDeadCode();

      if (!result.success) {
        return {
          content: [{
            type: "text",
            text: `## Axon Dead Code Detection Failed\n\n**Error:** ${result.error}`
          }],
          isError: true,
        };
      }

      return {
        content: [{
          type: "text",
          text: `## Dead Code Analysis\n\n${result.deadCode}`
        }],
      };
    }

    // === SQUIRREL AUDIT ===
    if (name === "squirrel_audit") {
      const { url, coverage = "surface", max_pages = 50 } = args;

      const result = await auditWebsite(url, {
        coverage,
        maxPages: max_pages,
        format: "llm"
      });

      if (!result.success) {
        return {
          content: [{
            type: "text",
            text: `## Website Audit Failed\n\n**URL:** ${url}\n**Error:** ${result.error}`
          }],
          isError: true,
        };
      }

      return {
        content: [{
          type: "text",
          text: formatAuditForAnalysis(result)
        }],
      };
    }

    // === POSTHOG GUIDE ===
    if (name === "posthog_guide") {
      const { topic = "all" } = args;

      const guides = {
        experiments: `## PostHog Experiments

**Available MCP Tools:**
- \`mcp__posthog__experiment-get-all\` - List all experiments
- \`mcp__posthog__experiment-create\` - Create new experiment
- \`mcp__posthog__experiment-get\` - Get experiment details
- \`mcp__posthog__experiment-results-get\` - Get experiment results
- \`mcp__posthog__experiment-update\` - Update experiment
- \`mcp__posthog__experiment-delete\` - Delete experiment

**Common Workflows:**
1. List experiments: \`mcp__posthog__experiment-get-all\`
2. Check results: \`mcp__posthog__experiment-results-get id="exp_123"\``,

        "feature-flags": `## PostHog Feature Flags

**Available MCP Tools:**
- \`mcp__posthog__feature-flag-get-all\` - List all flags
- \`mcp__posthog__feature-flag-get-definition\` - Get flag definition
- \`mcp__posthog__create-feature-flag\` - Create new flag
- \`mcp__posthog__update-feature-flag\` - Update flag
- \`mcp__posthog__delete-feature-flag\` - Delete flag

**Common Workflows:**
1. List flags: \`mcp__posthog__feature-flag-get-all\`
2. Check flag status: \`mcp__posthog__feature-flags-status-retrieve\``,

        insights: `## PostHog Insights

**Available MCP Tools:**
- \`mcp__posthog__insights-get-all\` - List all insights
- \`mcp__posthog__insight-get\` - Get insight details
- \`mcp__posthog__insight-create-from-query\` - Create insight
- \`mcp__posthog__insight-query\` - Query insight data
- \`mcp__posthog__query-run\` - Run custom query

**Query Types:**
- Trends: \`mcp__posthog__query-trends\`
- Funnels: \`mcp__posthog__query-funnel\`
- Retention: \`mcp__posthog__query-retention\`
- Paths: \`mcp__posthog__query-paths\``,

        events: `## PostHog Events

**Available MCP Tools:**
- \`mcp__posthog__event-definitions-list\` - List event definitions
- \`mcp__posthog__event-definition-update\` - Update event definition
- \`mcp__posthog__properties-list\` - List event properties

**For custom queries:**
- \`mcp__posthog__query-run\` - Execute HogQL query
- \`mcp__posthog__query-generate-hogql-from-question\` - Generate HogQL from natural language`,

        surveys: `## PostHog Surveys

**Available MCP Tools:**
- \`mcp__posthog__surveys-get-all\` - List all surveys
- \`mcp__posthog__survey-get\` - Get survey details
- \`mcp__posthog__survey-create\` - Create new survey
- \`mcp__posthog__survey-update\` - Update survey
- \`mcp__posthog__survey-stats\` - Get survey statistics
- \`mcp__posthog__survey-delete\` - Delete survey`
      };

      if (topic === "all") {
        return {
          content: [{
            type: "text",
            text: `## PostHog MCP Integration Guide

PostHog tools are available via the \`mcp__posthog__*\` namespace.

**Quick Reference:**
- Project: \`mcp__posthog__projects-get\`
- Organizations: \`mcp__posthog__organizations-get\`
- Switch project: \`mcp__posthog__switch-project\`

${Object.values(guides).join("\n\n---\n\n")}`
          }],
        };
      }

      const guide = guides[topic];
      if (!guide) {
        return {
          content: [{
            type: "text",
            text: `Unknown topic: ${topic}. Available: experiments, feature-flags, insights, events, surveys, all`
          }],
          isError: true,
        };
      }

      return {
        content: [{
          type: "text",
          text: guide
        }],
      };
    }

    // === TOOL STATUS ===
    if (name === "tool_status") {
      const status = {
        axon: isAxonAvailable() ? "✓ Available" : "✗ Not installed",
        mem0: isMem0Available() ? "✓ Configured" : "✗ MEM0_API_KEY missing",
        squirrel: "✓ Available (checked at runtime)",
        posthog: "✓ Available via mcp__posthog__*",
        models: listModels().join(", ")
      };

      return {
        content: [{
          type: "text",
          text: `## Tool Status

| Tool | Status |
|------|--------|
| **Axon** | ${status.axon} |
| **Mem0** | ${status.mem0} |
| **Squirrel** | ${status.squirrel} |
| **PostHog** | ${status.posthog} |

**Available Models:** ${status.models}`
        }],
      };
    }

    // === SET PERMISSION MODE ===
    if (name === "set_permission_mode") {
      const { mode } = args;

      const result = setPermissionMode(mode);

      return {
        content: [{
          type: "text",
          text: `## Permission Mode Updated

**Mode:** ${result.mode}
**Timestamp:** ${result.timestamp}

| Mode | Behavior |
|------|----------|
| **default** | Interactive - ask before destructive ops |
| **plan** | Research only - no writes/edits/execution |
| **auto** | Auto-approve safe operations |
| **bypass** | Full trust - skip all checks (dangerous) |`
        }],
      };
    }

    // === GET SECURITY STATUS ===
    if (name === "get_security_status") {
      const { include_denials = true, include_metrics = true } = args;

      const mode = getPermissionMode();
      const session = getSessionSummary();

      let output = `## Security Status

**Permission Mode:** ${mode}

### Model Trust Levels
| Level | Models |
|-------|--------|
| **HIGH** | claude, claude-haiku, gpt4o |
| **MEDIUM** | deepseek, gemini, moonshot, minimax, qwen |
| **LOW** | llama, venice, chutes |
`;

      if (include_denials) {
        const denials = getDenialHistory(5);
        if (denials.length > 0) {
          output += `\n### Recent Denials (${denials.length})\n`;
          for (const d of denials) {
            output += `- **${d.model}** (${d.mode}): ${d.reason.substring(0, 60)}...\n`;
          }
        } else {
          output += `\n### Recent Denials\nNo denials recorded.\n`;
        }
      }

      if (include_metrics) {
        output += `\n### Session Metrics
- **Total Calls:** ${session.totalCalls}
- **Total Tokens:** ${session.totalTokens.input} in / ${session.totalTokens.output} out
- **Errors:** ${session.errors}
- **Duration:** ${Math.round(session.duration / 1000)}s
`;
      }

      return {
        content: [{ type: "text", text: output }],
      };
    }

    // === VALIDATE PROMPT ===
    if (name === "validate_prompt") {
      const { prompt, model = "unknown" } = args;

      const result = validatePrompt(prompt, { model });

      let output = `## Prompt Validation

**Valid:** ${result.valid ? "✅ Yes" : "❌ No"}
**Trust Level:** ${result.trustLevel}
**Reason:** ${result.reason}
`;

      if (result.issues && result.issues.length > 0) {
        output += `\n### Issues Found (${result.issues.length})\n`;
        for (const issue of result.issues) {
          const icon = issue.severity === "critical" ? "🔴" : "🟡";
          output += `${icon} **${issue.category}**: \`${issue.pattern}\` (${issue.severity})\n`;
        }
      }

      return {
        content: [{ type: "text", text: output }],
      };
    }

    // === COMPRESS CONTEXT ===
    if (name === "compress_context") {
      const { text, max_tokens = 8000, layer = "snip" } = args;

      const result = compressContext(text, { maxTokens: max_tokens, layer });

      let output = `## Context Compression

**Compressed:** ${result.compressed ? "Yes" : "No (already fits)"}
**Original Tokens:** ~${result.originalTokens}
**Final Tokens:** ~${result.finalTokens}
**Compression Layer:** ${result.layer || "none"}
**Reduction:** ${result.compressed ? Math.round((1 - result.finalTokens / result.originalTokens) * 100) : 0}%
`;

      if (result.compressed) {
        output += `\n### Compressed Output\n\`\`\`\n${result.text.substring(0, 500)}${result.text.length > 500 ? "..." : ""}\n\`\`\``;
      }

      return {
        content: [{ type: "text", text: output }],
      };
    }

    // === SESSION INFO ===
    if (name === "session_info") {
      const session = getSessionSummary();

      let modelUsage = "";
      for (const [model, count] of Object.entries(session.modelUsage)) {
        modelUsage += `| ${model} | ${count} |\n`;
      }

      const output = `## Session Info

**Session ID:** ${session.id}
**Duration:** ${Math.round(session.duration / 1000)}s

### Usage
| Metric | Value |
|--------|-------|
| Total Calls | ${session.totalCalls} |
| Input Tokens | ${session.totalTokens.input} |
| Output Tokens | ${session.totalTokens.output} |
| Errors | ${session.errors} |
| Denials | ${session.denials} |
| Transcript Entries | ${session.transcriptLength} |

### Model Usage
| Model | Calls |
|-------|-------|
${modelUsage || "| (none) | 0 |"}`;

      return {
        content: [{ type: "text", text: output }],
      };
    }

    // Unknown tool
    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };

  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Orchestrator error: ${error.message}\n\nStack: ${error.stack}`
      }],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Orchestrator MCP server running");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
