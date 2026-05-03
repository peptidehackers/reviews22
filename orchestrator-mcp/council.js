/**
 * @fileoverview LLM Council - 3-Stage Multi-Model Consensus Protocol
 *
 * Inspired by Karpathy's llm-council but deeply integrated with the orchestrator
 * infrastructure (MCP, Mem0, cost tracking, security).
 *
 * Architecture:
 *   Stage 1: Initial Responses   - All council members answer independently
 *   Stage 2: Peer Review         - Anonymous cross-evaluation with bias prevention
 *   Stage 3: Chairman Synthesis  - Designated model consolidates into final answer
 *
 * Key improvements over single-pass consensus:
 *   - Peer review catches blind spots individual models miss
 *   - Anonymization prevents model-brand bias in evaluation
 *   - Chairman synthesis produces unified, high-quality output
 *   - Full trace storage for debugging and learning
 *
 * @module council
 * @see {@link https://github.com/karpathy/llm-council|Original llm-council}
 */

import { callModel } from "./fallback.js";
import { getModelFamily, LLM_COUNCIL_MODELS, LLM_COUNCIL_CHAIRMAN } from "./models.js";
import { emitProgress, PROGRESS_EVENTS, logConsensusRun } from "./session.js";
import { loadConfig } from "./config-loader.js";
import { trackUsage } from "./cost.js";

// ============================================================================
// Configuration
// ============================================================================

/** @type {Object} Default council configuration */
const DEFAULT_COUNCIL_CONFIG = {
  // Council modes
  modes: {
    quick: {
      skipPeerReview: true,
      skipChairman: true,
      maxModels: 3,
      description: "Fast single-pass consensus (existing behavior)"
    },
    standard: {
      skipPeerReview: false,
      skipChairman: true,
      maxModels: 5,
      description: "Adds peer review for disagreement detection"
    },
    full: {
      skipPeerReview: false,
      skipChairman: false,
      maxModels: 8,
      description: "Complete 3-stage protocol with chairman synthesis"
    }
  },

  // Anonymization settings
  anonymization: {
    enabled: true,
    labels: ["Analyst A", "Analyst B", "Analyst C", "Analyst D", "Analyst E", "Analyst F", "Analyst G", "Analyst H"],
    shuffleSeed: true
  },

  // Peer review settings
  peerReview: {
    maxReviewsPerModel: 4,
    evaluationCriteria: ["accuracy", "completeness", "reasoning", "actionability"],
    requireRankings: true,
    confidenceThreshold: 0.6
  },

  // Chairman settings
  chairman: {
    model: "gemini3pro",
    fallbackChain: ["claude45", "gpt54", "deepseek"],
    synthesisStyle: "integrative",
    includeMinorityViews: true,
    maxSynthesisTokens: 8192
  },

  // Timeouts
  timeouts: {
    initialResponse: 60000,
    peerReview: 45000,
    chairmanSynthesis: 90000
  }
};

/**
 * Load council configuration, merging with defaults
 */
function loadCouncilConfig() {
  try {
    const config = loadConfig("council.json");
    return { ...DEFAULT_COUNCIL_CONFIG, ...config };
  } catch {
    return DEFAULT_COUNCIL_CONFIG;
  }
}

// ============================================================================
// Structured Response Schemas
// ============================================================================

const INITIAL_RESPONSE_SCHEMA = `Return JSON only:
{
  "summary": "1-2 sentence summary",
  "key_claims": ["claim1", "claim2"],
  "risks": ["risk1", "risk2"],
  "recommended_action": "single clear recommendation",
  "blockers": ["blocker1"],
  "confidence": 0.0-1.0,
  "reasoning_chain": ["step1", "step2", "step3"],
  "evidence": ["evidence1", "evidence2"],
  "alternatives_considered": ["alt1", "alt2"]
}`;

const PEER_REVIEW_SCHEMA = `You are reviewing responses from other analysts to the same question.
Their identities are hidden to prevent bias.

Return JSON only:
{
  "rankings": [
    {"analyst": "Analyst X", "rank": 1, "score": 0.0-1.0, "strengths": ["s1"], "weaknesses": ["w1"]}
  ],
  "best_insights": ["insight1", "insight2"],
  "critical_gaps": ["gap1", "gap2"],
  "contradictions_found": ["contradiction1"],
  "synthesis_recommendation": "how to combine the best parts",
  "confidence_in_review": 0.0-1.0
}`;

