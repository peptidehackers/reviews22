import { routeTask } from "../../router.js";
import { getModelFamily } from "../../models.js";
import {
  computeSourceDigest,
  getCuratedScenarios,
  getNarrativePanels,
  getQuickstartRecipes,
  groupToolsByCategory,
  readMinimaxTools,
  readModelsConfig,
  readOrchestratorTools,
  readRouterConfig,
  summarizeTool
} from "./source-data.mjs";

const LEVEL_SCORE = {
  low: 1,
  medium: 2,
  high: 3,
  frontier: 4,
  fast: 4
};

function summarizeModels(modelsConfig) {
  return Object.entries(modelsConfig.costs)
    .map(([model, cost]) => {
      const capabilities = modelsConfig.capabilities[model] || {};
      const familyInfo = getModelFamily(model);
      return {
        name: model,
        provider: cost.provider,
        inputCost: cost.input,
        outputCost: cost.output,
        reasoning: capabilities.reasoning || "medium",
        latency: capabilities.latency || "medium",
        context: capabilities.context || "medium",
        structuredOutputs: capabilities.structuredOutputs || "medium",
        toolDiscipline: capabilities.toolDiscipline || "medium",
        securityTrust: capabilities.securityTrust || "medium",
        family: familyInfo.family,
        promptStyle: familyInfo.promptStyle,
        familyTraits: familyInfo.traits || []
      };
    })
    .sort((left, right) => left.inputCost - right.inputCost || left.name.localeCompare(right.name));
}

function pickLeader(models, selector) {
  return models.reduce((best, current) => {
    if (!best) {
      return current;
    }
    return selector(current, best) ? current : best;
  }, null);
}

function buildModelLeaders(models, modelsConfig) {
  const cheapestInput = pickLeader(models, (current, best) => current.inputCost < best.inputCost);
  const cheapestOutput = pickLeader(models, (current, best) => current.outputCost < best.outputCost);
  const fastest = pickLeader(models, (current, best) => (LEVEL_SCORE[current.latency] || 0) > (LEVEL_SCORE[best.latency] || 0));
  const deepest = pickLeader(models, (current, best) => (LEVEL_SCORE[current.reasoning] || 0) > (LEVEL_SCORE[best.reasoning] || 0));
  const biggestContext = pickLeader(models, (current, best) => (LEVEL_SCORE[current.context] || 0) > (LEVEL_SCORE[best.context] || 0));

  return {
    cheapestInput: { model: cheapestInput.name, cost: cheapestInput.inputCost },
    cheapestOutput: { model: cheapestOutput.name, cost: cheapestOutput.outputCost },
    fastestLane: { model: fastest.name, latency: fastest.latency },
    deepestReasoning: { model: deepest.name, reasoning: deepest.reasoning },
    largestContext: { model: biggestContext.name, context: biggestContext.context },
    llmCouncilChairman: modelsConfig.llmCouncil.chairman,
    llmCouncilSize: modelsConfig.llmCouncil.models.length
  };
}

function buildFallbackStories(modelsConfig) {
  return Object.entries(modelsConfig.fallbackChains)
    .map(([taskType, chain]) => ({
      taskType,
      primary: chain[0],
      backups: chain.slice(1),
      chain,
      speedBias: chain.slice(0, 2).some((model) => modelsConfig.families["speed-tier"].models.includes(model))
    }))
    .sort((left, right) => left.taskType.localeCompare(right.taskType));
}

function buildScenarioRoutes() {
  return getCuratedScenarios().map((scenario) => {
    const route = routeTask(scenario.prompt);
    return {
      ...scenario,
      route
    };
  });
}

function buildToolSpotlights(toolGroups) {
  return toolGroups
    .flatMap((group) => group.tools)
    .filter((tool) => ["orchestrate", "consensus", "route_explain", "reasoning_loop", "cost_report", "minimax_analyze"].includes(tool.name))
    .map((tool) => ({
      name: tool.name,
      category: tool.category,
      serverId: tool.serverId,
      highlight: tool.highlight,
      description: tool.description,
      required: tool.required
    }));
}

function buildStats(orchestratorTools, minimaxTools, modelSummaries, scenarioRoutes) {
  const highRiskRoutes = scenarioRoutes.filter((scenario) => scenario.route.risk === "high").length;
  const consensusScenarios = scenarioRoutes.filter((scenario) => scenario.route.consensusMode !== "off").length;

  return [
    { label: "Orchestrator tools", value: orchestratorTools.length, detail: "Parsed directly from server.js" },
    { label: "MiniMax tools", value: minimaxTools.length, detail: "Second-opinion lane included" },
    { label: "Model lanes", value: modelSummaries.length, detail: "Costs, families, and capabilities surfaced" },
    { label: "Consensus-ready scenarios", value: consensusScenarios, detail: `${highRiskRoutes} high-risk examples route into stronger governance` }
  ];
}

export function buildShowcaseData() {
  const orchestratorTools = readOrchestratorTools().map(summarizeTool);
  const minimaxTools = readMinimaxTools().map(summarizeTool);
  const routerConfig = readRouterConfig();
  const modelsConfig = readModelsConfig();
  const modelSummaries = summarizeModels(modelsConfig);
  const toolGroups = [
    ...groupToolsByCategory(orchestratorTools),
    ...groupToolsByCategory(minimaxTools)
  ];
  const scenarioRoutes = buildScenarioRoutes();

  return {
    version: 1,
    sourceDigest: computeSourceDigest(),
    hero: {
      eyebrow: "Huashu-inspired integration for real MCP systems",
      title: "A source-synced design surface for orchestrator-mcp and minimax-mcp",
      summary:
        "This showcase turns the live MCP servers into a polished explainer, router laboratory, and printable artifact — without inventing features that the code does not actually ship.",
      principles: [
        "Source-of-truth generation from server code and configs",
        "Single HTML surface for docs, demo, and handoff",
        "Verification gates that fail when the showcase drifts"
      ]
    },
    stats: buildStats(orchestratorTools, minimaxTools, modelSummaries, scenarioRoutes),
    narrativePanels: getNarrativePanels(),
    quickstartRecipes: getQuickstartRecipes(),
    routerLab: {
      promptPlaceholder: "Paste a task here to see how the router would classify it...",
      routerConfig,
      primaryModels: routerConfig.primaryModels,
      parallelTasks: routerConfig.parallelTasks,
      examples: scenarioRoutes.map(({ id, title, prompt }) => ({ id, title, prompt }))
    },
    scenarioRoutes,
    toolGroups,
    toolSpotlights: buildToolSpotlights(toolGroups),
    models: {
      leaders: buildModelLeaders(modelSummaries, modelsConfig),
      families: modelsConfig.families,
      summaries: modelSummaries,
      fallbackStories: buildFallbackStories(modelsConfig)
    },
    integrationNotes: [
      {
        title: "What this adds to the workspace",
        bullets: [
          "A live router sandbox you can use to explain and debug routing choices before invoking models.",
          "A presentation-grade HTML artifact for demos, onboarding, architecture reviews, and printable handoffs.",
          "A source digest and stale-file tests so the design layer cannot silently drift away from the MCP implementation."
        ]
      },
      {
        title: "How MiniMax fits",
        bullets: [
          "MiniMax remains a distinct fast lane, but the showcase frames it inside the broader orchestration story instead of leaving it as an isolated server.",
          "The recipes and tool cards make the second-opinion workflow visible to operators and contributors."
        ]
      }
    ]
  };
}
