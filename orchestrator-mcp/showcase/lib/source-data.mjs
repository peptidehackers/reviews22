import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const showcaseRoot = path.resolve(__dirname, "..");
export const orchestratorRoot = path.resolve(showcaseRoot, "..");
export const workspaceRoot = path.resolve(orchestratorRoot, "..");
export const minimaxRoot = path.join(workspaceRoot, "minimax-mcp");
export const siteDataPath = path.join(showcaseRoot, "site-data.json");
export const orchestratorServerPath = path.join(orchestratorRoot, "server.js");
export const minimaxServerPath = path.join(minimaxRoot, "server.js");

const ORCHESTRATOR_CATEGORIES = {
  orchestrate: "Routing & Execution",
  consensus: "Consensus & Debate",
  vote: "Consensus & Debate",
  cost_report: "Governance & Cost",
  route_explain: "Routing & Execution",
  model_info: "Governance & Cost",
  call_model: "Routing & Execution",
  get_prompt: "Prompting & Contracts",
  mem0_recall: "Memory & Context",
  mem0_store: "Memory & Context",
  multifix_analyze: "Diagnostics & Repair",
  axon_query: "Code Intelligence",
  axon_context: "Code Intelligence",
  axon_impact: "Code Intelligence",
  axon_dead_code: "Code Intelligence",
  squirrel_audit: "Diagnostics & Repair",
  posthog_guide: "Diagnostics & Repair",
  tool_status: "Governance & Cost",
  set_permission_mode: "Security & Permissions",
  get_security_status: "Security & Permissions",
  validate_prompt: "Security & Permissions",
  compress_context: "Memory & Context",
  session_info: "Memory & Context",
  reasoning_loop: "Consensus & Debate"
};

const MINIMAX_CATEGORIES = {
  minimax_chat: "Direct Access",
  minimax_analyze: "Analysis Lane"
};

const TOOL_HIGHLIGHTS = {
  orchestrate: "One entrypoint for routing, fallback, memory recall, and execution.",
  consensus: "Runs a model council when the question deserves more than one mind.",
  route_explain: "Shows exactly how the router would think before any token spend.",
  reasoning_loop: "Turns deep reasoning into an auditable loop instead of a black box.",
  cost_report: "Surfaces spend and token usage so orchestration stays economically honest.",
  validate_prompt: "Applies security policy before risky prompts cross trust boundaries.",
  minimax_chat: "Fast secondary model access for quick triangulation and comparison.",
  minimax_analyze: "A dedicated second-opinion lane for debugging, review, and explanation."
};

const QUICKSTART_RECIPES = [
  {
    id: "triage-route",
    title: "Preflight a task before execution",
    server: "orchestrator-mcp",
    tool: "route_explain",
    intent: "See the inferred task type, primary model, fallback chain, memory mode, and consensus mode without spending execution tokens.",
    args: {
      task: "Investigate why consensus hangs on security-sensitive architecture reviews across multiple files"
    }
  },
  {
    id: "ship-through-router",
    title: "Let the router pick the lane",
    server: "orchestrator-mcp",
    tool: "orchestrate",
    intent: "Hand the problem to the router with an explicit operation mode and optional memory recall.",
    args: {
      task: "Review this authentication patch for privilege escalation risks and propose the safest fix",
      task_type: "security",
      use_memory: true,
      operation: "analyze"
    }
  },
  {
    id: "run-a-council",
    title: "Ask for consensus when stakes are high",
    server: "orchestrator-mcp",
    tool: "consensus",
    intent: "Fan out to multiple models and synthesize disagreement instead of trusting a single answer.",
    args: {
      prompt: "Should we favor direct model calls or routed orchestration for debugging flaky CI failures?",
      task_type: "debug",
      operation: "analyze"
    }
  },
  {
    id: "minimax-second-opinion",
    title: "Pull in MiniMax as a fast contrast model",
    server: "minimax-mcp",
    tool: "minimax_analyze",
    intent: "Use MiniMax as a lightweight alternate lens for debugging or code review.",
    args: {
      analysis_type: "compare",
      content: "Option A: send every task through the router. Option B: allow direct model pinning for low-risk lookups.",
      context: "We want speed without losing observability."
    }
  }
];

const CURATED_SCENARIOS = [
  {
    id: "security-investigation",
    title: "Security investigation",
    prompt: "Investigate an auth bypass vulnerability across multiple services and recommend the safest remediation plan.",
    why: "High risk, cross-file work should trigger a security-first route and a strong consensus posture."
  },
  {
    id: "fast-lookup",
    title: "Fast lookup",
    prompt: "Find files mentioning session_info and list the handlers that return it.",
    why: "A small search should stay cheap, fast, and single-shot."
  },
  {
    id: "architecture-decision",
    title: "Architecture decision",
    prompt: "Design a multi-model orchestration strategy for long-context debugging with fallback, memory recall, and audit trails.",
    why: "This is where the router should prefer deep reasoning and a stronger model chain."
  },
  {
    id: "debug-regression",
    title: "Debug regression",
    prompt: "Debug why session compression causes stale summaries after repeated context truncation.",
    why: "A real bug hunt should pick a deeper lane but keep consensus lighter than a security review."
  }
];