const CHAIRMAN_SYNTHESIS_SCHEMA = `You are the Chairman synthesizing multiple expert analyses and peer reviews.

Return JSON only:
{
  "final_summary": "comprehensive summary integrating all views",
  "consensus_recommendation": "the unified recommended action",
  "key_findings": ["finding1", "finding2"],
  "resolved_disagreements": [
    {"issue": "what they disagreed on", "resolution": "how you resolved it", "rationale": "why"}
  ],
  "minority_views": [
    {"view": "the minority position", "merit": "why it has value", "when_applicable": "conditions"}
  ],
  "risks_and_mitigations": [
    {"risk": "identified risk", "mitigation": "how to address it"}
  ],
  "confidence": 0.0-1.0,
  "action_items": ["action1", "action2"],
  "rationale": "explanation of synthesis approach"
}`;

// ============================================================================
// 4-Perspective Review Schema (claude-code-harness pattern)
// ============================================================================

/**
 * Multi-perspective review lenses for comprehensive analysis.
 * Each lens focuses on a specific aspect of code quality.
 */
export const REVIEW_PERSPECTIVES = {
  SECURITY: {
    name: "Security",
    focus: "Vulnerabilities, injection points, auth gaps, data exposure",
    schema: `Analyze from a SECURITY perspective:
- Injection risks (SQL, XSS, command, etc.)
- Authentication/authorization gaps
- Data exposure or leakage
- Secrets handling issues
- Input validation weaknesses
Return JSON: {"severity": "high|medium|low", "findings": [...], "recommendations": [...]}`
  },
  PERFORMANCE: {
    name: "Performance",
    focus: "Bottlenecks, memory issues, scaling concerns, efficiency",
    schema: `Analyze from a PERFORMANCE perspective:
- Algorithmic complexity (O(n²) or worse)
- Memory leaks or excessive allocation
- Database query inefficiency (N+1, missing indexes)
- Caching opportunities missed
- Scalability limitations
Return JSON: {"severity": "high|medium|low", "findings": [...], "recommendations": [...]}`
  },
  QUALITY: {
    name: "Quality",
    focus: "Code patterns, naming, maintainability, readability",
    schema: `Analyze from a CODE QUALITY perspective:
- Unclear or misleading naming
- Overly complex functions (cyclomatic complexity)
- Code duplication
- Poor separation of concerns
- Missing error handling
Return JSON: {"severity": "high|medium|low", "findings": [...], "recommendations": [...]}`
  },
  RELIABILITY: {
    name: "Reliability",
    focus: "Edge cases, error handling, test coverage, race conditions",
    schema: `Analyze from a RELIABILITY perspective:
- Unhandled edge cases
- Race conditions or concurrency issues
- Missing error handling
- Insufficient validation
- Test coverage gaps
Return JSON: {"severity": "high|medium|low", "findings": [...], "recommendations": [...]}`
  }
};

/**
 * 4-perspective synthesis schema for chairman.
 * Integrates findings from all four lenses.
 */
const MULTI_PERSPECTIVE_SYNTHESIS_SCHEMA = `You are synthesizing analyses from 4 expert perspectives: Security, Performance, Quality, and Reliability.

Return JSON only:
{
  "overall_assessment": "high-level summary across all perspectives",
  "security_summary": {
    "severity": "high|medium|low|none",
    "top_concerns": ["concern1"],
    "action_required": true|false
  },
  "performance_summary": {
    "severity": "high|medium|low|none",
    "top_concerns": ["concern1"],
    "action_required": true|false
  },
  "quality_summary": {
    "severity": "high|medium|low|none",
    "top_concerns": ["concern1"],
    "action_required": true|false
  },
  "reliability_summary": {
    "severity": "high|medium|low|none",
    "top_concerns": ["concern1"],
    "action_required": true|false
  },
  "priority_order": ["Security", "Reliability", "Performance", "Quality"],
  "blocking_issues": ["issue that must be fixed before merge"],
  "recommended_actions": [
    {"perspective": "Security", "action": "what to do", "priority": 1}
  ],
  "confidence": 0.0-1.0
}`;

// ============================================================================
// Anonymization Utilities
// ============================================================================

/**
 * Create anonymized model mapping
 * @param {string[]} models - List of model names
 * @param {Object} config - Council configuration
 * @returns {Object} Mapping of model to anonymous label and vice versa
 */
function createAnonymousMapping(models, config) {
  const labels = [...config.anonymization.labels];

  // Optionally shuffle for additional randomization
  if (config.anonymization.shuffleSeed) {
    for (let i = labels.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [labels[i], labels[j]] = [labels[j], labels[i]];
    }
  }

  const modelToLabel = {};
  const labelToModel = {};

  models.forEach((model, index) => {
    const label = labels[index % labels.length];
    modelToLabel[model] = label;
    labelToModel[label] = model;
  });

  return { modelToLabel, labelToModel };
}

