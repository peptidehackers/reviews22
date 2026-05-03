/**
 * @fileoverview Advisor Strategy Module (claude-code-harness pattern)
 *
 * Implements recovery from failures through consultation patterns:
 * - Preflight consultation for high-risk tasks
 * - Corrective consultation on repeated failures
 * - Plateau escalation before giving up
 *
 * The advisor does NOT make final decisions - it provides guidance
 * that the primary execution flow can incorporate.
 *
 * @module advisor
 */

import { callModel } from "./fallback.js";
import { emitProgress, PROGRESS_EVENTS } from "./session.js";
import { LLM_COUNCIL_CHAIRMAN } from "./models.js";

// ============================================================================
// Advisor Configuration
// ============================================================================

const ADVISOR_CONFIG = {
  // Model to use for advisor consultations
  advisorModel: LLM_COUNCIL_CHAIRMAN || "claude45",

  // Fallback models if primary fails
  fallbackChain: ["gemini", "gpt4o", "deepseek"],

  // Consultation timeouts (ms)
  preflightTimeout: 15000,
  correctiveTimeout: 20000,
  plateauTimeout: 25000,

  // Retry configuration
  maxRetries: 2,

  // Failure thresholds
  consecutiveFailureThreshold: 3,  // Trigger corrective after N failures
  totalFailureThreshold: 5,        // Maximum total failures before abort
};

// Track failure state per task
const failureTracking = new Map();

// ============================================================================
// Advisor Types
// ============================================================================

/**
 * Consultation types
 */
export const CONSULTATION_TYPE = {
  PREFLIGHT: "preflight",      // Before execution of high-risk task
  CORRECTIVE: "corrective",    // After repeated failures
  PLATEAU: "plateau",          // When reasoning loop stalls
  ESCALATION: "escalation"     // Final escalation before giving up
};

/**
 * Advisor response structure
 * @typedef {Object} AdvisorResponse
 * @property {boolean} shouldProceed - Whether to proceed with the task
 * @property {string} guidance - Guidance text from advisor
 * @property {string[]} suggestions - Specific suggestions
 * @property {string} [alternativeApproach] - Alternative approach if should not proceed
 * @property {number} confidence - Advisor confidence in guidance
 * @property {string} consultationType - Type of consultation
 */

// ============================================================================
// Preflight Consultation
// ============================================================================

/**
 * Consult advisor before executing a high-risk task.
 *
 * @param {Object} taskContext - Task context
 * @param {string} taskContext.description - Task description
 * @param {string} taskContext.riskLevel - Risk level (high/medium/low)
 * @param {string} taskContext.codeContext - Relevant code context
 * @param {string[]} taskContext.entryPoints - Entry points
 * @returns {Promise<AdvisorResponse>} Advisor response
 */
export async function preflightConsultation(taskContext) {
  emitProgress(PROGRESS_EVENTS.START, {
    phase: "advisor_preflight",
    riskLevel: taskContext.riskLevel
  });

  const prompt = buildPreflightPrompt(taskContext);

  try {
    const response = await callAdvisor(prompt, ADVISOR_CONFIG.preflightTimeout);
    const parsed = parseAdvisorResponse(response.text);

    return {
      shouldProceed: parsed.shouldProceed ?? true,
      guidance: parsed.guidance || response.text,
      suggestions: parsed.suggestions || [],
      alternativeApproach: parsed.alternativeApproach,
      confidence: parsed.confidence ?? 0.7,
      consultationType: CONSULTATION_TYPE.PREFLIGHT
    };

  } catch (error) {
    // Preflight failure is non-blocking - log and proceed with caution
    emitProgress(PROGRESS_EVENTS.ERROR, {
      phase: "advisor_preflight_failed",
      error: error.message
    });

    return {
      shouldProceed: true,
      guidance: `Preflight consultation failed: ${error.message}. Proceeding with caution.`,
      suggestions: ["Monitor closely for errors", "Have rollback ready"],
      confidence: 0.5,
      consultationType: CONSULTATION_TYPE.PREFLIGHT
    };
  }
}

/**
 * Build preflight consultation prompt.
 */
function buildPreflightPrompt(taskContext) {
  return `You are an advisor reviewing a task before execution.

## Task Description
${taskContext.description}

## Risk Level
${taskContext.riskLevel || "unknown"}

## Code Context
${taskContext.codeContext ? taskContext.codeContext.substring(0, 2000) : "Not provided"}

## Entry Points
${taskContext.entryPoints ? taskContext.entryPoints.join(", ") : "Not specified"}

## Your Task
Evaluate whether this task is ready for execution. Consider:
1. Is the task description clear and actionable?
2. Are there obvious risks or missing information?
3. What should the executor watch out for?

Return JSON:
{
  "shouldProceed": true|false,
  "guidance": "your guidance",
  "suggestions": ["suggestion1", "suggestion2"],
  "alternativeApproach": "if should not proceed, what to do instead",
  "confidence": 0.0-1.0
}`;
}

