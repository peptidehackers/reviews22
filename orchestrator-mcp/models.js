/**
 * Model Registry - Definitions for all available models, their families, costs, and fallback chains
 */

import { TRUST_LEVELS, MODEL_TRUST, getModelTrust } from "./security.js";

// Re-export trust levels for convenience
export { TRUST_LEVELS, MODEL_TRUST, getModelTrust };

// Model family definitions
export const MODEL_FAMILIES = {
  "claude-like": {
    models: ["claude", "claude45", "claude-haiku", "deepseek", "moonshot", "minimax"],
    promptStyle: "mechanics",  // detailed checklists, step-by-step procedures
    traits: ["instruction-following", "structured-output"]
  },
  "gpt-like": {
    models: ["gpt4o", "gpt4omini", "gpt51", "gpt54", "gpt54mini", "gemini", "gemini3pro", "grok4"],
    promptStyle: "principles",  // concise principles, explicit decision criteria
    traits: ["explicit-reasoning", "principle-driven"]
  },
  "speed-tier": {
    models: ["minimax", "gemini", "gpt4omini"],
    promptStyle: "principles",
    traits: ["fast", "cheap", "utility"]
  },
  frontier: {
    models: ["claude", "claude45", "gpt51", "gpt54", "gpt4o", "gemini3pro", "grok4"],
    promptStyle: "principles",
    traits: ["strong-reasoning", "high-trust"]
  },
  uncensored: {
    models: ["venice", "chutes"],
    promptStyle: "mechanics",
    traits: ["raw-analysis", "lower-guardrails"]
  }
};

// Model costs per 1M tokens
export const MODEL_COSTS = {
  claude: { input: 3.0, output: 15.0, provider: "native-claude" },
  claude45: { input: 3.0, output: 15.0, provider: "native-claude" },
  "claude-haiku": { input: 0.25, output: 1.25, provider: "native-claude" },
  gpt4o: { input: 2.5, output: 10.0, provider: "openrouter" },
  gpt4omini: { input: 0.15, output: 0.6, provider: "openrouter" },
  gpt51: { input: 2.5, output: 10.0, provider: "openrouter" },
  "gpt54": { input: 5.0, output: 15.0, provider: "codex" },
  "gpt54mini": { input: 1.0, output: 3.0, provider: "codex" },
  deepseek: { input: 0.14, output: 0.28, provider: "direct" },
  minimax: { input: 0.15, output: 0.6, provider: "mcp" },
  gemini: { input: 0.075, output: 0.3, provider: "direct" },
  gemini3pro: { input: 1.25, output: 5.0, provider: "openrouter" },
  grok4: { input: 3.0, output: 15.0, provider: "openrouter" },
  moonshot: { input: 0.5, output: 1.5, provider: "direct" },
  qwen: { input: 0.2, output: 0.8, provider: "openrouter" },
  llama: { input: 0.2, output: 0.8, provider: "openrouter" },
  venice: { input: 0.1, output: 0.4, provider: "direct" },
  chutes: { input: 0.14, output: 0.28, provider: "direct" }
};

