/**
 * Consensus Engine - Compare multiple model responses and detect disagreement.
 *
 * This module provides two consensus approaches:
 *
 * 1. Legacy single-pass consensus (buildConsensus, quickVote)
 *    - Fast parallel queries to multiple models
 *    - Heuristic-based disagreement detection
 *    - Good for quick decisions
 *
 * 2. Full LLM Council protocol (via council.js)
 *    - 3-stage: Initial → Peer Review → Chairman Synthesis
 *    - Anonymized peer evaluation prevents bias
 *    - Chairman synthesis produces unified high-quality output
 *    - Better for important decisions
 *
 * @module consensus
 * @see {@link ./council.js} for the full council implementation
 */

import { callModel } from "./fallback.js";
import { getModelFamily, LLM_COUNCIL_CHAIRMAN } from "./models.js";
import { emitProgress, PROGRESS_EVENTS } from "./session.js";

// Re-export council functions for convenience
export {
  runCouncil,
  quickCouncil,
  standardCouncil,
  fullCouncil,
  formatCouncilResult
} from "./council.js";

const STRUCTURED_CONSENSUS_INSTRUCTIONS = `Return JSON only with this shape:
{
  "summary": "short summary",
  "key_claims": ["claim"],
  "risks": ["risk"],
  "recommended_action": "single recommended action",
  "blockers": ["blocker"],
  "confidence": 0.0,
  "rationale": "brief explanation"
}

Rules:
- confidence must be between 0 and 1
- key_claims, risks, blockers must be arrays of short strings
- recommended_action must be a single sentence`;