/**
 * Anonymize a response by replacing model name with label
 * @param {Object} response - Response object with model field
 * @param {Object} mapping - Anonymization mapping
 * @returns {Object} Anonymized response copy
 */
function anonymizeResponse(response, mapping) {
  return {
    ...response,
    originalModel: response.model,
    model: mapping.modelToLabel[response.model] || "Unknown Analyst",
    anonymized: true
  };
}

// ============================================================================
// Stage 1: Initial Responses
// ============================================================================

/**
 * Collect initial responses from all council members in parallel
 * @param {string} prompt - The question/task for the council
 * @param {string[]} models - Models to query
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} Stage 1 results
 */
async function collectInitialResponses(prompt, models, options = {}) {
  const {
    system = null,
    maxTokens = 4096,
    operation = "analyze",
    securityContext = {}
  } = options;

  emitProgress(PROGRESS_EVENTS.CONSENSUS, {
    phase: "stage1_start",
    stage: "initial_responses",
    models,
    promptLength: prompt.length
  });

  const fullPrompt = `${prompt}\n\n---\n${INITIAL_RESPONSE_SCHEMA}`;

  const startTime = Date.now();
  const results = await Promise.allSettled(
    models.map(async (model) => {
      const result = await callModel(model, fullPrompt, system, maxTokens, {
        operation,
        securityContext
      });

      return {
        model,
        family: getModelFamily(model).family,
        response: result.text,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        timestamp: Date.now()
      };
    })
  );

  const responses = [];
  const errors = [];

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      const parsed = parseCouncilResponse(result.value.response);
      responses.push({
        ...result.value,
        structured: parsed.success ? parsed.data : null,
        parseError: parsed.success ? null : parsed.error
      });
    } else {
      errors.push({
        model: models[index],
        error: result.reason?.message || "Unknown error"
      });
    }
  });

  emitProgress(PROGRESS_EVENTS.CONSENSUS, {
    phase: "stage1_complete",
    responseCount: responses.length,
    errorCount: errors.length,
    durationMs: Date.now() - startTime
  });

  return {
    stage: 1,
    name: "initial_responses",
    responses,
    errors,
    durationMs: Date.now() - startTime
  };
}

// ============================================================================
// Stage 2: Peer Review
// ============================================================================

/**
 * Build peer review prompt for a model to evaluate other responses
 * @param {string} originalPrompt - The original question
 * @param {Object[]} allResponses - All anonymized responses
 * @param {string} reviewerLabel - The reviewer's anonymous label
 * @returns {string} Formatted peer review prompt
 */
function buildPeerReviewPrompt(originalPrompt, allResponses, reviewerLabel) {
  const otherResponses = allResponses.filter(r => r.model !== reviewerLabel);

  const formattedResponses = otherResponses.map((r, i) => {
    const content = r.structured
      ? JSON.stringify(r.structured, null, 2)
      : r.response.substring(0, 2000);
    return `### ${r.model}\n\`\`\`json\n${content}\n\`\`\``;
  }).join("\n\n");

  return `# Original Question
${originalPrompt}

# Responses from Other Analysts
(Your identity is ${reviewerLabel} - do not reveal which model you are)

${formattedResponses}

# Your Task
Review these responses objectively. Rank them by quality and identify:
1. The best insights that should be preserved
2. Critical gaps or errors that need addressing
3. Any contradictions between responses
4. How to synthesize the best parts

${PEER_REVIEW_SCHEMA}`;
}

/**
 * Conduct peer review stage
 * @param {string} originalPrompt - The original question
 * @param {Object} stage1Results - Results from stage 1
 * @param {Object} config - Council configuration
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Stage 2 results
 */