export const MODEL_CAPABILITIES = {
  claude: {
    reasoning: "high",
    latency: "medium",
    context: "high",
    structuredOutputs: "high",
    toolDiscipline: "high",
    securityTrust: TRUST_LEVELS.HIGH
  },
  claude45: {
    reasoning: "frontier",
    latency: "medium",
    context: "high",
    structuredOutputs: "high",
    toolDiscipline: "high",
    securityTrust: TRUST_LEVELS.HIGH
  },
  "claude-haiku": {
    reasoning: "medium",
    latency: "fast",
    context: "medium",
    structuredOutputs: "medium",
    toolDiscipline: "high",
    securityTrust: TRUST_LEVELS.HIGH
  },
  gpt4o: {
    reasoning: "high",
    latency: "medium",
    context: "high",
    structuredOutputs: "high",
    toolDiscipline: "high",
    securityTrust: TRUST_LEVELS.HIGH
  },
  gpt4omini: {
    reasoning: "medium",
    latency: "fast",
    context: "medium",
    structuredOutputs: "high",
    toolDiscipline: "medium",
    securityTrust: TRUST_LEVELS.HIGH
  },
  gpt51: {
    reasoning: "frontier",
    latency: "medium",
    context: "high",
    structuredOutputs: "high",
    toolDiscipline: "high",
    securityTrust: TRUST_LEVELS.HIGH
  },
  gpt54: {
    reasoning: "frontier",
    latency: "medium",
    context: "high",
    structuredOutputs: "high",
    toolDiscipline: "high",
    securityTrust: TRUST_LEVELS.HIGH
  },
  gpt54mini: {
    reasoning: "high",
    latency: "fast",
    context: "medium",
    structuredOutputs: "high",
    toolDiscipline: "high",
    securityTrust: TRUST_LEVELS.HIGH
  },
  deepseek: {
    reasoning: "high",
    latency: "medium",
    context: "high",
    structuredOutputs: "medium",
    toolDiscipline: "medium",
    securityTrust: TRUST_LEVELS.MEDIUM
  },
  minimax: {
    reasoning: "medium",
    latency: "fast",
    context: "medium",
    structuredOutputs: "medium",
    toolDiscipline: "medium",
    securityTrust: TRUST_LEVELS.MEDIUM
  },
  gemini: {
    reasoning: "high",
    latency: "fast",
    context: "high",
    structuredOutputs: "high",
    toolDiscipline: "medium",
    securityTrust: TRUST_LEVELS.MEDIUM
  },
  gemini3pro: {
    reasoning: "frontier",
    latency: "medium",
    context: "frontier",
    structuredOutputs: "high",
    toolDiscipline: "medium",
    securityTrust: TRUST_LEVELS.MEDIUM
  },
  grok4: {
    reasoning: "high",
    latency: "medium",
    context: "high",
    structuredOutputs: "medium",
    toolDiscipline: "medium",
    securityTrust: TRUST_LEVELS.MEDIUM
  },
  moonshot: {
    reasoning: "medium",
    latency: "medium",
    context: "frontier",
    structuredOutputs: "medium",
    toolDiscipline: "medium",
    securityTrust: TRUST_LEVELS.MEDIUM
  },
  qwen: {
    reasoning: "medium",
    latency: "medium",
    context: "medium",
    structuredOutputs: "medium",
    toolDiscipline: "medium",
    securityTrust: TRUST_LEVELS.MEDIUM
  },
  llama: {
    reasoning: "medium",
    latency: "medium",
    context: "medium",
    structuredOutputs: "low",
    toolDiscipline: "low",
    securityTrust: TRUST_LEVELS.LOW
  },
  venice: {
    reasoning: "medium",
    latency: "medium",
    context: "medium",
    structuredOutputs: "medium",
    toolDiscipline: "medium",
    securityTrust: TRUST_LEVELS.MEDIUM
  },
  chutes: {
    reasoning: "medium",
    latency: "medium",
    context: "medium",
    structuredOutputs: "medium",
    toolDiscipline: "medium",
    securityTrust: TRUST_LEVELS.MEDIUM
  }
};

// Fallback chains by task type
export const FALLBACK_CHAINS = {
  "heavy-reasoning": ["gpt54", "claude45", "gpt51", "grok4", "gemini3pro", "deepseek", "moonshot", "gpt4o"],
  "fast-search": ["minimax", "gemini", "gpt4omini"],
  "code-review": ["gpt54", "claude45", "gpt51", "gemini3pro", "deepseek"],
  "edge-cases": ["minimax", "deepseek", "claude45", "grok4"],
  "long-context": ["moonshot", "gemini3pro", "claude45", "deepseek"],
  "uncensored": ["venice", "deepseek", "claude45"],
  "architecture": ["gpt54", "claude45", "gpt51", "gemini3pro", "deepseek", "gpt4o"],
  "security": ["gpt54", "claude45", "gpt51", "deepseek", "minimax"],
  "debug": ["gpt54", "claude45", "gpt51", "deepseek", "minimax", "gpt4o"]
};

// Karpathy's LLM Council default lineup, adapted to local/native surfaces where available.
export const LLM_COUNCIL_MODELS = ["gpt51", "gemini3pro", "claude45", "grok4"];
export const LLM_COUNCIL_CHAIRMAN = "gemini3pro";

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
  gemini3pro: "google/gemini-3-pro-preview",
  deepseek: "deepseek/deepseek-r1",
  qwen: "qwen/qwen-2.5-coder-32b-instruct",
  llama: "meta-llama/llama-4-maverick",
  gpt4o: "openai/gpt-4o",
  gpt4omini: "openai/gpt-4o-mini",
  gpt51: "openai/gpt-5.1",
  "gpt54": "openai/gpt-5.4",
  grok4: "x-ai/grok-4",
  claude: "anthropic/claude-sonnet-4",
  claude45: "anthropic/claude-sonnet-4.5"
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
  const capabilities = getModelCapabilities(model);

  return {
    model,
    ...cost,
    ...family,
    capabilities,
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
