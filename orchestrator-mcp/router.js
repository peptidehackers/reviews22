/**
 * Task Router - Multi-axis task analysis for routing, memory, and consensus decisions.
 */

import { compileRegexList, loadConfig } from "./config-loader.js";
import {
  FALLBACK_CHAINS,
  LLM_COUNCIL_MODELS,
  getModelCapabilities,
  getModelFamily,
  isSpeedTier
} from "./models.js";

const config = loadConfig("router.json");

function compilePatternGroups(groups) {
  return Object.fromEntries(
    Object.entries(groups).map(([key, patterns]) => [key, compileRegexList(patterns)])
  );
}

const INTENT_PATTERNS = compilePatternGroups(config.intentPatterns);
const RISK_PATTERNS = compilePatternGroups(config.riskPatterns);
const SCOPE_PATTERNS = compilePatternGroups(config.scopePatterns);
const DEPTH_PATTERNS = compilePatternGroups(config.depthPatterns);
const MEMORY_PATTERNS = compilePatternGroups(config.memoryPatterns);
const PRIMARY_MODELS = config.primaryModels;
const PARALLEL_TASKS = config.parallelTasks;

function matchesAny(task, patterns = []) {
  return patterns.some((pattern) => pattern.test(task));
}

function scoreIntent(task, intent) {
  return (INTENT_PATTERNS[intent] || []).reduce(
    (score, pattern) => score + (pattern.test(task) ? 1 : 0),
    0
  );
}