async function conductPeerReview(originalPrompt, stage1Results, config, options = {}) {
  const { system = null, maxTokens = 4096, operation = "analyze", securityContext = {} } = options;

  // Create anonymization mapping
  const models = stage1Results.responses.map(r => r.model);
  const mapping = createAnonymousMapping(models, config);

  // Anonymize all stage 1 responses
  const anonymizedResponses = stage1Results.responses.map(r =>
    anonymizeResponse(r, mapping)
  );

  emitProgress(PROGRESS_EVENTS.CONSENSUS, {
    phase: "stage2_start",
    stage: "peer_review",
    reviewerCount: anonymizedResponses.length,
    anonymizationEnabled: config.anonymization.enabled
  });

  const startTime = Date.now();

  // Each model reviews the others
  const reviewPromises = anonymizedResponses.map(async (reviewer) => {
    const reviewerLabel = reviewer.model;
    const reviewPrompt = buildPeerReviewPrompt(originalPrompt, anonymizedResponses, reviewerLabel);

    try {
      const result = await callModel(
        reviewer.originalModel,
        reviewPrompt,
        system || "You are a critical but fair peer reviewer. Be objective and constructive.",
        maxTokens,
        { operation, securityContext }
      );

      const parsed = parsePeerReviewResponse(result.text);

      return {
        reviewer: reviewer.originalModel,
        reviewerLabel,
        response: result.text,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        structured: parsed.success ? parsed.data : null,
        parseError: parsed.success ? null : parsed.error
      };
    } catch (error) {
      return {
        reviewer: reviewer.originalModel,
        reviewerLabel,
        error: error.message
      };
    }
  });

  const results = await Promise.allSettled(reviewPromises);

  const reviews = [];
  const errors = [];

  results.forEach((result) => {
    if (result.status === "fulfilled" && !result.value.error) {
      reviews.push(result.value);
    } else {
      errors.push(result.value || { error: result.reason?.message });
    }
  });

  // Aggregate peer review findings
  const aggregation = aggregatePeerReviews(reviews, mapping);

  emitProgress(PROGRESS_EVENTS.CONSENSUS, {
    phase: "stage2_complete",
    reviewCount: reviews.length,
    errorCount: errors.length,
    topRankedModel: aggregation.topRanked,
    durationMs: Date.now() - startTime
  });

  return {
    stage: 2,
    name: "peer_review",
    reviews,
    errors,
    aggregation,
    anonymizationMapping: mapping,
    durationMs: Date.now() - startTime
  };
}

/**
 * Aggregate findings from all peer reviews
 * @param {Object[]} reviews - All peer review results
 * @param {Object} mapping - Anonymization mapping
 * @returns {Object} Aggregated peer review analysis
 */
function aggregatePeerReviews(reviews, mapping) {
  const rankingScores = {};
  const allInsights = [];
  const allGaps = [];
  const allContradictions = [];
  const synthesisRecommendations = [];

  reviews.forEach((review) => {
    if (!review.structured) return;

    const { rankings, best_insights, critical_gaps, contradictions_found, synthesis_recommendation } = review.structured;

    // Aggregate rankings
    if (Array.isArray(rankings)) {
      rankings.forEach((rank) => {
        const model = mapping.labelToModel[rank.analyst] || rank.analyst;
        if (!rankingScores[model]) {
          rankingScores[model] = { totalScore: 0, count: 0, ranks: [] };
        }
        rankingScores[model].totalScore += rank.score || 0;
        rankingScores[model].count += 1;
        rankingScores[model].ranks.push(rank.rank);
      });
    }

    // Collect insights
    if (Array.isArray(best_insights)) {
      allInsights.push(...best_insights);
    }

    // Collect gaps
    if (Array.isArray(critical_gaps)) {
      allGaps.push(...critical_gaps);
    }

    // Collect contradictions
    if (Array.isArray(contradictions_found)) {
      allContradictions.push(...contradictions_found);
    }

    // Collect synthesis recommendations
    if (synthesis_recommendation) {
      synthesisRecommendations.push(synthesis_recommendation);
    }
  });

  // Calculate average scores and determine rankings
  const modelRankings = Object.entries(rankingScores)
    .map(([model, data]) => ({
      model,
      averageScore: data.count > 0 ? data.totalScore / data.count : 0,
      averageRank: data.ranks.length > 0
        ? data.ranks.reduce((a, b) => a + b, 0) / data.ranks.length
        : 999,
      reviewCount: data.count
    }))
    .sort((a, b) => b.averageScore - a.averageScore);

  // Deduplicate and count insights/gaps
  const insightCounts = countOccurrences(allInsights);
  const gapCounts = countOccurrences(allGaps);
  const contradictionCounts = countOccurrences(allContradictions);

  return {
    modelRankings,
    topRanked: modelRankings[0]?.model || null,
    consensusInsights: Object.entries(insightCounts)
      .filter(([, count]) => count > 1)
      .map(([insight, count]) => ({ insight, mentionedBy: count })),
    consensusGaps: Object.entries(gapCounts)
      .filter(([, count]) => count > 1)
      .map(([gap, count]) => ({ gap, mentionedBy: count })),
    contradictions: Object.entries(contradictionCounts)
      .map(([contradiction, count]) => ({ contradiction, mentionedBy: count })),
    synthesisRecommendations,
    reviewerAgreement: calculateReviewerAgreement(reviews)
  };
}

