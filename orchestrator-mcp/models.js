/**
 * Model Registry - Definitions for all available models, their families, costs, capabilities,
 * and fallback chains, loaded from config.
 */

import { loadConfig } from "./config-loader.js";
import { TRUST_LEVELS, MODEL_TRUST, getModelTrust } from "./security.js";

export { TRUST_LEVELS, MODEL_TRUST, getModelTrust };

const config = loadConfig("models.json");

export const MODEL_FAMILIES = config.families;
export const MODEL_COSTS = config.costs;
export const MODEL_CAPABILITIES = config.capabilities;
export const FALLBACK_CHAINS = config.fallbackChains;
export const LLM_COUNCIL_MODELS = config.llmCouncil.models;
export const LLM_COUNCIL_CHAIRMAN = config.llmCouncil.chairman;
export const API_ENDPOINTS = config.apiEndpoints;
export const OPENROUTER_MODELS = config.openrouterModels;

export function getModelFamily(model) {
  for (const [family, familyConfig] of Object.entries(MODEL_FAMILIES)) {
    if (familyConfig.models.includes(model)) {
      return { family, ...familyConfig };
    }
  }

  const inferredPromptStyle = /^gpt|gemini/i.test(model) ? "principles" : "mechanics";
  return { family: "unknown", promptStyle: inferredPromptStyle, traits: [] };
}

export function getPromptStyle(model) {
  return getModelFamily(model).promptStyle;
}

export function isSpeedTier(model) {
  return MODEL_FAMILIES["speed-tier"]?.models.includes(model);
}

export function getFallbackChain(taskType) {
  return FALLBACK_CHAINS[taskType] || FALLBACK_CHAINS["heavy-reasoning"];
}

export function getModelCost(model) {
  return MODEL_COSTS[model] || { input: 1.0, output: 2.0, provider: "unknown" };
}

export function getModelCapabilities(model) {
  return MODEL_CAPABILITIES[model] || {
    reasoning: "medium",
    latency: "medium",
    context: "medium",
    structuredOutputs: "medium",
    toolDiscipline: "medium",
    securityTrust: getModelTrust(model)
  };
}

export function getModelInfo(model) {
  const cost = getModelCost(model);
  const family = getModelFamily(model);
  const trust = getModelTrust(model);
  const capabilities = getModelCapabilities(model);

  return {
    model,
    ...cost,
    ...family,
    capabilities,
    trustLevel: trust
  };
}

export function listModels() {
  return Object.keys(MODEL_COSTS);
}

export function listTaskTypes() {
  return Object.keys(FALLBACK_CHAINS);
}