// ============================================================================
// Corrective Consultation
// ============================================================================

/**
 * Consult advisor after repeated failures.
 *
 * @param {Object} context - Failure context
 * @param {string} context.taskId - Task identifier
 * @param {string} context.taskDescription - Original task
 * @param {Object[]} context.failures - List of failures
 * @param {number} context.attemptCount - Number of attempts so far
 * @returns {Promise<AdvisorResponse>} Advisor response
 */
export async function correctiveConsultation(context) {
  emitProgress(PROGRESS_EVENTS.START, {
    phase: "advisor_corrective",
    attemptCount: context.attemptCount
  });

  const prompt = buildCorrectivePrompt(context);

  try {
    const response = await callAdvisor(prompt, ADVISOR_CONFIG.correctiveTimeout);
    const parsed = parseAdvisorResponse(response.text);

    return {
      shouldProceed: parsed.shouldProceed ?? false,
      guidance: parsed.guidance || response.text,
      suggestions: parsed.suggestions || [],
      alternativeApproach: parsed.alternativeApproach,
      confidence: parsed.confidence ?? 0.5,
      consultationType: CONSULTATION_TYPE.CORRECTIVE
    };

  } catch (error) {
    emitProgress(PROGRESS_EVENTS.ERROR, {
      phase: "advisor_corrective_failed",
      error: error.message
    });

    return {
      shouldProceed: false,
      guidance: `Corrective consultation failed: ${error.message}. Recommend manual review.`,
      suggestions: ["Review error patterns manually", "Check system health"],
      confidence: 0.3,
      consultationType: CONSULTATION_TYPE.CORRECTIVE
    };
  }
}

/**
 * Build corrective consultation prompt.
 */
function buildCorrectivePrompt(context) {
  const failureSummary = context.failures.map((f, i) =>
    `Attempt ${i + 1}: ${f.error || f.reason || "Unknown error"}`
  ).join("\n");

  return `You are an advisor helping diagnose repeated failures.

## Original Task
${context.taskDescription}

## Failures (${context.attemptCount} attempts)
${failureSummary}

## Your Task
Analyze the failure pattern and recommend next steps:
1. Is there a common root cause?
2. Should we try again with different parameters?
3. Should we escalate or abort?

Return JSON:
{
  "shouldProceed": true|false,
  "guidance": "what you think is happening",
  "suggestions": ["try X", "check Y"],
  "alternativeApproach": "if should not proceed, what to do instead",
  "rootCauseHypothesis": "what might be causing failures",
  "confidence": 0.0-1.0
}`;
}

// ============================================================================
// Plateau Consultation
// ============================================================================

/**
 * Consult advisor when reasoning loop has plateaued.
 *
 * @param {Object} context - Plateau context
 * @param {string} context.originalTask - Original task
 * @param {Object} context.plateauDetails - Details from plateau detection
 * @param {Object[]} context.iterationHistory - Recent iteration summaries
 * @returns {Promise<AdvisorResponse>} Advisor response
 */
export async function plateauConsultation(context) {
  emitProgress(PROGRESS_EVENTS.REASONING_LOOP, {
    phase: "advisor_plateau",
    iterations: context.iterationHistory?.length || 0
  });

  const prompt = buildPlateauPrompt(context);

  try {
    const response = await callAdvisor(prompt, ADVISOR_CONFIG.plateauTimeout);
    const parsed = parseAdvisorResponse(response.text);

    return {
      shouldProceed: parsed.shouldProceed ?? false,
      guidance: parsed.guidance || response.text,
      suggestions: parsed.suggestions || [],
      alternativeApproach: parsed.alternativeApproach,
      confidence: parsed.confidence ?? 0.6,
      consultationType: CONSULTATION_TYPE.PLATEAU,
      newDirection: parsed.newDirection
    };

  } catch (error) {
    emitProgress(PROGRESS_EVENTS.ERROR, {
      phase: "advisor_plateau_failed",
      error: error.message
    });

    return {
      shouldProceed: false,
      guidance: "Plateau consultation failed. Recommending halt with current findings.",
      suggestions: ["Synthesize current findings", "Report partial results"],
      confidence: 0.4,
      consultationType: CONSULTATION_TYPE.PLATEAU
    };
  }
}

/**
 * Build plateau consultation prompt.
 */