/**
 * Count normalized occurrences of items
 */
function countOccurrences(items) {
  const counts = {};
  items.forEach((item) => {
    const normalized = String(item).toLowerCase().trim().substring(0, 200);
    if (normalized) {
      counts[normalized] = (counts[normalized] || 0) + 1;
    }
  });
  return counts;
}

/**
 * Calculate how much reviewers agree with each other
 */
function calculateReviewerAgreement(reviews) {
  const validReviews = reviews.filter(r => r.structured?.rankings?.length > 0);
  if (validReviews.length < 2) return 1.0;

  // Compare top picks across reviewers
  const topPicks = validReviews.map(r => r.structured.rankings[0]?.analyst).filter(Boolean);
  const uniqueTopPicks = new Set(topPicks).size;

  // More agreement = fewer unique top picks
  return 1 - (uniqueTopPicks - 1) / (validReviews.length - 1);
}

// ============================================================================
// Stage 3: Chairman Synthesis
// ============================================================================

/**
 * Build chairman synthesis prompt
 */
function buildChairmanPrompt(originalPrompt, stage1Results, stage2Results, config) {
  const initialResponses = stage1Results.responses.map((r, i) => {
    const content = r.structured
      ? JSON.stringify(r.structured, null, 2)
      : r.response.substring(0, 1500);
    return `### Model: ${r.model} (${r.family} family)\n\`\`\`json\n${content}\n\`\`\``;
  }).join("\n\n");

  const peerReviewSummary = stage2Results.aggregation;
  const rankingsText = peerReviewSummary.modelRankings
    .map((r, i) => `${i + 1}. ${r.model} (avg score: ${r.averageScore.toFixed(2)})`)
    .join("\n");

  const insightsText = peerReviewSummary.consensusInsights
    .map(i => `- ${i.insight} (mentioned by ${i.mentionedBy} reviewers)`)
    .join("\n");

  const gapsText = peerReviewSummary.consensusGaps
    .map(g => `- ${g.gap} (mentioned by ${g.mentionedBy} reviewers)`)
    .join("\n");

  const contradictionsText = peerReviewSummary.contradictions
    .map(c => `- ${c.contradiction}`)
    .join("\n");

  return `# Chairman Synthesis Task

You are the Chairman of an LLM Council. Multiple expert models have analyzed a question, and peers have reviewed each other's work. Your job is to synthesize everything into a unified, high-quality final answer.

## Original Question
${originalPrompt}

## Initial Responses
${initialResponses}

## Peer Review Summary

### Model Rankings (by peer consensus)
${rankingsText || "No rankings available"}

### Best Insights (mentioned by multiple reviewers)
${insightsText || "None identified"}

### Critical Gaps Identified
${gapsText || "None identified"}

### Contradictions Found
${contradictionsText || "None found"}

### Reviewer Agreement Level
${(peerReviewSummary.reviewerAgreement * 100).toFixed(0)}%

## Your Task
1. Synthesize the best elements from all responses
2. Resolve any contradictions with clear reasoning
3. Fill identified gaps where possible
4. ${config.chairman.includeMinorityViews ? "Preserve valuable minority views that might apply in specific contexts" : "Focus on majority consensus"}
5. Produce a final, actionable recommendation

${CHAIRMAN_SYNTHESIS_SCHEMA}`;
}

/**
 * Execute chairman synthesis
 */
async function executeChairmanSynthesis(originalPrompt, stage1Results, stage2Results, config, options = {}) {
  const { system = null, operation = "analyze", securityContext = {} } = options;

  const chairmanModel = config.chairman.model || LLM_COUNCIL_CHAIRMAN;
  const maxTokens = config.chairman.maxSynthesisTokens || 8192;

  emitProgress(PROGRESS_EVENTS.CONSENSUS, {
    phase: "stage3_start",
    stage: "chairman_synthesis",
    chairmanModel,
    initialResponseCount: stage1Results.responses.length,
    peerReviewCount: stage2Results.reviews.length
  });

  const startTime = Date.now();
  const synthesisPrompt = buildChairmanPrompt(originalPrompt, stage1Results, stage2Results, config);

  let result;
  let usedModel = chairmanModel;
  const fallbackChain = [chairmanModel, ...config.chairman.fallbackChain];

  for (const model of fallbackChain) {
    try {
      result = await callModel(
        model,
        synthesisPrompt,
        system || "You are the Chairman of an expert council. Synthesize with wisdom, clarity, and fairness.",
        maxTokens,
        { operation, securityContext }
      );
      usedModel = model;
      break;
    } catch (error) {
      emitProgress(PROGRESS_EVENTS.ERROR, {
        phase: "chairman_fallback",
        failedModel: model,
        error: error.message
      });

      if (model === fallbackChain[fallbackChain.length - 1]) {
        throw new Error(`All chairman models failed. Last error: ${error.message}`);
      }
    }
  }

  const parsed = parseChairmanResponse(result.text);

  emitProgress(PROGRESS_EVENTS.CONSENSUS, {
    phase: "stage3_complete",
    chairmanModel: usedModel,
    synthesisLength: result.text.length,
    parseSuccess: parsed.success,
    durationMs: Date.now() - startTime
  });

  return {
    stage: 3,
    name: "chairman_synthesis",
    chairmanModel: usedModel,
    response: result.text,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    structured: parsed.success ? parsed.data : null,
    parseError: parsed.success ? null : parsed.error,
    durationMs: Date.now() - startTime
  };
}

