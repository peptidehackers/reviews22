#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
// Using native fetch for MiniMax v1 API (OpenAI-compatible)

const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;
const MINIMAX_MODEL = process.env.MINIMAX_MODEL || "MiniMax-M2.7";

if (!MINIMAX_API_KEY) {
  console.error("Error: MINIMAX_API_KEY environment variable is required");
  process.exit(1);
}

// MiniMax native Anthropic-compatible API (supports thinking)
async function callMiniMax(prompt, system, maxTokens = 4096) {
  const response = await fetch("https://api.minimax.io/anthropic/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": MINIMAX_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: MINIMAX_MODEL,
      max_tokens: maxTokens,
      system: system || "You are a helpful AI assistant.",
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`MiniMax API error: ${response.status} - ${error}`);
  }

  const data = await response.json();

  // Extract thinking and text from MiniMax response
  let thinking = "";
  let text = "";

  for (const block of data.content || []) {
    if (block.type === "thinking") {
      thinking = block.thinking;
    } else if (block.type === "text") {
      text = block.text;
    }
  }

  return {
    thinking,
    text,
    content: text,
    usage: {
      input_tokens: data.usage?.input_tokens || 0,
      output_tokens: data.usage?.output_tokens || 0
    }
  };
}

const server = new Server(
  {
    name: "minimax-mcp",
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
        name: "minimax_chat",
        description:
          "Send a message to MiniMax M2.7 model and get a response. Use this to get a second opinion, compare approaches, or leverage MiniMax's reasoning capabilities alongside Claude.",
        inputSchema: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "The message/prompt to send to MiniMax",
            },
            system: {
              type: "string",
              description: "Optional system prompt to set context",
            },
            max_tokens: {
              type: "number",
              description: "Maximum tokens in response (default: 4096)",
            },
            include_thinking: {
              type: "boolean",
              description: "Whether to include thinking/reasoning in output (default: true)",
            },
          },
          required: ["prompt"],
        },
      },
      {
        name: "minimax_analyze",
        description:
          "Have MiniMax analyze code, text, or problems. Good for getting a different perspective on complex issues.",
        inputSchema: {
          type: "object",
          properties: {
            content: {
              type: "string",
              description: "The content to analyze (code, text, problem description)",
            },
            analysis_type: {
              type: "string",
              enum: ["code_review", "debug", "explain", "improve", "compare", "general"],
              description: "Type of analysis to perform",
            },
            context: {
              type: "string",
              description: "Additional context for the analysis",
            },
          },
          required: ["content", "analysis_type"],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "minimax_chat") {
      const { prompt, system, max_tokens = 4096, include_thinking = true } = args;

      const response = await callMiniMax(
        prompt,
        system || "You are a helpful AI assistant.",
        max_tokens
      );

      let output = "";
      if (include_thinking && response.thinking) {
        output += `**Thinking:**\n${response.thinking}\n\n`;
      }
      output += response.text || "No response from MiniMax";

      return {
        content: [
          {
            type: "text",
            text: output,
          },
        ],
      };
    }

    if (name === "minimax_analyze") {
      const { content, analysis_type, context } = args;

      const analysisPrompts = {
        code_review: `Please review the following code. Identify potential bugs, security issues, performance problems, and suggest improvements:\n\n${content}`,
        debug: `Please help debug the following code or error. Identify the root cause and suggest fixes:\n\n${content}`,
        explain: `Please explain the following code or concept in detail:\n\n${content}`,
        improve: `Please suggest improvements for the following code or approach:\n\n${content}`,
        compare: `Please analyze and compare the following options or approaches:\n\n${content}`,
        general: `Please analyze the following:\n\n${content}`,
      };

      const prompt = analysisPrompts[analysis_type] || analysisPrompts.general;
      const fullPrompt = context ? `${prompt}\n\nAdditional context: ${context}` : prompt;

      const response = await callMiniMax(
        fullPrompt,
        "You are an expert software engineer and analyst. Provide thorough, actionable analysis.",
        8192
      );

      let output = `## MiniMax Analysis (${analysis_type})\n\n`;
      if (response.thinking) {
        output += `### Reasoning\n${response.thinking}\n\n`;
      }
      output += `### Analysis\n${response.text}`;

      return {
        content: [
          {
            type: "text",
            text: output,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `Unknown tool: ${name}`,
        },
      ],
      isError: true,
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `MiniMax API error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MiniMax MCP server running");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