function buildPlateauPrompt(context) {
  const iterationSummary = (context.iterationHistory || []).map((iter, i) =>
    `Loop ${i + 1}: ${iter.summary || "No summary"} (confidence: ${(iter.confidence * 100).toFixed(0)}%)`
  ).join("\n");

  return `You are an advisor helping break through a reasoning plateau.

## Original Task
${context.originalTask}

## Plateau Details
- Iterations without progress: ${context.plateauDetails?.iterations || 4}
- Max confidence delta: ${context.plateauDetails?.maxDelta?.toFixed(3) || "unknown"}
- Confidence range: ${JSON.stringify(context.plateauDetails?.confidenceRange || [])}

## Recent Iterations
${iterationSummary || "No iteration history"}

## Your Task
The reasoning loop has stalled. Recommend:
1. Is there a missing perspective or overlooked angle?
2. Should we continue with a different approach?
3. Should we synthesize what we have and halt?

Return JSON:
{
  "shouldProceed": true|false,
  "guidance": "what to do next",
  "suggestions": ["try this angle", "consider that"],
  "newDirection": "if proceeding, what new direction to take",
  "synthesizeNow": true|false,
  "confidence": 0.0-1.0
}`;
}

// ============================================================================
// Failure Tracking
// ============================================================================

/**
 * Record a failure for a task.
 *
 * @param {string} taskId - Task identifier
 * @param {Object} failure - Failure details
 * @returns {Object} Updated tracking state
 */
export function recordFailure(taskId, failure) {
  if (!failureTracking.has(taskId)) {
    failureTracking.set(taskId, {
      failures: [],
      consecutiveCount: 0,
      totalCount: 0,
      lastFailure: null
    });
  }

  const tracking = failureTracking.get(taskId);
  tracking.failures.push({
    ...failure,
    timestamp: new Date().toISOString()
  });
  tracking.consecutiveCount++;
  tracking.totalCount++;
  tracking.lastFailure = new Date().toISOString();

  // Keep only last 10 failures
  if (tracking.failures.length > 10) {
    tracking.failures = tracking.failures.slice(-10);
  }

  return {
    needsCorrectiveConsultation: tracking.consecutiveCount >= ADVISOR_CONFIG.consecutiveFailureThreshold,
    shouldAbort: tracking.totalCount >= ADVISOR_CONFIG.totalFailureThreshold,
    tracking
  };
}

/**
 * Record a success (resets consecutive failure count).
 *
 * @param {string} taskId - Task identifier
 */
export function recordSuccess(taskId) {
  if (failureTracking.has(taskId)) {
    const tracking = failureTracking.get(taskId);
    tracking.consecutiveCount = 0;
  }
}

/**
 * Clear tracking for a task.
 *
 * @param {string} taskId - Task identifier
 */
export function clearTracking(taskId) {
  failureTracking.delete(taskId);
}

/**
 * Get failure tracking for a task.
 *
 * @param {string} taskId - Task identifier
 * @returns {Object|null} Tracking state or null
 */
export function getTracking(taskId) {
  return failureTracking.get(taskId) || null;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Call the advisor model with fallback chain.
 */
async function callAdvisor(prompt, timeout) {
  const models = [ADVISOR_CONFIG.advisorModel, ...ADVISOR_CONFIG.fallbackChain];

  for (const model of models) {
    try {
      const result = await Promise.race([
        callModel(model, prompt, "You are a helpful advisor providing guidance.", 2048, {
          operation: "consult"
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), timeout)
        )
      ]);

      return result;

    } catch (error) {
      // Try next model
      continue;
    }
  }

  throw new Error("All advisor models failed");
}

/**
 * Parse advisor response to extract structured fields.
 */
function parseAdvisorResponse(text) {
  if (!text) return {};

  // Try to extract JSON
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      // Fall through to text parsing
    }
  }

  // Parse as text
  return {
    shouldProceed: !text.toLowerCase().includes("abort") && !text.toLowerCase().includes("do not proceed"),
    guidance: text,
    suggestions: [],
    confidence: 0.5
  };
}

/**
 * Format advisor response for display.
 *
 * @param {AdvisorResponse} response - Advisor response
 * @returns {string} Formatted output
 */
export function formatAdvisorResponse(response) {
  const lines = [];

  lines.push(`## Advisor Consultation (${response.consultationType})`);
  lines.push("");
  lines.push(`**Decision:** ${response.shouldProceed ? "Proceed" : "Do Not Proceed"}`);
  lines.push(`**Confidence:** ${(response.confidence * 100).toFixed(0)}%`);
  lines.push("");
  lines.push("**Guidance:**");
  lines.push(response.guidance);
  lines.push("");

  if (response.suggestions && response.suggestions.length > 0) {
    lines.push("**Suggestions:**");
    for (const suggestion of response.suggestions) {
      lines.push(`- ${suggestion}`);
    }
    lines.push("");
  }

  if (response.alternativeApproach) {
    lines.push("**Alternative Approach:**");
    lines.push(response.alternativeApproach);
    lines.push("");
  }

  return lines.join("\n");
}