// ============================================================================
// Response Parsing
// ============================================================================

/**
 * Extract JSON from response text
 */
function extractJson(text) {
  if (!text || typeof text !== "string") return null;

  // Try fenced JSON first
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch { /* continue */ }
  }

  // Try raw JSON
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch { /* continue */ }
  }

  return null;
}

/**
 * Parse initial council response
 */
function parseCouncilResponse(text) {
  const parsed = extractJson(text);
  if (!parsed) {
    return { success: false, error: "No JSON found" };
  }

  // Validate required fields
  if (!parsed.recommended_action) {
    return { success: false, error: "Missing recommended_action" };
  }

  return {
    success: true,
    data: {
      summary: String(parsed.summary || "").trim(),
      key_claims: normalizeArray(parsed.key_claims),
      risks: normalizeArray(parsed.risks),
      recommended_action: String(parsed.recommended_action).trim(),
      blockers: normalizeArray(parsed.blockers),
      confidence: normalizeConfidence(parsed.confidence),
      reasoning_chain: normalizeArray(parsed.reasoning_chain),
      evidence: normalizeArray(parsed.evidence),
      alternatives_considered: normalizeArray(parsed.alternatives_considered),
      rationale: String(parsed.rationale || "").trim()
    }
  };
}

/**
 * Parse peer review response
 */
function parsePeerReviewResponse(text) {
  const parsed = extractJson(text);
  if (!parsed) {
    return { success: false, error: "No JSON found" };
  }

  return {
    success: true,
    data: {
      rankings: normalizeArray(parsed.rankings).map(r => ({
        analyst: String(r.analyst || ""),
        rank: Number(r.rank) || 999,
        score: normalizeConfidence(r.score),
        strengths: normalizeArray(r.strengths),
        weaknesses: normalizeArray(r.weaknesses)
      })),
      best_insights: normalizeArray(parsed.best_insights),
      critical_gaps: normalizeArray(parsed.critical_gaps),
      contradictions_found: normalizeArray(parsed.contradictions_found),
      synthesis_recommendation: String(parsed.synthesis_recommendation || "").trim(),
      confidence_in_review: normalizeConfidence(parsed.confidence_in_review)
    }
  };
}

/**
 * Parse chairman synthesis response
 */
function parseChairmanResponse(text) {
  const parsed = extractJson(text);
  if (!parsed) {
    return { success: false, error: "No JSON found" };
  }

  if (!parsed.consensus_recommendation) {
    return { success: false, error: "Missing consensus_recommendation" };
  }

  return {
    success: true,
    data: {
      final_summary: String(parsed.final_summary || "").trim(),
      consensus_recommendation: String(parsed.consensus_recommendation).trim(),
      key_findings: normalizeArray(parsed.key_findings),
      resolved_disagreements: normalizeArray(parsed.resolved_disagreements).map(d => ({
        issue: String(d.issue || ""),
        resolution: String(d.resolution || ""),
        rationale: String(d.rationale || "")
      })),
      minority_views: normalizeArray(parsed.minority_views).map(v => ({
        view: String(v.view || ""),
        merit: String(v.merit || ""),
        when_applicable: String(v.when_applicable || "")
      })),
      risks_and_mitigations: normalizeArray(parsed.risks_and_mitigations).map(r => ({
        risk: String(r.risk || ""),
        mitigation: String(r.mitigation || "")
      })),
      confidence: normalizeConfidence(parsed.confidence),
      action_items: normalizeArray(parsed.action_items),
      rationale: String(parsed.rationale || "").trim()
    }
  };
}

/**
 * Normalize array input
 */
function normalizeArray(value) {
  if (Array.isArray(value)) {
    return value.filter(v => v !== null && v !== undefined);
  }
  if (typeof value === "string" && value.trim()) {
    return value.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
  }
  return [];
}