export function inferIntent(task) {
  const scored = Object.keys(INTENT_PATTERNS).map((intent) => ({
    intent,
    score: scoreIntent(task, intent)
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.score > 0 ? scored[0].intent : "implement";
}

export function inferRisk(task, intent = inferIntent(task)) {
  if (matchesAny(task, RISK_PATTERNS.high) || intent === "security") {
    return "high";
  }

  if (matchesAny(task, RISK_PATTERNS.medium) || ["debug", "architecture", "review"].includes(intent)) {
    return "medium";
  }

  return "low";
}

export function inferScope(task) {
  if (matchesAny(task, SCOPE_PATTERNS.project)) {
    return "project-wide";
  }

  if (matchesAny(task, SCOPE_PATTERNS.single)) {
    return "single-file";
  }

  return "cross-file";
}

export function inferSpeedDepth(task, intent, risk) {
  if (matchesAny(task, DEPTH_PATTERNS.fast) && risk === "low" && intent === "search") {
    return "fast";
  }

  if (matchesAny(task, DEPTH_PATTERNS.deep) || risk === "high" || ["architecture", "security"].includes(intent)) {
    return "deep";
  }

  return "balanced";
}

export function inferActionMode(task, intent) {
  if (matchesAny(task, [/implement|fix|write|change|update|modify/i]) || intent === "implement") {
    return "execute";
  }

  if (intent === "search") {
    return "answer";
  }

  return "analyze";
}

export function inferMemoryMode(task, intent, scope) {
  if (intent === "search" || matchesAny(task, MEMORY_PATTERNS.exact)) {
    return "exact";
  }

  if (intent === "architecture") {
    return "semantic";
  }

  if (["debug", "security", "review"].includes(intent) || scope === "project-wide") {
    return "hybrid";
  }

  return "none";
}

export function inferConsensusMode(task, intent, risk) {
  if (risk === "high" || ["architecture", "security"].includes(intent)) {
    return "strong";
  }

  if (["review", "debug"].includes(intent) || matchesAny(task, MEMORY_PATTERNS.lightConsensus)) {
    return "light";
  }

  return "off";
}

function deriveTaskType(profile) {
  const { intent, risk, scope } = profile;

  if (intent === "search") {
    return scope === "project-wide" ? "long-context" : "fast-search";
  }

  if (intent === "review") {
    return "code-review";
  }

  if (intent === "security" || (risk === "high" && /auth|vuln|security|pii/i.test(profile.task))) {
    return "security";
  }

  if (intent === "architecture") {
    return "architecture";
  }

  if (intent === "debug") {
    return scope === "project-wide" ? "long-context" : "debug";
  }

  return "heavy-reasoning";
}

export function classifyTask(task) {
  return routeTask(task).taskType;
}

export function selectPrimary(taskType, profile = null) {
  if (profile?.speedDepth === "fast") {
    return PRIMARY_MODELS["fast-search"] || "minimax";
  }

  if (profile?.risk === "high" && ["security", "architecture"].includes(taskType)) {
    return PRIMARY_MODELS[taskType] || "gpt54";
  }

  return PRIMARY_MODELS[taskType] || "venice";
}

function diversifyConsensusModels(chain) {
  const selected = [];
  const seenFamilies = new Set();

  for (const model of chain) {
    const family = getModelFamily(model).family;
    if (!seenFamilies.has(family) || selected.length < 2) {
      selected.push(model);
      seenFamilies.add(family);
    }
    if (selected.length >= 3) {
      break;
    }
  }

  return selected.length > 0 ? selected : chain.slice(0, 3);
}

export function getConsensusModels(taskType, profile = null) {
  const chain = FALLBACK_CHAINS[taskType] || FALLBACK_CHAINS["heavy-reasoning"];
  const diversified = diversifyConsensusModels(chain);

  if (profile?.consensusMode === "strong") {
    return [...LLM_COUNCIL_MODELS];
  }

  if (profile?.consensusMode === "light") {
    return diversified.slice(0, 2);
  }

  return diversified.slice(0, 1);
}

export function shouldUseParallel(taskType, profile = null) {
  if (profile?.consensusMode && profile.consensusMode !== "off") {
    return true;
  }

  return PARALLEL_TASKS.includes(taskType);
}

function prioritizePrimaryModel(chain = [], primaryModel) {
  if (!primaryModel) {
    return [...chain];
  }

  return [primaryModel, ...chain.filter((model) => model !== primaryModel)];
}

function generateRoutingReasoning(profile, route) {
  const reasons = [];

  reasons.push(`Intent inferred as ${profile.intent}`);
  reasons.push(`Risk=${profile.risk}, scope=${profile.scope}, depth=${profile.speedDepth}`);

  if (route.memoryMode !== "none") {
    reasons.push(`Memory mode ${route.memoryMode} selected for ${profile.intent} workflow`);
  }

  if (route.consensusMode !== "off") {
    reasons.push(`Consensus mode ${route.consensusMode} enabled`);
  }

  const capabilities = getModelCapabilities(route.primaryModel);
  reasons.push(
    `Primary model ${route.primaryModel} chosen for reasoning=${capabilities.reasoning}, structuredOutputs=${capabilities.structuredOutputs}, latency=${capabilities.latency}`
  );

  if (isSpeedTier(route.primaryModel)) {
    reasons.push("Primary model is in the speed tier");
  }

  return reasons;
}

export function routeTask(task) {
  const intent = inferIntent(task);
  const risk = inferRisk(task, intent);
  const scope = inferScope(task);
  const speedDepth = inferSpeedDepth(task, intent, risk);
  const actionMode = inferActionMode(task, intent);

  const profile = {
    task,
    intent,
    risk,
    scope,
    speedDepth,
    actionMode
  };

  profile.memoryMode = inferMemoryMode(task, profile.intent, profile.scope);
  profile.consensusMode = inferConsensusMode(task, profile.intent, profile.risk);

  const taskType = deriveTaskType(profile);
  const primaryModel = selectPrimary(taskType, profile);
  const fallbackChain = prioritizePrimaryModel(
    FALLBACK_CHAINS[taskType] || FALLBACK_CHAINS["heavy-reasoning"],
    primaryModel
  );
  const consensusModels = getConsensusModels(taskType, profile);
  const useParallel = shouldUseParallel(taskType, profile);

  const route = {
    routeVersion: 3,
    taskType,
    primaryModel,
    fallbackChain,
    useParallel,
    promptStyle: getModelFamily(primaryModel).promptStyle,
    consensusModels,
    isSpeedTask: isSpeedTier(primaryModel),
    intent: profile.intent,
    risk: profile.risk,
    scope: profile.scope,
    speedDepth: profile.speedDepth,
    memoryMode: profile.memoryMode,
    consensusMode: profile.consensusMode,
    actionMode: profile.actionMode
  };

  return {
    ...route,
    reasoning: generateRoutingReasoning(profile, route).join(". ")
  };
}

export function explainRouting(task) {
  const route = routeTask(task);

  return {
    task: task.substring(0, 100) + (task.length > 100 ? "..." : ""),
    classification: route.taskType,
    selectedModel: route.primaryModel,
    fallbackChain: route.fallbackChain,
    parallelExecution: route.useParallel,
    promptStyle: route.promptStyle,
    consensusModels: route.consensusModels,
    reasoning: route.reasoning,
    routeVersion: route.routeVersion,
    intent: route.intent,
    risk: route.risk,
    scope: route.scope,
    speedDepth: route.speedDepth,
    memoryMode: route.memoryMode,
    consensusMode: route.consensusMode,
    actionMode: route.actionMode
  };
}