const NARRATIVE_PANELS = [
  {
    title: "Source first",
    body: "The showcase is generated from the MCP servers and configs themselves, so the docs stay anchored to real tool surfaces instead of drifting marketing copy."
  },
  {
    title: "One HTML surface",
    body: "The same static HTML can serve as onboarding page, architecture explainer, live router lab, and printable handoff artifact."
  },
  {
    title: "Verify before claiming",
    body: "Tests fail when server capabilities change without the showcase being rebuilt, which keeps the design layer honest."
  }
];

const CATEGORY_ORDER = [
  "Routing & Execution",
  "Consensus & Debate",
  "Prompting & Contracts",
  "Memory & Context",
  "Code Intelligence",
  "Diagnostics & Repair",
  "Security & Permissions",
  "Governance & Cost",
  "Direct Access",
  "Analysis Lane"
];

function extractToolsArrayLiteral(source, label) {
  const anchor = source.indexOf("tools: [");
  if (anchor === -1) {
    throw new Error(`Unable to find tools array in ${label}`);
  }

  const start = source.indexOf("[", anchor);
  if (start === -1) {
    throw new Error(`Unable to find tools array start in ${label}`);
  }

  let depth = 0;
  let inString = false;
  let stringQuote = null;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === stringQuote) {
        inString = false;
        stringQuote = null;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      inString = true;
      stringQuote = char;
      continue;
    }

    if (char === "[") {
      depth += 1;
      continue;
    }

    if (char === "]") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(`Unable to close tools array in ${label}`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function readMcpToolDefinitions(serverPath, { categories = {}, serverId = "server" } = {}) {
  const source = fs.readFileSync(serverPath, "utf8");
  const literal = extractToolsArrayLiteral(source, serverPath);
  const tools = JSON.parse(JSON.stringify(vm.runInNewContext(literal, {}, { timeout: 1000 })));

  return tools.map((tool) => ({
    ...tool,
    serverId,
    category: categories[tool.name] || "Uncategorized",
    highlight: TOOL_HIGHLIGHTS[tool.name] || tool.description.split(".")[0]
  }));
}

export function readOrchestratorTools() {
  return readMcpToolDefinitions(orchestratorServerPath, {
    categories: ORCHESTRATOR_CATEGORIES,
    serverId: "orchestrator-mcp"
  });
}

export function readMinimaxTools() {
  return readMcpToolDefinitions(minimaxServerPath, {
    categories: MINIMAX_CATEGORIES,
    serverId: "minimax-mcp"
  });
}

export function readRouterConfig() {
  return readJson(path.join(orchestratorRoot, "config", "router.json"));
}

export function readModelsConfig() {
  return readJson(path.join(orchestratorRoot, "config", "models.json"));
}

export function readShowcaseFile() {
  return JSON.parse(fs.readFileSync(siteDataPath, "utf8"));
}

export function getShowcaseSources() {
  return [
    orchestratorServerPath,
    minimaxServerPath,
    path.join(orchestratorRoot, "router.js"),
    path.join(orchestratorRoot, "models.js"),
    path.join(orchestratorRoot, "config", "router.json"),
    path.join(orchestratorRoot, "config", "models.json")
  ];
}

export function computeSourceDigest(paths = getShowcaseSources()) {
  const hash = crypto.createHash("sha256");
  for (const filePath of paths) {
    hash.update(filePath);
    hash.update("\n");
    hash.update(fs.readFileSync(filePath));
    hash.update("\n");
  }
  return hash.digest("hex");
}

export function groupToolsByCategory(tools) {
  const buckets = new Map();
  for (const tool of tools) {
    const key = tool.category;
    if (!buckets.has(key)) {
      buckets.set(key, []);
    }
    buckets.get(key).push(tool);
  }

  return Array.from(buckets.entries())
    .sort((a, b) => {
      const orderA = CATEGORY_ORDER.indexOf(a[0]);
      const orderB = CATEGORY_ORDER.indexOf(b[0]);
      const safeA = orderA === -1 ? Number.MAX_SAFE_INTEGER : orderA;
      const safeB = orderB === -1 ? Number.MAX_SAFE_INTEGER : orderB;
      return safeA - safeB || a[0].localeCompare(b[0]);
    })
    .map(([category, categoryTools]) => ({
      category,
      tools: categoryTools.sort((left, right) => left.name.localeCompare(right.name))
    }));
}

export function summarizeTool(tool) {
  const properties = tool.inputSchema?.properties || {};
  const required = tool.inputSchema?.required || [];

  return {
    name: tool.name,
    serverId: tool.serverId,
    category: tool.category,
    description: tool.description,
    highlight: tool.highlight,
    required,
    optional: Object.keys(properties).filter((key) => !required.includes(key)),
    properties
  };
}

export function getQuickstartRecipes() {
  return QUICKSTART_RECIPES;
}

export function getCuratedScenarios() {
  return CURATED_SCENARIOS;
}

export function getNarrativePanels() {
  return NARRATIVE_PANELS;
}