/**
 * Normalize confidence to 0-1 range
 */
function normalizeConfidence(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0.5;
  return Math.max(0, Math.min(1, num));
}

// ============================================================================
// Main Council Execution
// ============================================================================

/**
 * Execute full LLM Council protocol
 *
 * @param {string} prompt - The question/task for the council
 * @param {Object} options - Configuration options
 * @param {string[]} options.models - Models to include (defaults to LLM_COUNCIL_MODELS)
 * @param {string} options.mode - Council mode: "quick" | "standard" | "full"
 * @param {string} options.system - Optional system prompt
 * @param {number} options.maxTokens - Max tokens per response
 * @param {string} options.operation - Security operation type
 * @param {Object} options.securityContext - Security context
 * @returns {Promise<Object>} Complete council results
 */
export async function runCouncil(prompt, options = {}) {
  const config = loadCouncilConfig();
  const {
    models = LLM_COUNCIL_MODELS.slice(0, 5),
    mode = "standard",
    system = null,
    maxTokens = 4096,
    operation = "analyze",
    securityContext = {}
  } = options;

  const modeConfig = config.modes[mode] || config.modes.standard;
  const activeModels = models.slice(0, modeConfig.maxModels);

  logConsensusRun({
    source: "council",
    mode,
    requestedModels: activeModels,
    operation
  });

  emitProgress(PROGRESS_EVENTS.CONSENSUS, {
    phase: "council_start",
    mode,
    modelCount: activeModels.length,
    skipPeerReview: modeConfig.skipPeerReview,
    skipChairman: modeConfig.skipChairman
  });

  const startTime = Date.now();
  const stages = [];

  // Stage 1: Initial Responses (always executed)
  const stage1 = await collectInitialResponses(prompt, activeModels, {
    system,
    maxTokens,
    operation,
    securityContext
  });
  stages.push(stage1);

  if (stage1.responses.length === 0) {
    return {
      success: false,
      error: "All models failed in Stage 1",
      mode,
      stages,
      errors: stage1.errors
    };
  }

  // Stage 2: Peer Review (unless skipped)
  let stage2 = null;
  if (!modeConfig.skipPeerReview && stage1.responses.length >= 2) {
    stage2 = await conductPeerReview(prompt, stage1, config, {
      system,
      maxTokens,
      operation,
      securityContext
    });
    stages.push(stage2);
  }

  // Stage 3: Chairman Synthesis (unless skipped)
  let stage3 = null;
  if (!modeConfig.skipChairman && stage2) {
    stage3 = await executeChairmanSynthesis(prompt, stage1, stage2, config, {
      system,
      operation,
      securityContext
    });
    stages.push(stage3);
  }

  // Build final result
  const result = buildCouncilResult(prompt, stages, mode, config, startTime);

  emitProgress(PROGRESS_EVENTS.CONSENSUS, {
    phase: "council_complete",
    mode,
    stageCount: stages.length,
    finalConfidence: result.confidence,
    durationMs: Date.now() - startTime
  });

  return result;
}

/**
 * Build final council result from all stages
 */
