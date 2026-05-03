/**
 * @fileoverview Reasoning Loop - Recurrent-Depth Transformer inspired iterative reasoning.
 *
 * Implements concepts from OpenMythos (https://github.com/kyegomez/OpenMythos):
 * - Loop-based reasoning with input injection at each iteration
 * - LTI-stable state management (prevents drift across iterations)
 * - Adaptive Computation Time (ACT) halting when confidence converges
 * - Loop index awareness for differentiated behavior per iteration
 *
 * Architecture:
 *   Input → [Prelude: Initial Analysis] → [Loop × T] → [Coda: Final Synthesis]
 *
 * Each loop iteration:
 *   h_{t+1} = decay * h_t + injection * e + model_response
 *
 * Where:
 *   h_t = accumulated reasoning state
 *   e = original input (injected every iteration to prevent drift)
 *   decay < 1 = LTI stability constraint (spectral radius < 1)
 *
 * @module reasoning-loop
 * @see {@link https://github.com/kyegomez/OpenMythos|OpenMythos}
 * @see {@link https://arxiv.org/abs/2402.13382|Looped Transformers for Length Generalization}
 */

import { callModel } from "./fallback.js";
import { buildConsensus } from "./consensus.js";
import { getModelFamily, LLM_COUNCIL_MODELS } from "./models.js";
import { emitProgress, PROGRESS_EVENTS } from "./session.js";
import { loadConfig } from "./config-loader.js";

// ============================================================================
// Configuration Loading
// ============================================================================

/** @type {Object} Default configuration (used as fallback and for validation) */
const DEFAULT_CONFIG = {
  // Default loop parameters
  defaultMaxLoops: 8,
  defaultMinLoops: 2,

  // ACT halting thresholds
  actThreshold: 0.95,
  convergenceThreshold: 0.05,
  minConfidenceForHalt: 0.7,

  // Plateau detection (claude-code-harness pattern)
  plateauThreshold: 0.03,        // Max confidence delta to trigger plateau
  plateauIterations: 4,          // Min iterations to check for plateau

  // LTI stability parameters (spectral radius < 1 by construction)
  stateDecay: 0.85,
  inputInjection: 0.3,

  // Timeouts (ms)
  iterationTimeout: 60000,
  preludeTimeout: 30000,
  codaTimeout: 45000,

  // Memory limits
  maxStateSize: 50000,
  maxIterationHistory: 20,
  maxClaims: 100,
  maxRisks: 50,
  maxBlockers: 20,

  // Retry configuration
  maxRetries: 2,
  retryDelay: 1000,

  // Depth-based model selection
  depthTiers: {
    shallow: ["minimax", "gpt4omini", "claude-haiku"],
    mid: ["gemini", "deepseek", "gpt4o"],
    deep: ["claude", "claude45", "gpt51", "gpt54"]
  },

  // Loop-specific system prompts
  loopPrompts: {
    0: "You are analyzing a problem. Identify the core issues and initial hypotheses.",
    1: "You are refining analysis. Challenge assumptions and explore edge cases.",
    2: "You are deepening understanding. Look for hidden dependencies and root causes.",
    3: "You are stress-testing conclusions. What could go wrong? What are we missing?",
    4: "You are synthesizing insights. Integrate findings into a coherent solution.",
    5: "You are validating the solution. Check for completeness and correctness.",
    default: "You are in deep reasoning mode. Build on prior analysis with fresh perspective."
  },

  // Complexity signal patterns
  taskComplexitySignals: {
    increase: ["architecture", "design", "security audit", "comprehensive", "thorough",
               "multi-file", "codebase", "system-wide", "all modules", "root cause",
               "deep dive", "investigate fully"],
    decrease: ["quick", "fast", "brief", "simple", "single", "format", "lint", "typo", "rename"]
  },

  // Confidence estimation signals
  confidenceSignals: {
    positive: ["definitely", "certainly", "clearly", "obviously", "the solution is",
               "the fix is", "the answer is", "verified", "confirmed", "tested"],
    negative: ["might", "maybe", "possibly", "perhaps", "unclear", "uncertain",
               "not sure", "more investigation", "needs more"]
  }
};

/**
 * Deep merge two objects, with source overriding target.
 * Includes prototype pollution protection (CVE prevention).
 * @param {Object} target - Base object
 * @param {Object} source - Object to merge in
 * @returns {Object} Merged object
 */