function normalizeList(values) {
  if (Array.isArray(values)) {
    return values
      .map((value) => String(value).trim())
      .filter(Boolean);
  }

  if (typeof values === "string" && values.trim()) {
    return values
      .split(/\n|,/)
      .map((value) => value.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeStructuredConsensusResponse(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const confidenceNumber = Number(parsed.confidence);

  return {
    summary: String(parsed.summary || "").trim(),
    key_claims: normalizeList(parsed.key_claims),
    risks: normalizeList(parsed.risks),
    recommended_action: String(parsed.recommended_action || "").trim(),
    blockers: normalizeList(parsed.blockers),
    confidence: Number.isFinite(confidenceNumber)
      ? Math.max(0, Math.min(1, confidenceNumber))
      : 0.5,
    rationale: String(parsed.rationale || "").trim()
  };
}

function extractJsonCandidate(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1);
  }

  return null;
}

export function parseStructuredConsensusResponse(text) {
  if (!text || typeof text !== "string") {
    return { success: false, error: "empty response" };
  }

  const candidate = extractJsonCandidate(text);
  if (!candidate) {
    return { success: false, error: "no json object found" };
  }

  try {
    const parsed = JSON.parse(candidate);
    const normalized = normalizeStructuredConsensusResponse(parsed);

    if (!normalized || !normalized.recommended_action) {
      return { success: false, error: "missing required consensus fields" };
    }

    return { success: true, data: normalized };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function normalizeAssertion(assertion) {
  return assertion
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "")
    .trim()
    .substring(0, 120);
}

function tallyNormalized(items) {
  const counts = {};

  for (const item of items) {
    const normalized = normalizeAssertion(item);
    if (!normalized) continue;
    counts[normalized] = (counts[normalized] || 0) + 1;
  }

  return counts;
}

export function analyzeStructuredResponses(responses) {
  const disagreements = [];
  const majority = Math.ceil(responses.length / 2);
  const allClaims = responses.flatMap((response) => response.structured.key_claims);
  const allRisks = responses.flatMap((response) => response.structured.risks);
  const allBlockers = responses.flatMap((response) => response.structured.blockers);
  const recommendedActionCounts = tallyNormalized(
    responses.map((response) => response.structured.recommended_action)
  );
  const commonPoints = Object.entries(tallyNormalized(allClaims))
    .filter(([, count]) => count >= majority)
    .map(([assertion, agreementCount]) => ({
      assertion,
      agreementCount,
      totalModels: responses.length
    }));

  const commonRisks = Object.entries(tallyNormalized(allRisks))
    .filter(([, count]) => count >= majority)
    .map(([risk, agreementCount]) => ({ risk, agreementCount }));

  const blockerCounts = Object.entries(tallyNormalized(allBlockers))
    .filter(([, count]) => count >= majority)
    .map(([blocker, agreementCount]) => ({ blocker, agreementCount }));

  const actionEntries = Object.entries(recommendedActionCounts).sort((a, b) => b[1] - a[1]);
  const topAction = actionEntries[0];

  if (actionEntries.length > 1) {
    disagreements.push({
      type: "recommended_action",
      models: responses.map((response) => response.model),
      description: `Models disagree on next step (${actionEntries.length} competing recommendations)`
    });
  }

  const averageConfidence = responses.reduce(
    (sum, response) => sum + response.structured.confidence,
    0
  ) / Math.max(responses.length, 1);
  const actionAgreement = topAction ? topAction[1] / responses.length : 0;
  const confidence = Math.max(
    0,
    Math.min(1, averageConfidence * 0.6 + actionAgreement * 0.4 - disagreements.length * 0.08)
  );

  const lines = [];
  lines.push(
    `Structured consensus from ${responses.length} models (confidence: ${(confidence * 100).toFixed(0)}%)`
  );
  lines.push("");

  if (topAction) {
    lines.push(`**Recommended Action:** ${topAction[0]} (${topAction[1]}/${responses.length} models)`);
    lines.push("");
  }

  if (commonPoints.length > 0) {
    lines.push("**Shared Claims:**");
    for (const point of commonPoints.slice(0, 5)) {
      lines.push(`- ${point.assertion} (${point.agreementCount}/${point.totalModels})`);
    }
    lines.push("");
  }

  if (commonRisks.length > 0) {
    lines.push("**Shared Risks:**");
    for (const risk of commonRisks.slice(0, 5)) {
      lines.push(`- ${risk.risk} (${risk.agreementCount}/${responses.length})`);
    }
    lines.push("");
  }

  if (blockerCounts.length > 0) {
    lines.push("**Shared Blockers:**");
    for (const blocker of blockerCounts.slice(0, 3)) {
      lines.push(`- ${blocker.blocker} (${blocker.agreementCount}/${responses.length})`);
    }
    lines.push("");
  }

  if (disagreements.length > 0) {
    lines.push("**Disagreements:**");
    for (const disagreement of disagreements) {
      lines.push(`- ${disagreement.description}`);
    }
    lines.push("");
  }

  lines.push("**Models Consulted:**");
  for (const response of responses) {
    lines.push(`- ${response.model} (${response.family} family)`);
  }

  return {
    mode: "structured",
    disagreements,
    commonPoints,
    commonRisks,
    blockerCounts,
    recommendedActions: actionEntries,
    confidence,
    summary: lines.join("\n")
  };
}

function extractAssertions(response) {
  const assertions = [];
  const sentences = response.split(/[.!?]+/).filter((sentence) => sentence.trim().length > 10);
  const assertionPatterns = [
    /should\s+\w+/i,
    /must\s+\w+/i,
    /is\s+(a|the|an)\s+\w+/i,
    /cause(s|d)?\s+(by|of)/i,
    /because\s+/i,
    /the\s+problem\s+(is|was)/i,
    /the\s+(issue|error|bug)\s+(is|was)/i,
    /recommend\s+/i,
    /suggest\s+/i,
    /fix\s+(is|by|with)/i
  ];

  for (const sentence of sentences) {
    for (const pattern of assertionPatterns) {
      if (pattern.test(sentence)) {
        assertions.push(sentence.trim());
        break;
      }
    }
  }

  return assertions;
}

function findContradictions(responses) {
  const contradictions = [];
  const contradictionPatterns = [
    { positive: /should\s+use/i, negative: /should\s+not\s+use|shouldn't\s+use/i },
    { positive: /is\s+correct/i, negative: /is\s+(incorrect|wrong)/i },
    { positive: /is\s+safe/i, negative: /is\s+(unsafe|dangerous)/i },
    { positive: /will\s+work/i, negative: /will\s+not\s+work|won't\s+work/i },
    { positive: /is\s+necessary/i, negative: /is\s+(unnecessary|not\s+necessary)/i }
  ];

  for (let i = 0; i < responses.length; i++) {
    for (let j = i + 1; j < responses.length; j++) {
      const resp1 = responses[i].response.toLowerCase();
      const resp2 = responses[j].response.toLowerCase();

      for (const { positive, negative } of contradictionPatterns) {
        const r1HasPositive = positive.test(resp1);
        const r1HasNegative = negative.test(resp1);
        const r2HasPositive = positive.test(resp2);
        const r2HasNegative = negative.test(resp2);

        if ((r1HasPositive && r2HasNegative) || (r1HasNegative && r2HasPositive)) {
          contradictions.push({
            type: "semantic",
            models: [responses[i].model, responses[j].model],
            description: `Disagreement on: ${positive.source.replace(/\\s\+/g, " ")}`
          });
        }
      }
    }
  }

  return contradictions;
}

function analyzeLegacyResponses(responses) {
  const disagreements = [];
  const allAssertions = responses.flatMap((response) => extractAssertions(response.response));
  const assertionCounts = tallyNormalized(allAssertions);
  const majority = Math.ceil(responses.length / 2);
  const commonPoints = Object.entries(assertionCounts)
    .filter(([, count]) => count >= majority)
    .map(([assertion, agreementCount]) => ({
      assertion,
      agreementCount,
      totalModels: responses.length
    }));

  disagreements.push(...findContradictions(responses));

  const agreementRatio = commonPoints.length / Math.max(allAssertions.length, 1);
  const disagreementPenalty = disagreements.length * 0.1;
  const confidence = Math.max(0, Math.min(1, agreementRatio - disagreementPenalty));

  const lines = [];
  lines.push(`Consensus from ${responses.length} models (confidence: ${(confidence * 100).toFixed(0)}%)`);
  lines.push("");

  if (commonPoints.length > 0) {
    lines.push("**Agreement Points:**");
    for (const point of commonPoints.slice(0, 5)) {
      lines.push(`- ${point.assertion.substring(0, 120)} (${point.agreementCount}/${point.totalModels})`);
    }
    lines.push("");
  }

  if (disagreements.length > 0) {
    lines.push("**Disagreements:**");
    for (const disagreement of disagreements.slice(0, 3)) {
      lines.push(`- ${disagreement.models.join(" vs ")}: ${disagreement.description}`);
    }
    lines.push("");
  }

  lines.push("**Models Consulted:**");
  for (const response of responses) {
    lines.push(`- ${response.model} (${response.family} family)`);
  }

  return {
    mode: "legacy",
    disagreements,
    commonPoints,
    confidence,
    summary: lines.join("\n")
  };
}

function buildConsensusPrompt(prompt, responseFormat) {
  if (responseFormat === "raw") {
    return prompt;
  }

  return `${prompt}\n\n---\n${STRUCTURED_CONSENSUS_INSTRUCTIONS}`;
}

/**
 * Build consensus from multiple models.
 */
export async function buildConsensus(prompt, models, options = {}) {
  const {
    system = null,
    maxTokens = 4096,
    operation = "analyze",
    responseFormat = "structured",
    securityContext = {}
  } = options;

  // Normalize models to array (handles string JSON, comma-separated, or array)
  let normalizedModels;
  if (Array.isArray(models)) {
    normalizedModels = models;
  } else if (typeof models === "string") {
    // Try JSON parse first, then comma-separated
    try {
      normalizedModels = JSON.parse(models);
      if (!Array.isArray(normalizedModels)) normalizedModels = [normalizedModels];
    } catch {
      normalizedModels = models.split(",").map(m => m.trim()).filter(Boolean);
    }
  } else {
    normalizedModels = [];
  }

  const externalModels = normalizedModels.filter((model) => model !== "claude");

  if (externalModels.length === 0) {
    return {
      success: false,
      error: "No external models to query (claude is native)"
    };
  }

  emitProgress(PROGRESS_EVENTS.CONSENSUS, {
    phase: "start",
    models: externalModels,
    promptLength: prompt.length,
    responseFormat
  });

  const consensusPrompt = buildConsensusPrompt(prompt, responseFormat);
  const results = await Promise.allSettled(
    externalModels.map(async (model) => {
      const result = await callModel(model, consensusPrompt, system, maxTokens, { operation, securityContext });
      const parsed = responseFormat === "structured"
        ? parseStructuredConsensusResponse(result.text)
        : { success: false, error: "raw mode" };

      return {
        model,
        response: result.text,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        family: getModelFamily(model).family,
        structured: parsed.success ? parsed.data : null,
        parseError: parsed.success ? null : parsed.error
      };
    })
  );

  const responses = [];
  const errors = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") {
      responses.push(result.value);
    } else {
      errors.push({
        model: externalModels[i],
        error: result.reason.message
      });
    }
  }

  if (responses.length === 0) {
    emitProgress(PROGRESS_EVENTS.CONSENSUS, {
      phase: "failed",
      errors
    });

    return {
      success: false,
      error: "All models failed",
      errors
    };
  }

  const structuredResponses = responses.filter((response) => response.structured);
  const analysis = structuredResponses.length >= Math.ceil(responses.length / 2)
    ? analyzeStructuredResponses(structuredResponses)
    : analyzeLegacyResponses(responses);

  emitProgress(PROGRESS_EVENTS.CONSENSUS, {
    phase: "complete",
    modelCount: responses.length,
    confidence: analysis.confidence,
    disagreements: analysis.disagreements.length,
    analysisMode: analysis.mode
  });

  return {
    success: true,
    modelCount: responses.length,
    responses,
    errors,
    disagreements: analysis.disagreements,
    commonPoints: analysis.commonPoints,
    confidence: analysis.confidence,
    summary: analysis.summary,
    analysisMode: analysis.mode,
    structuredResponses: structuredResponses.length
  };
}

/**
 * Quick vote on a yes/no question.
 */
export async function quickVote(question, models, options = {}) {
  const { system = "Answer with YES or NO only, then briefly explain." } = options;

  const result = await buildConsensus(question, models, {
    ...options,
    system,
    responseFormat: "raw"
  });

  if (!result.success) {
    return result;
  }

  let yesVotes = 0;
  let noVotes = 0;
  const votes = [];

  for (const response of result.responses) {
    const lower = response.response.toLowerCase();
    const isYes = /^yes\b|^\*\*yes\*\*|^definitely yes/i.test(lower);
    const isNo = /^no\b|^\*\*no\*\*|^definitely no/i.test(lower);

    if (isYes) {
      yesVotes++;
      votes.push({ model: response.model, vote: "YES", reasoning: response.response.substring(0, 200) });
    } else if (isNo) {
      noVotes++;
      votes.push({ model: response.model, vote: "NO", reasoning: response.response.substring(0, 200) });
    } else {
      votes.push({ model: response.model, vote: "UNCLEAR", reasoning: response.response.substring(0, 200) });
    }
  }

  const decision = yesVotes > noVotes ? "YES" : noVotes > yesVotes ? "NO" : "SPLIT";

  return {
    success: true,
    decision,
    yesVotes,
    noVotes,
    totalVotes: result.responses.length,
    votes,
    confidence: Math.abs(yesVotes - noVotes) / Math.max(result.responses.length, 1)
  };
}

// ============================================================================
// Smart Consensus - Auto-Escalation to Full Council
// ============================================================================

import { runCouncil, fullCouncil } from "./council.js";

/**
 * Smart consensus that automatically escalates to full council when needed.
 *
 * Starts with quick single-pass consensus. If disagreement is high or
 * confidence is low, automatically escalates to full 3-stage council.
 *
 * @param {string} prompt - The question/task
 * @param {string[]} models - Models to query
 * @param {Object} options - Configuration options
 * @param {boolean} options.autoEscalate - Enable auto-escalation (default: true)
 * @param {number} options.escalateThreshold - Disagreement count to trigger escalation (default: 2)
 * @param {number} options.minConfidence - Minimum confidence before escalation (default: 0.6)
 * @returns {Promise<Object>} Consensus result
 */
export async function smartConsensus(prompt, models, options = {}) {
  const {
    autoEscalate = true,
    escalateThreshold = 2,
    minConfidence = 0.6,
    ...restOptions
  } = options;

  // First try quick consensus
  const quickResult = await buildConsensus(prompt, models, restOptions);

  if (!quickResult.success) {
    return quickResult;
  }

  // Check if we should escalate
  const shouldEscalate = autoEscalate && (
    quickResult.disagreements.length >= escalateThreshold ||
    quickResult.confidence < minConfidence
  );

  if (!shouldEscalate) {
    return {
      ...quickResult,
      escalated: false,
      protocol: "single-pass"
    };
  }

  // Escalate to full council
  emitProgress(PROGRESS_EVENTS.CONSENSUS, {
    phase: "escalating",
    reason: quickResult.disagreements.length >= escalateThreshold
      ? `High disagreement (${quickResult.disagreements.length})`
      : `Low confidence (${(quickResult.confidence * 100).toFixed(0)}%)`,
    initialConfidence: quickResult.confidence
  });

  const councilResult = await fullCouncil(prompt, {
    models,
    ...restOptions
  });

  return {
    ...councilResult,
    escalated: true,
    protocol: "full-council",
    initialResult: {
      confidence: quickResult.confidence,
      disagreements: quickResult.disagreements.length
    }
  };
}

/**
 * Enhanced buildConsensus with council mode support
 *
 * @param {string} prompt - The question/task
 * @param {string[]} models - Models to query
 * @param {Object} options - Configuration options
 * @param {string} options.councilMode - "quick" | "standard" | "full" | "auto" | null
 * @returns {Promise<Object>} Consensus result
 */
export async function buildConsensusEnhanced(prompt, models, options = {}) {
  const { councilMode = null, ...restOptions } = options;

  // If council mode specified, use council
  if (councilMode) {
    if (councilMode === "auto") {
      return smartConsensus(prompt, models, restOptions);
    }
    return runCouncil(prompt, { models, mode: councilMode, ...restOptions });
  }

  // Default to legacy single-pass
  return buildConsensus(prompt, models, restOptions);
}