function buildCouncilResult(prompt, stages, mode, config, startTime) {
  const stage1 = stages.find(s => s.stage === 1);
  const stage2 = stages.find(s => s.stage === 2);
  const stage3 = stages.find(s => s.stage === 3);

  // Determine final recommendation
  let finalRecommendation;
  let confidence;
  let summary;

  if (stage3?.structured) {
    // Use chairman synthesis
    finalRecommendation = stage3.structured.consensus_recommendation;
    confidence = stage3.structured.confidence;
    summary = stage3.structured.final_summary;
  } else if (stage2?.aggregation) {
    // Use peer review aggregation
    const topModel = stage2.aggregation.topRanked;
    const topResponse = stage1.responses.find(r => r.model === topModel);
    finalRecommendation = topResponse?.structured?.recommended_action || "See individual responses";
    confidence = stage2.aggregation.reviewerAgreement * 0.8;
    summary = `Peer consensus favors ${topModel}'s approach`;
  } else if (stage1?.responses.length > 0) {
    // Fall back to highest-confidence initial response
    const sorted = stage1.responses
      .filter(r => r.structured)
      .sort((a, b) => (b.structured.confidence || 0) - (a.structured.confidence || 0));
    const best = sorted[0];
    finalRecommendation = best?.structured?.recommended_action || "See individual responses";
    confidence = best?.structured?.confidence || 0.5;
    summary = best?.structured?.summary || "";
  } else {
    finalRecommendation = "Unable to determine recommendation";
    confidence = 0;
    summary = "All models failed to produce valid responses";
  }

  // Collect all errors
  const allErrors = stages.flatMap(s => s.errors || []);

  // Calculate total tokens
  const totalTokens = stages.reduce((acc, stage) => {
    if (stage.responses) {
      stage.responses.forEach(r => {
        acc.input += r.inputTokens || 0;
        acc.output += r.outputTokens || 0;
      });
    }
    if (stage.reviews) {
      stage.reviews.forEach(r => {
        acc.input += r.inputTokens || 0;
        acc.output += r.outputTokens || 0;
      });
    }
    if (stage.inputTokens) acc.input += stage.inputTokens;
    if (stage.outputTokens) acc.output += stage.outputTokens;
    return acc;
  }, { input: 0, output: 0 });

  // Build summary text
  const summaryLines = [];
  summaryLines.push(`## LLM Council Result (${mode} mode)`);
  summaryLines.push("");
  summaryLines.push(`**Recommendation:** ${finalRecommendation}`);
  summaryLines.push(`**Confidence:** ${(confidence * 100).toFixed(0)}%`);
  summaryLines.push("");

  if (summary) {
    summaryLines.push(`**Summary:** ${summary}`);
    summaryLines.push("");
  }

  summaryLines.push(`### Stages Completed`);
  stages.forEach(s => {
    summaryLines.push(`- Stage ${s.stage}: ${s.name} (${s.durationMs}ms)`);
  });

  if (stage3?.structured?.key_findings?.length > 0) {
    summaryLines.push("");
    summaryLines.push("### Key Findings");
    stage3.structured.key_findings.slice(0, 5).forEach(f => {
      summaryLines.push(`- ${f}`);
    });
  }

  if (stage3?.structured?.minority_views?.length > 0) {
    summaryLines.push("");
    summaryLines.push("### Minority Views");
    stage3.structured.minority_views.slice(0, 3).forEach(v => {
      summaryLines.push(`- ${v.view}: ${v.merit}`);
    });
  }

  if (stage2?.aggregation?.contradictions?.length > 0) {
    summaryLines.push("");
    summaryLines.push("### Contradictions Identified");
    stage2.aggregation.contradictions.slice(0, 3).forEach(c => {
      summaryLines.push(`- ${c.contradiction}`);
    });
  }

  summaryLines.push("");
  summaryLines.push(`### Models Consulted`);
  (stage1?.responses || []).forEach(r => {
    summaryLines.push(`- ${r.model} (${r.family})`);
  });

  if (allErrors.length > 0) {
    summaryLines.push("");
    summaryLines.push(`### Errors (${allErrors.length})`);
    allErrors.slice(0, 3).forEach(e => {
      summaryLines.push(`- ${e.model || "Unknown"}: ${e.error}`);
    });
  }

  return {
    success: true,
    mode,
    recommendation: finalRecommendation,
    confidence,
    summary: summaryLines.join("\n"),

    // Detailed results
    stages,
    stage1: stage1 ? {
      responses: stage1.responses,
      errors: stage1.errors
    } : null,
    stage2: stage2 ? {
      aggregation: stage2.aggregation,
      reviews: stage2.reviews,
      anonymizationMapping: stage2.anonymizationMapping
    } : null,
    stage3: stage3 ? {
      synthesis: stage3.structured,
      chairmanModel: stage3.chairmanModel
    } : null,

    // Metadata
    totalTokens,
    allErrors,
    durationMs: Date.now() - startTime
  };
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick council - single pass, no peer review
 */
export async function quickCouncil(prompt, options = {}) {
  return runCouncil(prompt, { ...options, mode: "quick" });
}

/**
 * Standard council - with peer review, no chairman
 */
export async function standardCouncil(prompt, options = {}) {
  return runCouncil(prompt, { ...options, mode: "standard" });
}

/**
 * Full council - complete 3-stage protocol
 */
export async function fullCouncil(prompt, options = {}) {
  return runCouncil(prompt, { ...options, mode: "full" });
}

/**
 * Format council result for display
 */
export function formatCouncilResult(result) {
  if (!result.success) {
    return `Council failed: ${result.error}`;
  }
  return result.summary;
}

// ============================================================================
// Exports
// ============================================================================

export {
  collectInitialResponses,
  conductPeerReview,
  executeChairmanSynthesis,
  parseCouncilResponse,
  parsePeerReviewResponse,
  parseChairmanResponse,
  createAnonymousMapping,
  aggregatePeerReviews,
  buildCouncilResult,
  DEFAULT_COUNCIL_CONFIG
};
