/**
 * Model Registry - Definitions for all available models, their families, costs, and fallback chains
 */

import { TRUST_LEVELS, MODEL_TRUST, getModelTrust } from "./security.js";

// Re-export trust levels for convenience
export { TRUST_LEVELS, MODEL_TRUST, getModelTrust };

// Model family definitions
export const MODEL_FAMILIES = {
  "claude-like": {
    models: ["claude", "deepseek", "moonshot", "minimax"],
    promptStyle: "mechanics",  // detailed checklists, step-by-step procedures
    traits: ["instruction-following", "structured-output"]
  },
  "gpt-like": {
    models: ["gpt4o", "gpt4omini"],
    promptStyle: "principles",  // concise principles, explicit decision criteria
    traits: ["explicit-reasoning", "principle-driven"]
  },
  "speed-tier": {
    models: ["minimax", "gemini", "gpt4omini"],
    traits: ["fast", "cheap", "utility"]
  }
};

// Model costs per 1M tokens
export const MODEL_COSTS = {
  claude: { input: 3.0, output: 15.0, provider: "anthropic" },
  "claude-haiku": { input: 0.25, output: 1.25, provider: "anthropic" },
  gpt4o: { input: 2.5, output: 10.0, provider: "openrouter" },
  gpt4omini: { input: 0.15, output: 0.6, provider: "openrouter" },
  "gpt54": { input: 5.0, output: 15.0, provider: "openrouter" },
  deepseek: { input: 0.14, output: 0.28, provider: "direct" },
  minimax: { input: 0.15, output: 0.6, provider: "mcp" },
  gemini: { input: 0.075, output: 0.3, provider: "direct" },
  moonshot: { input: 0.5, output: 1.5, provider: "direct" },
  qwen: { input: 0.2, output: 0.8, provider: "openrouter" },
  llama: { input: 0.2, output: 0.8, provider: "openrouter" },
  venice: { input: 0.1, output: 0.4, provider: "direct" },
  chutes: { input: 0.14, output: 0.28, provider: "direct" }
};

// Fallback chains by task type
export const FALLBACK_CHAINS = {
  "heavy-reasoning": ["gpt54", "claude", "deepseek", "moonshot", "gpt4o"],
  "fast-search": ["minimax", "gemini", "gpt4omini"],
  "code-review": ["gpt54", "claude", "gemini", "deepseek"],
  "edge-cases": ["minimax", "deepseek", "claude"],
  "long-context": ["moonshot", "claude", "deepseek"],
  "uncensored": ["venice", "deepseek", "claude"],
  "architecture": ["gpt54", "claude", "deepseek", "gpt4o"],
  "security": ["gpt54", "claude", "deepseek", "minimax"],
  "debug": ["gpt54", "claude", "deepseek", "minimax", "gpt4o"]
};

// API endpoints for direct access models
export const API_ENDPOINTS = {
  gemini: {
    url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
    envKey: "GEMINI_API_KEY"
  },
  deepseek: {
    url: "https://api.deepseek.com/chat/completions",
    envKey: "DEEPSEEK_API_KEY"
  },
  moonshot: {
    url: "https://api.moonshot.ai/v1/chat/completions",
    envKey: "MOONSHOT_API_KEY"
  },
  chutes: {
    url: "https://llm.chutes.ai/v1/chat/completions",
    envKey: "CHUTES_API_KEY"
  },
  venice: {
    url: "https://api.venice.ai/api/v1/chat/completions",
    envKey: "VENICE_API_KEY"
  }
};

// OpenRouter model IDs
export const OPENROUTER_MODELS = {
  gemini: "google/gemini-2.5-pro-preview",
  deepseek: "deepseek/deepseek-r1",
  qwen: "qwen/qwen-2.5-coder-32b-instruct",
  llama: "meta-llama/llama-4-maverick",
  gpt4o: "openai/gpt-4o",
  gpt4omini: "openai/gpt-4o-mini",
  "gpt54": "openai/gpt-5.4",
  claude: "anthropic/claude-sonnet-4"
};

/**
 * Get the family for a given model
 */
export function getModelFamily(model) {
  for (const [family, config] of Object.entries(MODEL_FAMILIES)) {
    if (config.models.includes(model)) {
      return { family, ...config };
    }
  }
  return { family: "unknown", promptStyle: "mechanics", traits: [] };
}

/**
 * Get prompt style for a model (mechanics or principles)
 */
export function getPromptStyle(model) {
  return getModelFamily(model).promptStyle;
}

/**
 * Check if model is in speed tier
 */
export function isSpeedTier(model) {
  return MODEL_FAMILIES["speed-tier"].models.includes(model);
}

/**
 * Get fallback chain for a task type
 */
export function getFallbackChain(taskType) {
  return FALLBACK_CHAINS[taskType] || FALLBACK_CHAINS["heavy-reasoning"];
}

/**
 * Get cost for a model
 */
export function getModelCost(model) {
  return MODEL_COSTS[model] || { input: 1.0, output: 2.0, provider: "unknown" };
}

/**
 * Get full model info including trust level
 */
export function getModelInfo(model) {
  const cost = getModelCost(model);
  const family = getModelFamily(model);
  const trust = getModelTrust(model);

  return {
    model,
    ...cost,
    ...family,
    trustLevel: trust
  };
}

/**
 * List all available models
 */
export function listModels() {
  return Object.keys(MODEL_COSTS);
}

/**
 * List all task types
 */
export function listTaskTypes() {
  return Object.keys(FALLBACK_CHAINS);
}