function deepMerge(target, source) {
  if (!source || typeof source !== "object") return target;
  const result = { ...target };
  for (const key of Object.keys(source)) {
    // Protect against prototype pollution attacks
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      continue;
    }
    if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key]) && key in target) {
      result[key] = deepMerge(target[key], source[key]);
    } else if (source[key] !== undefined) {
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * Validate configuration has required fields and valid values.
 * @param {Object} config - Configuration to validate
 * @throws {Error} If configuration is invalid
 */
function validateConfig(config) {
  const required = ["defaultMaxLoops", "defaultMinLoops", "actThreshold", "stateDecay", "depthTiers"];
  for (const field of required) {
    if (!(field in config)) {
      throw new Error(`Missing required config field: ${field}`);
    }
  }

  // Validate depth tiers are non-empty arrays
  for (const tier of ["shallow", "mid", "deep"]) {
    if (!config.depthTiers?.[tier] || !Array.isArray(config.depthTiers[tier]) || config.depthTiers[tier].length === 0) {
      throw new Error(`depthTiers.${tier} must be a non-empty array`);
    }
  }

  // Validate numeric ranges
  if (config.stateDecay <= 0 || config.stateDecay >= 1) {
    throw new Error("stateDecay must be between 0 and 1 (exclusive) for LTI stability");
  }
  if (config.actThreshold <= 0 || config.actThreshold > 1) {
    throw new Error("actThreshold must be between 0 and 1");
  }
}

/** @type {Object} Configuration loaded from file with defaults */
let CONFIG;

try {
  const fileConfig = loadConfig("reasoning-loop.json");
  // Safely merge file config with defaults using optional chaining
  CONFIG = deepMerge(DEFAULT_CONFIG, {
    ...(fileConfig?.loopConfig ?? {}),
    depthTiers: fileConfig?.depthTiers,
    loopPrompts: fileConfig?.loopPrompts,
    taskComplexitySignals: fileConfig?.taskComplexitySignals,
    confidenceSignals: fileConfig?.confidenceSignals
  });
  validateConfig(CONFIG);
} catch (error) {
  // Log error but fallback to defaults
  console.error("Config loading failed, using defaults:", error?.message || error);
  CONFIG = DEFAULT_CONFIG;
}

/**
 * Final configuration for reasoning loop parameters.
 * @constant {Object}
 */
export const LOOP_CONFIG = CONFIG;

// ============================================================================
// Utilities
// ============================================================================

/**
 * Execute a promise with timeout.
 * Uses finally block to ensure timer cleanup regardless of outcome.
 * @param {Promise} promise - Promise to execute
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} [operation="operation"] - Operation name for error message
 * @returns {Promise} Resolved promise or timeout rejection
 */
async function withTimeout(promise, timeoutMs, operation = "operation") {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${operation} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    // Always clear timeout to prevent memory leaks and race conditions
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * Retry a function with exponential backoff.
 * @param {Function} fn - Async function to retry
 * @param {Object} [options={}] - Retry options
 * @param {number} [options.maxRetries] - Maximum retry attempts
 * @param {number} [options.baseDelay] - Base delay in ms (doubles each retry)
 * @param {Function} [options.onRetry] - Callback when retry occurs (receives attempt number, error)
 * @returns {Promise} Result of successful execution
 */
async function withRetry(fn, options = {}) {
  const maxRetries = options.maxRetries ?? LOOP_CONFIG.maxRetries;
  const baseDelay = options.baseDelay ?? LOOP_CONFIG.retryDelay;
  const onRetry = options.onRetry;

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        // Only call onRetry when an actual retry is about to happen
        if (onRetry) {
          onRetry(attempt + 1, error);
        }
        await new Promise(resolve => setTimeout(resolve, baseDelay * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError;
}

/**
 * Sanitize user input to prevent prompt injection and XSS-like attacks.
 * Removes or escapes potentially dangerous patterns.
 * Note: This is defense-in-depth, not a complete solution for prompt injection.
 * Use system/user role separation in LLM API calls for stronger protection.
 * @param {string} input - Raw user input
 * @param {number} [maxLength=10000] - Maximum allowed length
 * @returns {string} Sanitized input
 */
function sanitizeInput(input, maxLength = 10000) {
  if (!input || typeof input !== "string") return "";

  return input
    // Truncate to max length
    .substring(0, maxLength)
    // Remove null bytes
    .replace(/\0/g, "")
    // Escape template-like patterns that could manipulate prompts
    .replace(/\{\{/g, "{ {")
    .replace(/\}\}/g, "} }")
    .replace(/\[\[/g, "[ [")
    .replace(/\]\]/g, "] ]")
    // Block script injection patterns
    .replace(/<\s*script[^>]*>/gi, "[script_blocked]")
    .replace(/<\/\s*script\s*>/gi, "[/script_blocked]")
    // Block eval-like patterns that could be interpreted by downstream code
    .replace(/\beval\s*\(/gi, "blocked(")
    .replace(/\bFunction\s*\(/gi, "blocked(")
    // Remove ANSI escape codes
    .replace(/\x1b\[[0-9;]*m/g, "")
    // Trim excessive whitespace
    .replace(/\s{10,}/g, " ".repeat(10));
}

/**
 * Truncate string to maximum length with ellipsis.
 * @param {string} str - String to truncate
 * @param {number} maxLen - Maximum length
 * @returns {string} Truncated string
 */
function truncate(str, maxLen) {
  if (!str || str.length <= maxLen) return str || "";
  return str.substring(0, maxLen - 3) + "...";
}

// ============================================================================
// State Management (LTI-stable)
// ============================================================================

/**
 * ReasoningState - Maintains accumulated context across loop iterations.
 *
 * Implements LTI stability: state update rule ensures spectral radius < 1,
 * preventing explosion across many iterations.
 *
 * @class
 * @example
 * const state = new ReasoningState("Analyze this bug...");
 * state.update(response, parsed, 0);
 * console.log(state.shouldHalt());
 */
export class ReasoningState {
  /**
   * Create a new reasoning state.
   * @param {string} originalInput - The original problem/task (injected each iteration)
   * @param {Object} [config={}] - Optional configuration overrides
   * @param {number} [config.decay] - State decay coefficient (default: 0.85)
   * @param {number} [config.injection] - Input injection strength (default: 0.3)
   */
  constructor(originalInput, config = {}) {
    /** @type {string} Original input - injected every iteration to prevent drift */
    this.originalInput = originalInput;

    /** @type {number} Decay coefficient A < 1 for LTI stability */
    this.decay = config.decay ?? LOOP_CONFIG.stateDecay;

    /** @type {number} Input injection coefficient B */
    this.injection = config.injection ?? LOOP_CONFIG.inputInjection;

    // Running state
    /** @type {Array<Object>} History of all iterations */
    this.iterations = [];

    /** @type {Array<number>} Confidence values per iteration */
    this.confidenceHistory = [];

    /** @type {string} Current accumulated state (decayed over time) */
    this.currentState = "";

    /** @type {number} ACT cumulative halting probability */
    this.cumulativeConfidence = 0;

    /** @type {Array<string>} Aggregated claims across iterations */
    this.claims = [];

    /** @type {Array<string>} Aggregated risks across iterations */
    this.risks = [];

    /** @type {Array<string>} Aggregated blockers across iterations */
    this.blockers = [];

    // Metrics
    /** @type {Object} Timing and cost metrics */
    this.metrics = {
      startTime: Date.now(),
      iterationTimes: [],
      totalTokens: { input: 0, output: 0 },
      modelCalls: 0,
      errors: 0,
      retries: 0
    };
  }

  /**
   * Update state following LTI rule: h_{t+1} = A*h_t + B*e + new_response
   *
   * The decay coefficient (A < 1) ensures stability:
   * - Old context fades gradually
   * - New insights are integrated
   * - Original input remains injected
   *
   * @param {Object} response - Model response object
   * @param {string} response.model - Model that generated the response
   * @param {string} response.response - Raw response text
   * @param {string} response.family - Model family
   * @param {number} [response.inputTokens] - Input tokens used
   * @param {number} [response.outputTokens] - Output tokens generated
   * @param {Object|null} parsed - Parsed structured response
   * @param {number} loopIndex - Current loop iteration index
   * @returns {Object} The iteration record
   */
  update(response, parsed, loopIndex) {
    const iterationStart = Date.now();

    // Extract structured information if available
    const iteration = {
      loop: loopIndex,
      model: response.model,
      family: response.family,
      timestamp: iterationStart,
      raw: truncate(response.response, 2000),
      structured: parsed || null,
      confidence: parsed?.confidence ?? this.estimateConfidence(response.response),
      duration: 0 // Will be set below
    };

    this.iterations.push(iteration);
    this.confidenceHistory.push(iteration.confidence);

    // Track metrics
    this.metrics.modelCalls++;
    if (response.inputTokens) this.metrics.totalTokens.input += response.inputTokens;
    if (response.outputTokens) this.metrics.totalTokens.output += response.outputTokens;

    // Update cumulative confidence (ACT accumulation)
    // P(halt at t) = confidence_t * (1 - cumulative_{t-1})
    const haltingProbability = iteration.confidence * (1 - this.cumulativeConfidence);
    this.cumulativeConfidence = Math.min(1, this.cumulativeConfidence + haltingProbability);

    // Aggregate structured findings (deduplicated with bounded limits)
    if (parsed) {
      const maxClaims = LOOP_CONFIG.maxClaims || 100;
      const maxRisks = LOOP_CONFIG.maxRisks || 50;
      const maxBlockers = LOOP_CONFIG.maxBlockers || 20;

      if (Array.isArray(parsed.key_claims)) {
        for (const claim of parsed.key_claims) {
          if (claim && !this.claims.includes(claim)) {
            if (this.claims.length >= maxClaims) {
              this.claims.shift(); // Remove oldest to make room
            }
            this.claims.push(claim);
          }
        }
      }
      if (Array.isArray(parsed.risks)) {
        for (const risk of parsed.risks) {
          if (risk && !this.risks.includes(risk)) {
            if (this.risks.length >= maxRisks) {
              this.risks.shift();
            }
            this.risks.push(risk);
          }
        }
      }
      if (Array.isArray(parsed.blockers)) {
        for (const blocker of parsed.blockers) {
          if (blocker && !this.blockers.includes(blocker)) {
            if (this.blockers.length >= maxBlockers) {
              this.blockers.shift();
            }
            this.blockers.push(blocker);
          }
        }
      }
    }

    // LTI state update: decay old, inject original, add new
    this._updateState(iteration, loopIndex);

    // Prune old iterations if exceeding limit
    if (this.iterations.length > LOOP_CONFIG.maxIterationHistory) {
      this.iterations = this.iterations.slice(-LOOP_CONFIG.maxIterationHistory);
    }

    iteration.duration = Date.now() - iterationStart;
    this.metrics.iterationTimes.push(iteration.duration);

    return iteration;
  }

  /**
   * Internal: Update the accumulated state with LTI rule.
   * @private
   */
  _updateState(iteration, loopIndex) {
    // Decay old state (A * h_t)
    const decayedState = this.currentState
      ? `[Prior reasoning]\n${truncate(this.currentState, Math.floor(LOOP_CONFIG.maxStateSize * this.decay))}\n\n`
      : "";

    // Inject original input (B * e) - always keep the original problem visible
    const injectedInput = `[Original problem]\n${truncate(this.originalInput, 500)}\n\n`;

    // Add new insight
    const newInsight = `[Loop ${loopIndex + 1}] ${truncate(iteration.raw, 1000)}\n`;

    // Combine and enforce max size
    let combined = decayedState + injectedInput + newInsight;
    if (combined.length > LOOP_CONFIG.maxStateSize) {
      combined = combined.substring(0, LOOP_CONFIG.maxStateSize);
    }

    this.currentState = combined;
  }

  /**
   * Estimate confidence from unstructured response text.
   * Uses signal patterns from configuration.
   *
   * @param {string} response - Raw response text
   * @returns {number} Estimated confidence 0.1-0.95
   */
  estimateConfidence(response) {
    if (!response) return 0.3;

    const text = response.toLowerCase();
    let score = 0.5;

    const signals = LOOP_CONFIG.confidenceSignals || {
      positive: ["definitely", "certainly", "clearly", "the solution is", "verified"],
      negative: ["might", "maybe", "unclear", "not sure", "needs more"]
    };

    // Positive confidence signals
    for (const signal of signals.positive) {
      if (text.includes(signal)) {
        score += 0.08;
      }
    }

    // Negative confidence signals
    for (const signal of signals.negative) {
      if (text.includes(signal)) {
        score -= 0.08;
      }
    }

    return Math.max(0.1, Math.min(0.95, score));
  }

  /**
   * Check if convergence criteria are met (ACT halting).
   *
   * Halting conditions:
   * 1. Cumulative confidence exceeds threshold (0.95)
   * 2. Confidence has converged (change < 0.05 over 3 iterations)
   *
   * @returns {Object} Halt status with reason
   * @returns {boolean} return.halt - Whether to halt
   * @returns {string} [return.reason] - Reason for halting
   * @returns {number} [return.value] - Relevant metric value
   */
  shouldHalt() {
    const n = this.confidenceHistory.length;

    // Need minimum iterations before allowing halt
    if (n < LOOP_CONFIG.defaultMinLoops) {
      return { halt: false };
    }

    // Check cumulative confidence threshold (ACT primary condition)
    if (this.cumulativeConfidence >= LOOP_CONFIG.actThreshold) {
      return {
        halt: true,
        reason: "cumulative_confidence",
        value: this.cumulativeConfidence
      };
    }

    // Check convergence (confidence stabilized over last 3 iterations)
    if (n >= 3) {
      const recent = this.confidenceHistory.slice(-3);
      const delta = Math.abs(recent[2] - recent[0]);
      const avgRecent = (recent[0] + recent[1] + recent[2]) / 3;

      if (delta < LOOP_CONFIG.convergenceThreshold && avgRecent >= LOOP_CONFIG.minConfidenceForHalt) {
        return {
          halt: true,
          reason: "convergence",
          value: delta
        };
      }
    }

    // PLATEAU DETECTION (claude-code-harness pattern)
    // Detect when reasoning loop makes no meaningful progress over 4+ iterations
    // This prevents wasted computation when models are stuck
    if (n >= 4) {
      const recentFour = this.confidenceHistory.slice(-4);
      // Calculate max delta across consecutive iterations
      let maxDelta = 0;
      for (let i = 1; i < recentFour.length; i++) {
        const iterDelta = Math.abs(recentFour[i] - recentFour[i - 1]);
        if (iterDelta > maxDelta) maxDelta = iterDelta;
      }

      // Plateau threshold: 0.03 (3% max movement over 4 iterations)
      const plateauThreshold = LOOP_CONFIG.plateauThreshold || 0.03;
      if (maxDelta < plateauThreshold) {
        return {
          halt: true,
          reason: "plateau_detected",
          value: maxDelta,
          suggestConsultation: true, // Flag for advisor pattern
          plateauDetails: {
            iterations: 4,
            maxDelta,
            confidenceRange: [Math.min(...recentFour), Math.max(...recentFour)],
            avgConfidence: recentFour.reduce((a, b) => a + b, 0) / 4
          }
        };
      }
    }

    return { halt: false };
  }

  /**
   * Build context-enriched prompt for a specific loop iteration.
   * Includes loop index embedding for differentiated behavior.
   *
   * @param {number} loopIndex - Current loop index (0-based)
   * @param {string} basePrompt - Original task/problem
   * @returns {string} Complete prompt with context and instructions
   */
  buildPromptForLoop(loopIndex, basePrompt) {
    const loopPrompt = LOOP_CONFIG.loopPrompts[loopIndex] || LOOP_CONFIG.loopPrompts.default;
    const maxLoops = LOOP_CONFIG.defaultMaxLoops;

    const priorContext = this.iterations.length > 0
      ? `\n\n## Prior Reasoning (${this.iterations.length} iteration${this.iterations.length > 1 ? "s" : ""})\n${this.summarizePrior()}`
      : "";

    // Loop index embedding - provides positional information within the reasoning loop
    const loopContext = `\n\n[Loop ${loopIndex + 1}/${maxLoops}] ${loopPrompt}`;

    return `${basePrompt}${priorContext}${loopContext}

## Your Task This Iteration
${loopPrompt}

Return JSON with this exact shape:
{
  "summary": "brief summary of findings (1-2 sentences)",
  "key_claims": ["specific factual claim 1", "specific claim 2"],
  "risks": ["potential risk or concern"],
  "recommended_action": "single concrete next step",
  "confidence": 0.7,
  "rationale": "brief explanation of confidence level"
}`;
  }

  /**
   * Summarize prior iterations for context injection.
   * Model-generated content is sanitized before inclusion.
   * @returns {string} Summary of prior reasoning
   */
  summarizePrior() {
    if (this.iterations.length === 0) return "No prior iterations.";

    const lines = [];

    // Light sanitization for model-generated content (less aggressive than user input)
    const sanitizeModelOutput = (text) => {
      if (!text) return "";
      return text
        .replace(/\{\{/g, "{ {")
        .replace(/\}\}/g, "} }")
        .replace(/<\s*script[^>]*>/gi, "")
        .replace(/<\/\s*script\s*>/gi, "");
    };

    // Last 3 iterations
    for (const iter of this.iterations.slice(-3)) {
      const rawSummary = iter.structured?.summary || truncate(iter.raw, 150);
      const summary = sanitizeModelOutput(rawSummary);
      lines.push(`- Loop ${iter.loop + 1} (${iter.model}): ${summary}`);
    }

    // Aggregated claims
    if (this.claims.length > 0) {
      lines.push(`\nEstablished claims: ${this.claims.slice(-5).map(sanitizeModelOutput).join("; ")}`);
    }

    // Aggregated risks
    if (this.risks.length > 0) {
      lines.push(`Identified risks: ${this.risks.slice(-3).map(sanitizeModelOutput).join("; ")}`);
    }

    return lines.join("\n");
  }

  /**
   * Generate final synthesis from all iterations.
   * @returns {Object} Synthesis object with all aggregated findings
   */
  synthesize() {
    const n = this.iterations.length;
    const avgConfidence = n > 0
      ? this.confidenceHistory.reduce((a, b) => a + b, 0) / n
      : 0;

    // Collect all recommended actions
    const actions = this.iterations
      .filter(i => i.structured?.recommended_action)
      .map(i => i.structured.recommended_action);

    // Find consensus action (most common)
    const actionCounts = {};
    for (const action of actions) {
      const normalized = action.toLowerCase().substring(0, 100);
      actionCounts[normalized] = (actionCounts[normalized] || 0) + 1;
    }
    const sortedActions = Object.entries(actionCounts).sort((a, b) => b[1] - a[1]);
    const topAction = sortedActions[0];

    const haltStatus = this.shouldHalt();

    return {
      totalIterations: n,
      averageConfidence: avgConfidence,
      finalConfidence: this.cumulativeConfidence,
      convergenceAchieved: haltStatus.halt,
      convergenceReason: haltStatus.reason || null,
      claims: [...new Set(this.claims)],
      risks: [...new Set(this.risks)],
      blockers: [...new Set(this.blockers)],
      recommendedAction: topAction ? topAction[0] : null,
      actionAgreement: topAction && n > 0 ? topAction[1] / n : 0,
      modelsUsed: [...new Set(this.iterations.map(i => i.model))],
      iterationSummaries: this.iterations.map(i => ({
        loop: i.loop,
        model: i.model,
        confidence: i.confidence,
        duration: i.duration,
        summary: i.structured?.summary || truncate(i.raw, 150)
      })),
      metrics: {
        ...this.metrics,
        totalDuration: Date.now() - this.metrics.startTime,
        avgIterationTime: this.metrics.iterationTimes.length > 0
          ? this.metrics.iterationTimes.reduce((a, b) => a + b, 0) / this.metrics.iterationTimes.length
          : 0
      }
    };
  }

  /**
   * Record an error occurrence.
   */
  recordError() {
    this.metrics.errors++;
  }

  /**
   * Record a retry attempt.
   */
  recordRetry() {
    this.metrics.retries++;
  }
}

// ============================================================================
// Model Selection by Depth
// ============================================================================

/**
 * Select model based on loop depth (depth extrapolation).
 * Early loops use fast/cheap models, deeper loops use stronger models.
 *
 * @param {number} loopIndex - Current loop index (0-based)
 * @param {string} [taskType="heavy-reasoning"] - Task type for routing hints
 * @returns {string} Selected model identifier
 */
export function selectModelByDepth(loopIndex, taskType = "heavy-reasoning") {
  const { shallow, mid, deep } = LOOP_CONFIG.depthTiers;

  let pool;
  let tierName;
  if (loopIndex <= 1) {
    pool = shallow;
    tierName = "shallow";
  } else if (loopIndex <= 4) {
    pool = mid;
    tierName = "mid";
  } else {
    pool = deep;
    tierName = "deep";
  }

  // Validate pool is non-empty (defensive - should be caught by config validation)
  if (!pool || !Array.isArray(pool) || pool.length === 0) {
    console.error(`Model pool for tier "${tierName}" is empty, falling back to default`);
    // Fallback to a safe default
    return "claude";
  }

  // Rotate through pool for variety
  return pool[loopIndex % pool.length];
}

/**
 * Infer optimal loop count from task complexity.
 * Analyzes task text for complexity signals.
 *
 * @param {string} task - Task description
 * @returns {number} Recommended loop count (2-8)
 */
export function inferLoopCount(task) {
  const text = task.toLowerCase();
  let loops = 4; // default balanced

  const signals = LOOP_CONFIG.taskComplexitySignals || {
    increase: ["architecture", "comprehensive", "multi-file", "root cause", "deep dive"],
    decrease: ["quick", "fast", "simple", "single", "typo"]
  };

  // Increase for complex tasks
  for (const signal of signals.increase) {
    if (text.includes(signal)) {
      loops += 1;
    }
  }

  // Decrease for simple tasks
  for (const signal of signals.decrease) {
    if (text.includes(signal)) {
      loops -= 1;
    }
  }

  return Math.max(LOOP_CONFIG.defaultMinLoops, Math.min(LOOP_CONFIG.defaultMaxLoops, loops));
}

// ============================================================================
// JSON Response Parsing
// ============================================================================

/**
 * Parse JSON response from loop iteration.
 * Handles fenced code blocks and bare JSON.
 *
 * @param {string} text - Raw response text
 * @returns {Object|null} Parsed and normalized response or null
 */
function parseLoopResponse(text) {
  if (!text) return null;

  // Try to extract JSON from fenced code block
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || text;

  // Find JSON object boundaries
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));

    // Normalize and validate
    return {
      summary: String(parsed.summary || "").trim(),
      key_claims: Array.isArray(parsed.key_claims)
        ? parsed.key_claims.filter(c => c).map(String)
        : [],
      risks: Array.isArray(parsed.risks)
        ? parsed.risks.filter(r => r).map(String)
        : [],
      recommended_action: String(parsed.recommended_action || "").trim(),
      confidence: typeof parsed.confidence === "number"
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.5,
      rationale: String(parsed.rationale || "").trim(),
      blockers: Array.isArray(parsed.blockers)
        ? parsed.blockers.filter(b => b).map(String)
        : []
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Main Reasoning Loop
// ============================================================================

/**
 * Execute iterative reasoning loop with RDT-inspired architecture.
 *
 * @async
 * @param {string} task - The problem/task to reason about
 * @param {Object} [options={}] - Configuration options
 * @param {number} [options.maxLoops] - Maximum iterations (default: auto-inferred)
 * @param {Array<string>} [options.models] - Force specific models per iteration
 * @param {boolean} [options.useConsensus=false] - Use multi-model consensus on alternating iterations
 * @param {Array<string>} [options.consensusModels] - Models for consensus mode
 * @param {string} [options.system] - System prompt for all iterations
 * @param {number} [options.maxTokens=4096] - Maximum tokens per response
 * @param {Function} [options.onIteration] - Callback(iteration, state) per iteration
 * @param {boolean} [options.earlyHalt=true] - Enable ACT-based early halting
 * @returns {Promise<Object>} Synthesis of all reasoning iterations
 *
 * @example
 * const result = await executeReasoningLoop("Analyze this security vulnerability...", {
 *   maxLoops: 6,
 *   useConsensus: true,
 *   earlyHalt: true
 * });
 * console.log(result.finalSynthesis);
 */
export async function executeReasoningLoop(task, options = {}) {
  // Sanitize input to prevent prompt injection
  const sanitizedTask = sanitizeInput(task);

  if (!sanitizedTask) {
    return {
      success: false,
      error: "Empty or invalid task input",
      totalIterations: 0,
      claims: [],
      risks: [],
      blockers: []
    };
  }

  const {
    maxLoops = inferLoopCount(sanitizedTask),
    models = null,
    useConsensus = false,
    consensusModels = null,
    system: rawSystem = null,
    maxTokens = 4096,
    onIteration = null,
    earlyHalt = true
  } = options;

  // Sanitize system prompt to prevent prompt injection
  const system = rawSystem ? sanitizeInput(rawSystem, 5000) : null;

  const state = new ReasoningState(sanitizedTask);

  emitProgress(PROGRESS_EVENTS.REASONING_LOOP, {
    phase: "start",
    maxLoops,
    taskLength: sanitizedTask.length,
    useConsensus,
    earlyHalt
  });

  // === PRELUDE: Initial broad analysis ===
  await executePrelude(state, sanitizedTask, system, maxTokens);

  // === RECURRENT BLOCK: Main reasoning loop ===
  for (let loopIndex = 0; loopIndex < maxLoops; loopIndex++) {
    // Check ACT halting condition before iteration
    if (earlyHalt && loopIndex >= LOOP_CONFIG.defaultMinLoops) {
      const haltCheck = state.shouldHalt();
      if (haltCheck.halt) {
        emitProgress(PROGRESS_EVENTS.REASONING_LOOP, {
          phase: "early_halt",
          loop: loopIndex,
          reason: haltCheck.reason,
          value: haltCheck.value
        });
        break;
      }
    }

    emitProgress(PROGRESS_EVENTS.REASONING_LOOP, {
      phase: "iteration",
      loop: loopIndex,
      cumulativeConfidence: state.cumulativeConfidence,
      claimsCount: state.claims.length,
      risksCount: state.risks.length
    });

    const success = await executeIteration(
      state, loopIndex, sanitizedTask, models, useConsensus, consensusModels, system, maxTokens
    );

    if (success && onIteration) {
      try {
        onIteration(state.iterations[state.iterations.length - 1], state);
      } catch (callbackError) {
        console.error("onIteration callback error:", callbackError.message);
      }
    }
  }

  // === CODA: Final synthesis ===
  const synthesis = state.synthesize();
  await executeCoda(state, synthesis, sanitizedTask, system, maxTokens);

  emitProgress(PROGRESS_EVENTS.REASONING_LOOP, {
    phase: "complete",
    totalIterations: synthesis.totalIterations,
    finalConfidence: synthesis.finalConfidence,
    convergenceAchieved: synthesis.convergenceAchieved,
    convergenceReason: synthesis.convergenceReason,
    modelsUsed: synthesis.modelsUsed.length,
    metrics: synthesis.metrics
  });

  return {
    success: true,
    ...synthesis
  };
}

/**
 * Execute prelude phase - initial broad analysis.
 * @private
 */
async function executePrelude(state, task, system, maxTokens) {
  const preludePrompt = `Analyze this problem to establish initial understanding:

${truncate(task, 4000)}

Identify:
1. Core problem statement
2. Key constraints
3. Initial hypotheses
4. Information gaps

Return JSON: {"summary": "", "key_claims": [], "risks": [], "recommended_action": "", "confidence": 0.0, "rationale": ""}`;

  const preludeModel = LOOP_CONFIG.depthTiers.shallow[0];

  try {
    const result = await withTimeout(
      withRetry(
        () => callModel(preludeModel, preludePrompt, system, maxTokens, { operation: "analyze" }),
        { onRetry: () => state.recordRetry() }
      ),
      LOOP_CONFIG.preludeTimeout || 30000,
      "prelude"
    );

    const parsed = parseLoopResponse(result.text);
    state.update(
      {
        model: preludeModel,
        response: result.text,
        family: getModelFamily(preludeModel).family,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens
      },
      parsed,
      -1 // Prelude is iteration -1
    );
  } catch (error) {
    // Prelude failure is non-fatal, continue with main loop
    state.recordError();
    emitProgress(PROGRESS_EVENTS.REASONING_LOOP, {
      phase: "prelude_error",
      error: error.message
    });
  }
}

/**
 * Execute a single iteration of the reasoning loop.
 * @private
 */
async function executeIteration(state, loopIndex, task, models, useConsensus, consensusModels, system, maxTokens) {
  const prompt = state.buildPromptForLoop(loopIndex, task);
  const model = models?.[loopIndex] ?? selectModelByDepth(loopIndex);

  try {
    let response;
    let parsed;

    // Alternate between single model and consensus
    if (useConsensus && loopIndex % 2 === 1) {
      const result = await executeConsensusIteration(prompt, consensusModels, system, maxTokens);
      if (result) {
        response = result.response;
        parsed = result.parsed;
      }
    }

    // Fall back to single model if consensus failed or not used
    if (!response) {
      const result = await withTimeout(
        withRetry(
          () => callModel(model, prompt, system, maxTokens, { operation: "analyze" }),
          { onRetry: () => state.recordRetry() }
        ),
        LOOP_CONFIG.iterationTimeout || 60000,
        `iteration_${loopIndex}`
      );

      response = {
        model,
        response: result.text,
        family: getModelFamily(model).family,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens
      };
      parsed = parseLoopResponse(result.text);
    }

    state.update(response, parsed, loopIndex);
    return true;

  } catch (error) {
    state.recordError();
    emitProgress(PROGRESS_EVENTS.REASONING_LOOP, {
      phase: "iteration_error",
      loop: loopIndex,
      model,
      error: error.message
    });
    return false;
  }
}

/**
 * Execute consensus-based iteration.
 * @private
 */
async function executeConsensusIteration(prompt, consensusModels, system, maxTokens) {
  const consModels = consensusModels || LLM_COUNCIL_MODELS.slice(0, 3);

  try {
    const consensusResult = await withTimeout(
      buildConsensus(prompt, consModels, {
        system,
        maxTokens,
        operation: "analyze",
        responseFormat: "structured"
      }),
      (LOOP_CONFIG.iterationTimeout || 60000) * 2, // Double timeout for consensus
      "consensus_iteration"
    );

    if (consensusResult.success) {
      // Aggregate token usage from all consensus models
      const totalInputTokens = consensusResult.responses?.reduce((sum, r) => sum + (r.inputTokens || 0), 0) || 0;
      const totalOutputTokens = consensusResult.responses?.reduce((sum, r) => sum + (r.outputTokens || 0), 0) || 0;

      return {
        response: {
          model: `consensus(${consModels.join(",")})`,
          response: consensusResult.summary,
          family: "consensus",
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens
        },
        parsed: {
          summary: consensusResult.summary,
          key_claims: consensusResult.commonPoints?.map(p => p.assertion) || [],
          risks: consensusResult.commonRisks?.map(r => r.risk) || [],
          confidence: consensusResult.confidence,
          recommended_action: consensusResult.recommendedActions?.[0]?.[0] || "",
          blockers: consensusResult.blockerCounts?.map(b => b.blocker) || []
        }
      };
    }
  } catch (error) {
    // Log consensus failure for debugging
    emitProgress(PROGRESS_EVENTS.REASONING_LOOP, {
      phase: "consensus_error",
      error: error?.message || "Consensus failed"
    });
  }

  return null;
}

/**
 * Execute coda phase - final synthesis.
 * @private
 */
async function executeCoda(state, synthesis, task, system, maxTokens) {
  const codaPrompt = `Synthesize all findings into a final recommendation.

Original problem:
${truncate(task, 2000)}

Analysis summary (${synthesis.totalIterations} iterations, ${(synthesis.finalConfidence * 100).toFixed(0)}% confidence):

Claims established:
${synthesis.claims.slice(0, 10).map(c => `- ${c}`).join("\n") || "- None established"}

Risks identified:
${synthesis.risks.slice(0, 5).map(r => `- ${r}`).join("\n") || "- None identified"}

Blockers:
${synthesis.blockers.slice(0, 3).map(b => `- ${b}`).join("\n") || "- None identified"}

Most recommended action: ${synthesis.recommendedAction || "Not determined"}

Provide final synthesis with:
1. Root cause or core insight
2. Recommended solution
3. Implementation steps (numbered)
4. Risks to mitigate`;

  try {
    const codaModel = LOOP_CONFIG.depthTiers.deep[0];
    const codaResult = await withTimeout(
      withRetry(async () => {
        return callModel(codaModel, codaPrompt, system, maxTokens, { operation: "analyze" });
      }),
      LOOP_CONFIG.codaTimeout || 45000,
      "coda"
    );

    synthesis.finalSynthesis = codaResult.text;
    synthesis.metrics.totalTokens.input += codaResult.inputTokens || 0;
    synthesis.metrics.totalTokens.output += codaResult.outputTokens || 0;

  } catch (error) {
    synthesis.finalSynthesis = `Coda synthesis failed: ${error.message}`;
    state.recordError();
  }
}

// ============================================================================
// Quick API Functions
// ============================================================================

/**
 * Quick reasoning with minimal iterations (for time-sensitive tasks).
 *
 * @async
 * @param {string} task - Task to analyze
 * @param {Object} [options={}] - Options (same as executeReasoningLoop)
 * @returns {Promise<Object>} Reasoning result
 */
export async function quickReason(task, options = {}) {
  return executeReasoningLoop(task, {
    ...options,
    maxLoops: 3,
    useConsensus: false,
    earlyHalt: true
  });
}

/**
 * Deep reasoning with maximum iterations and consensus (for complex analysis).
 *
 * @async
 * @param {string} task - Task to analyze
 * @param {Object} [options={}] - Options (same as executeReasoningLoop)
 * @returns {Promise<Object>} Reasoning result
 */
export async function deepReason(task, options = {}) {
  return executeReasoningLoop(task, {
    ...options,
    maxLoops: LOOP_CONFIG.defaultMaxLoops,
    useConsensus: true,
    earlyHalt: true
  });
}

// ============================================================================
// Result Formatting
// ============================================================================

/**
 * Format reasoning result for display.
 *
 * @param {Object} result - Result from executeReasoningLoop
 * @returns {string} Markdown-formatted result
 */
export function formatReasoningResult(result) {
  const lines = [];

  lines.push("## Reasoning Loop Results");
  lines.push("");
  lines.push(`**Iterations:** ${result.totalIterations}`);
  lines.push(`**Final Confidence:** ${(result.finalConfidence * 100).toFixed(0)}%`);
  lines.push(`**Convergence:** ${result.convergenceAchieved ? `Yes (${result.convergenceReason})` : "No (max loops reached)"}`);
  lines.push(`**Models Used:** ${result.modelsUsed.join(", ")}`);

  if (result.metrics) {
    lines.push(`**Duration:** ${(result.metrics.totalDuration / 1000).toFixed(1)}s`);
    lines.push(`**Tokens:** ${result.metrics.totalTokens.input} in / ${result.metrics.totalTokens.output} out`);
  }
  lines.push("");

  if (result.claims.length > 0) {
    lines.push("### Established Claims");
    for (const claim of result.claims.slice(0, 8)) {
      lines.push(`- ${claim}`);
    }
    lines.push("");
  }

  if (result.risks.length > 0) {
    lines.push("### Identified Risks");
    for (const risk of result.risks.slice(0, 5)) {
      lines.push(`- ${risk}`);
    }
    lines.push("");
  }

  if (result.blockers.length > 0) {
    lines.push("### Blockers");
    for (const blocker of result.blockers.slice(0, 3)) {
      lines.push(`- ${blocker}`);
    }
    lines.push("");
  }

  if (result.recommendedAction) {
    lines.push("### Recommended Action");
    lines.push(result.recommendedAction);
    lines.push(`(Agreement: ${(result.actionAgreement * 100).toFixed(0)}%)`);
    lines.push("");
  }

  if (result.finalSynthesis) {
    lines.push("### Final Synthesis");
    lines.push(result.finalSynthesis);
    lines.push("");
  }

  lines.push("### Iteration History");
  for (const iter of result.iterationSummaries.slice(-5)) {
    const loopNum = iter.loop === -1 ? "Prelude" : `Loop ${iter.loop + 1}`;
    const duration = iter.duration ? ` [${iter.duration}ms]` : "";
    lines.push(`- ${loopNum} (${iter.model}, ${(iter.confidence * 100).toFixed(0)}%)${duration}: ${truncate(iter.summary, 80)}`);
  }

  return lines.join("\n");
}

// Export internal utilities for testing
export { sanitizeInput, deepMerge, validateConfig };
