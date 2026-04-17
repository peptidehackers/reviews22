/**
 * Consensus Engine - Compare multiple model responses and detect disagreement
 */

import { callModel } from "./fallback.js";
import { getModelFamily } from "./models.js";
import { emitProgress, PROGRESS_EVENTS } from "./session.js";

/**
 * Build consensus from multiple models
 */
export async function buildConsensus(prompt, models, options = {}) {
  const { system = null, maxTokens = 4096, operation = "analyze" } = options;

  // Filter out claude (native model)
  const externalModels = models.filter(m => m !== "claude");

  if (externalModels.length === 0) {
    return {
      success: false,
      error: "No external models to query (claude is native)"
    };
  }

  emitProgress(PROGRESS_EVENTS.CONSENSUS, {
    phase: "start",
    models: externalModels,
    promptLength: prompt.length
  });

  // Parallel execution
  const results = await Promise.allSettled(
    externalModels.map(async (model) => {
      const result = await callModel(model, prompt, system, maxTokens, { operation });
      return {
        model,
        response: result.text,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        family: getModelFamily(model).family
      };
    })
  );

  // Process results
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

  // Analyze responses
  const analysis = analyzeResponses(responses);

  emitProgress(PROGRESS_EVENTS.CONSENSUS, {
    phase: "complete",
    modelCount: responses.length,
    confidence: analysis.confidence,
    disagreements: analysis.disagreements.length
  });

  return {
    success: true,
    modelCount: responses.length,
    responses,
    errors,
    disagreements: analysis.disagreements,
    commonPoints: analysis.commonPoints,
    confidence: analysis.confidence,
    summary: analysis.summary
  };
}

/**
 * Analyze responses for agreement/disagreement
 */
function analyzeResponses(responses) {
  const disagreements = [];
  const commonPoints = [];

  // Extract key assertions from each response
  const assertions = responses.map(r => extractAssertions(r.response));

  // Find common assertions
  const allAssertions = assertions.flat();
  const assertionCounts = {};

  for (const assertion of allAssertions) {
    const normalized = normalizeAssertion(assertion);
    assertionCounts[normalized] = (assertionCounts[normalized] || 0) + 1;
  }

  // Assertions that appear in majority are common points
  const majority = Math.ceil(responses.length / 2);

  for (const [assertion, count] of Object.entries(assertionCounts)) {
    if (count >= majority) {
      commonPoints.push({ assertion, agreementCount: count, totalModels: responses.length });
    }
  }

  // Find contradictions
  const contradictions = findContradictions(assertions, responses);
  disagreements.push(...contradictions);

  // Calculate confidence
  const agreementRatio = commonPoints.length / Math.max(allAssertions.length, 1);
  const disagreementPenalty = disagreements.length * 0.1;
  const confidence = Math.max(0, Math.min(1, agreementRatio - disagreementPenalty));

  // Generate summary
  const summary = generateConsensusSummary(responses, commonPoints, disagreements, confidence);

  return { disagreements, commonPoints, confidence, summary };
}

/**
 * Extract key assertions from a response
 */
function extractAssertions(response) {
  const assertions = [];

  // Split into sentences
  const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 10);

  // Look for assertion patterns
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

/**
 * Normalize an assertion for comparison
 */
function normalizeAssertion(assertion) {
  return assertion
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "")
    .trim()
    .substring(0, 100); // Truncate for comparison
}

/**
 * Find contradictions between model responses
 */
function findContradictions(assertions, responses) {
  const contradictions = [];

  // Look for explicit contradictions
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

/**
 * Generate human-readable consensus summary
 */
function generateConsensusSummary(responses, commonPoints, disagreements, confidence) {
  const lines = [];

  // Overview
  lines.push(`Consensus from ${responses.length} models (confidence: ${(confidence * 100).toFixed(0)}%)`);
  lines.push("");

  // Common points
  if (commonPoints.length > 0) {
    lines.push("**Agreement Points:**");
    for (const point of commonPoints.slice(0, 5)) {
      lines.push(`- ${point.assertion.substring(0, 100)}... (${point.agreementCount}/${point.totalModels} models)`);
    }
    lines.push("");
  }

  // Disagreements
  if (disagreements.length > 0) {
    lines.push("**Disagreements:**");
    for (const dis of disagreements.slice(0, 3)) {
      lines.push(`- ${dis.models.join(" vs ")}: ${dis.description}`);
    }
    lines.push("");
  }

  // Model participation
  lines.push("**Models Consulted:**");
  for (const resp of responses) {
    lines.push(`- ${resp.model} (${resp.family} family)`);
  }

  return lines.join("\n");
}

/**
 * Quick vote on a yes/no question
 */
export async function quickVote(question, models, options = {}) {
  const { system = "Answer with YES or NO only, then briefly explain." } = options;

  const result = await buildConsensus(question, models, { ...options, system });

  if (!result.success) {
    return result;
  }

  // Count yes/no votes
  let yesVotes = 0;
  let noVotes = 0;
  const votes = [];

  for (const resp of result.responses) {
    const lower = resp.response.toLowerCase();
    const isYes = /^yes\b|^\*\*yes\*\*|^definitely yes/i.test(lower);
    const isNo = /^no\b|^\*\*no\*\*|^definitely no/i.test(lower);

    if (isYes) {
      yesVotes++;
      votes.push({ model: resp.model, vote: "YES", reasoning: resp.response.substring(0, 200) });
    } else if (isNo) {
      noVotes++;
      votes.push({ model: resp.model, vote: "NO", reasoning: resp.response.substring(0, 200) });
    } else {
      votes.push({ model: resp.model, vote: "UNCLEAR", reasoning: resp.response.substring(0, 200) });
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
