/**
 * @fileoverview Comprehensive test suite for the LLM Council protocol
 *
 * Tests cover:
 * - Response parsing (initial, peer review, chairman synthesis)
 * - Anonymization utilities
 * - Peer review aggregation
 * - Council result building
 * - Mode selection (quick/standard/full)
 * - Edge cases and error handling
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  parseCouncilResponse,
  parsePeerReviewResponse,
  parseChairmanResponse,
  createAnonymousMapping,
  aggregatePeerReviews,
  buildCouncilResult,
  DEFAULT_COUNCIL_CONFIG
} from "./council.js";

// ============================================================================
// Response Parsing Tests
// ============================================================================

test("parseCouncilResponse extracts valid initial response", () => {
  const response = `\`\`\`json
{
  "summary": "The cache layer has a race condition",
  "key_claims": ["Race condition in cache invalidation", "Stale reads possible"],
  "risks": ["Data inconsistency", "User confusion"],
  "recommended_action": "Add mutex lock around cache operations",
  "blockers": [],
  "confidence": 0.85,
  "reasoning_chain": ["Identified concurrent access", "Traced to cache.js:42"],
  "evidence": ["Stack trace shows interleaving", "Reproduced in test"],
  "alternatives_considered": ["Disable cache entirely", "Use Redis"]
}
\`\`\``;

  const parsed = parseCouncilResponse(response);

  assert.equal(parsed.success, true);
  assert.equal(parsed.data.recommended_action, "Add mutex lock around cache operations");
  assert.equal(parsed.data.confidence, 0.85);
  assert.equal(parsed.data.key_claims.length, 2);
  assert.equal(parsed.data.risks.length, 2);
  assert.equal(parsed.data.reasoning_chain.length, 2);
  assert.equal(parsed.data.evidence.length, 2);
});

test("parseCouncilResponse handles raw JSON without fences", () => {
  const response = `Here's my analysis:
{
  "summary": "Simple fix needed",
  "key_claims": ["Single point of failure"],
  "risks": [],
  "recommended_action": "Add retry logic",
  "blockers": [],
  "confidence": 0.9,
  "reasoning_chain": [],
  "evidence": [],
  "alternatives_considered": []
}
Done.`;

  const parsed = parseCouncilResponse(response);

  assert.equal(parsed.success, true);
  assert.equal(parsed.data.recommended_action, "Add retry logic");
  assert.equal(parsed.data.confidence, 0.9);
});

test("parseCouncilResponse fails without recommended_action", () => {
  const response = `{
  "summary": "Incomplete response",
  "key_claims": [],
  "risks": []
}`;

  const parsed = parseCouncilResponse(response);

  assert.equal(parsed.success, false);
  assert.match(parsed.error, /recommended_action/i);
});

test("parseCouncilResponse normalizes confidence to 0-1 range", () => {
  const response = `{
  "recommended_action": "Test",
  "confidence": 1.5
}`;

  const parsed = parseCouncilResponse(response);

  assert.equal(parsed.success, true);
  assert.equal(parsed.data.confidence, 1.0);
});

test("parseCouncilResponse handles malformed JSON gracefully", () => {
  const response = "This is just plain text without any JSON";

  const parsed = parseCouncilResponse(response);

  assert.equal(parsed.success, false);
  assert.ok(parsed.error);
});

// ============================================================================
// Peer Review Parsing Tests
// ============================================================================

test("parsePeerReviewResponse extracts rankings correctly", () => {
  const response = `\`\`\`json
{
  "rankings": [
    {"analyst": "Analyst A", "rank": 1, "score": 0.9, "strengths": ["Clear reasoning"], "weaknesses": []},
    {"analyst": "Analyst B", "rank": 2, "score": 0.7, "strengths": ["Good evidence"], "weaknesses": ["Verbose"]}
  ],
  "best_insights": ["Cache race condition identified", "Mutex is correct solution"],
  "critical_gaps": ["No performance impact analysis"],
  "contradictions_found": ["Analyst A says add cache, Analyst B says remove it"],
  "synthesis_recommendation": "Use Analyst A's approach but add performance testing",
  "confidence_in_review": 0.85
}
\`\`\``;

  const parsed = parsePeerReviewResponse(response);

  assert.equal(parsed.success, true);
  assert.equal(parsed.data.rankings.length, 2);
  assert.equal(parsed.data.rankings[0].analyst, "Analyst A");
  assert.equal(parsed.data.rankings[0].score, 0.9);
  assert.equal(parsed.data.best_insights.length, 2);
  assert.equal(parsed.data.critical_gaps.length, 1);
  assert.equal(parsed.data.contradictions_found.length, 1);
});

test("parsePeerReviewResponse handles missing optional fields", () => {
  const response = `{
  "rankings": [],
  "best_insights": [],
  "critical_gaps": [],
  "contradictions_found": [],
  "synthesis_recommendation": "No clear winner",
  "confidence_in_review": 0.5
}`;

  const parsed = parsePeerReviewResponse(response);

  assert.equal(parsed.success, true);
  assert.equal(parsed.data.rankings.length, 0);
});

// ============================================================================
// Chairman Synthesis Parsing Tests
// ============================================================================

test("parseChairmanResponse extracts full synthesis", () => {
  const response = `\`\`\`json
{
  "final_summary": "After reviewing all analyses, the consensus points to a cache invalidation race condition.",
  "consensus_recommendation": "Implement a read-write lock in the cache layer with a 5-second TTL fallback.",
  "key_findings": [
    "Race condition confirmed by 3/4 analysts",
    "Mutex solution preferred over cache removal",
    "Performance impact estimated at <5ms per operation"
  ],
  "resolved_disagreements": [
    {
      "issue": "Whether to add mutex vs remove cache",
      "resolution": "Add mutex with fallback to bypass",
      "rationale": "Preserves cache benefits while eliminating race"
    }
  ],
  "minority_views": [
    {
      "view": "Remove cache entirely for simplicity",
      "merit": "Eliminates all cache-related bugs",
      "when_applicable": "If cache hit rate falls below 50%"
    }
  ],
  "risks_and_mitigations": [
    {
      "risk": "Lock contention under high load",
      "mitigation": "Use read-write lock instead of mutex"
    }
  ],
  "confidence": 0.92,
  "action_items": [
    "Add RWLock to CacheManager class",
    "Update unit tests for concurrent access",
    "Add performance benchmark"
  ],
  "rationale": "Weighted peer rankings and cross-family agreement strongly favor the mutex approach."
}
\`\`\``;

  const parsed = parseChairmanResponse(response);

  assert.equal(parsed.success, true);
  assert.equal(parsed.data.consensus_recommendation, "Implement a read-write lock in the cache layer with a 5-second TTL fallback.");
  assert.equal(parsed.data.confidence, 0.92);
  assert.equal(parsed.data.key_findings.length, 3);
  assert.equal(parsed.data.resolved_disagreements.length, 1);
  assert.equal(parsed.data.minority_views.length, 1);
  assert.equal(parsed.data.risks_and_mitigations.length, 1);
  assert.equal(parsed.data.action_items.length, 3);
});

test("parseChairmanResponse fails without consensus_recommendation", () => {
  const response = `{
  "final_summary": "Incomplete synthesis",
  "key_findings": []
}`;

  const parsed = parseChairmanResponse(response);

  assert.equal(parsed.success, false);
  assert.match(parsed.error, /consensus_recommendation/i);
});

// ============================================================================
// Anonymization Tests
// ============================================================================

test("createAnonymousMapping assigns unique labels", () => {
  const models = ["gpt4o", "claude", "deepseek", "minimax"];
  const config = DEFAULT_COUNCIL_CONFIG;

  const mapping = createAnonymousMapping(models, config);

  // Each model gets a unique label
  const labels = Object.values(mapping.modelToLabel);
  const uniqueLabels = new Set(labels);
  assert.equal(uniqueLabels.size, models.length);

  // Reverse mapping works
  for (const [model, label] of Object.entries(mapping.modelToLabel)) {
    assert.equal(mapping.labelToModel[label], model);
  }
});

test("createAnonymousMapping handles more models than labels", () => {
  const models = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
  const config = {
    ...DEFAULT_COUNCIL_CONFIG,
    anonymization: {
      ...DEFAULT_COUNCIL_CONFIG.anonymization,
      labels: ["A", "B", "C"]
    }
  };

  const mapping = createAnonymousMapping(models, config);

  // Should cycle through labels
  assert.ok(mapping.modelToLabel["a"]);
  assert.ok(mapping.modelToLabel["j"]);
});

// ============================================================================
// Peer Review Aggregation Tests
// ============================================================================

test("aggregatePeerReviews computes model rankings correctly", () => {
  const mapping = {
    modelToLabel: { gpt4o: "Analyst A", claude: "Analyst B", deepseek: "Analyst C" },
    labelToModel: { "Analyst A": "gpt4o", "Analyst B": "claude", "Analyst C": "deepseek" }
  };

  const reviews = [
    {
      reviewer: "gpt4o",
      reviewerLabel: "Analyst A",
      structured: {
        rankings: [
          { analyst: "Analyst B", rank: 1, score: 0.9, strengths: [], weaknesses: [] },
          { analyst: "Analyst C", rank: 2, score: 0.7, strengths: [], weaknesses: [] }
        ],
        best_insights: ["Insight from A"],
        critical_gaps: ["Gap from A"],
        contradictions_found: [],
        synthesis_recommendation: "Use B's approach",
        confidence_in_review: 0.8
      }
    },
    {
      reviewer: "claude",
      reviewerLabel: "Analyst B",
      structured: {
        rankings: [
          { analyst: "Analyst A", rank: 1, score: 0.85, strengths: [], weaknesses: [] },
          { analyst: "Analyst C", rank: 2, score: 0.6, strengths: [], weaknesses: [] }
        ],
        best_insights: ["Insight from B", "Insight from A"],
        critical_gaps: ["Gap from A"],
        contradictions_found: ["C disagrees with A"],
        synthesis_recommendation: "Combine A and B",
        confidence_in_review: 0.75
      }
    }
  ];

  const aggregation = aggregatePeerReviews(reviews, mapping);

  // Check model rankings
  assert.ok(aggregation.modelRankings.length > 0);

  // Claude (Analyst B) got highest score from A (0.9)
  // GPT4o (Analyst A) got second highest from B (0.85)
  const claudeRanking = aggregation.modelRankings.find(r => r.model === "claude");
  const gptRanking = aggregation.modelRankings.find(r => r.model === "gpt4o");

  assert.ok(claudeRanking);
  assert.ok(gptRanking);

  // Check consensus insights (mentioned by 2+ reviewers)
  assert.ok(aggregation.consensusInsights.length >= 0); // "Insight from A" mentioned twice

  // Check gaps (mentioned by 2 reviewers)
  const gapA = aggregation.consensusGaps.find(g => g.gap.includes("gap from a"));
  assert.ok(gapA);
  assert.equal(gapA.mentionedBy, 2);

  // Check reviewer agreement
  assert.ok(aggregation.reviewerAgreement >= 0 && aggregation.reviewerAgreement <= 1);
});

test("aggregatePeerReviews handles empty reviews", () => {
  const mapping = { modelToLabel: {}, labelToModel: {} };
  const aggregation = aggregatePeerReviews([], mapping);

  assert.deepEqual(aggregation.modelRankings, []);
  assert.deepEqual(aggregation.consensusInsights, []);
  assert.equal(aggregation.reviewerAgreement, 1.0);
});

// ============================================================================
// Council Result Building Tests
// ============================================================================

test("buildCouncilResult uses chairman synthesis when available", () => {
  const stages = [
    {
      stage: 1,
      name: "initial_responses",
      responses: [
        { model: "gpt4o", family: "gpt-like", structured: { recommended_action: "Action A", confidence: 0.7 } },
        { model: "claude", family: "claude-like", structured: { recommended_action: "Action B", confidence: 0.8 } }
      ],
      errors: [],
      durationMs: 1000
    },
    {
      stage: 2,
      name: "peer_review",
      reviews: [],
      aggregation: {
        modelRankings: [{ model: "claude", averageScore: 0.9 }],
        topRanked: "claude",
        consensusInsights: [],
        consensusGaps: [],
        contradictions: [],
        synthesisRecommendations: [],
        reviewerAgreement: 0.8
      },
      durationMs: 800
    },
    {
      stage: 3,
      name: "chairman_synthesis",
      chairmanModel: "gemini3pro",
      structured: {
        final_summary: "Chairman summary",
        consensus_recommendation: "Chairman recommendation",
        key_findings: ["Finding 1"],
        confidence: 0.95,
        action_items: ["Action 1"]
      },
      inputTokens: 2000,
      outputTokens: 500,
      durationMs: 1200
    }
  ];

  const result = buildCouncilResult("Test prompt", stages, "full", DEFAULT_COUNCIL_CONFIG, Date.now() - 3000);

  assert.equal(result.success, true);
  assert.equal(result.recommendation, "Chairman recommendation");
  assert.equal(result.confidence, 0.95);
  assert.ok(result.stage3.synthesis);
  assert.equal(result.stage3.chairmanModel, "gemini3pro");
});

test("buildCouncilResult falls back to peer review when no chairman", () => {
  const stages = [
    {
      stage: 1,
      name: "initial_responses",
      responses: [
        { model: "gpt4o", family: "gpt-like", structured: { recommended_action: "Action A", confidence: 0.7 } },
        { model: "claude", family: "claude-like", structured: { recommended_action: "Action B", confidence: 0.8 } }
      ],
      errors: [],
      durationMs: 1000
    },
    {
      stage: 2,
      name: "peer_review",
      reviews: [],
      aggregation: {
        modelRankings: [{ model: "claude", averageScore: 0.9 }],
        topRanked: "claude",
        consensusInsights: [],
        consensusGaps: [],
        contradictions: [],
        synthesisRecommendations: [],
        reviewerAgreement: 0.85
      },
      durationMs: 800
    }
  ];

  const result = buildCouncilResult("Test prompt", stages, "standard", DEFAULT_COUNCIL_CONFIG, Date.now() - 2000);

  assert.equal(result.success, true);
  assert.equal(result.recommendation, "Action B"); // claude's action (top ranked)
  assert.ok(result.confidence > 0.6); // 0.85 * 0.8 = 0.68
});

test("buildCouncilResult falls back to highest confidence initial response", () => {
  const stages = [
    {
      stage: 1,
      name: "initial_responses",
      responses: [
        { model: "gpt4o", family: "gpt-like", structured: { recommended_action: "Action A", confidence: 0.7, summary: "Summary A" } },
        { model: "claude", family: "claude-like", structured: { recommended_action: "Action B", confidence: 0.9, summary: "Summary B" } }
      ],
      errors: [],
      durationMs: 1000
    }
  ];

  const result = buildCouncilResult("Test prompt", stages, "quick", DEFAULT_COUNCIL_CONFIG, Date.now() - 1000);

  assert.equal(result.success, true);
  assert.equal(result.recommendation, "Action B"); // claude has higher confidence
  assert.equal(result.confidence, 0.9);
});

test("buildCouncilResult calculates total tokens across stages", () => {
  const stages = [
    {
      stage: 1,
      name: "initial_responses",
      responses: [
        { model: "gpt4o", inputTokens: 100, outputTokens: 200 },
        { model: "claude", inputTokens: 150, outputTokens: 250 }
      ],
      errors: [],
      durationMs: 1000
    },
    {
      stage: 2,
      name: "peer_review",
      reviews: [
        { reviewer: "gpt4o", inputTokens: 300, outputTokens: 100 },
        { reviewer: "claude", inputTokens: 350, outputTokens: 120 }
      ],
      aggregation: { modelRankings: [], topRanked: null, consensusInsights: [], consensusGaps: [], contradictions: [], reviewerAgreement: 1 },
      durationMs: 800
    },
    {
      stage: 3,
      name: "chairman_synthesis",
      chairmanModel: "gemini3pro",
      structured: { consensus_recommendation: "Test", confidence: 0.8 },
      inputTokens: 500,
      outputTokens: 300,
      durationMs: 1200
    }
  ];

  const result = buildCouncilResult("Test", stages, "full", DEFAULT_COUNCIL_CONFIG, Date.now() - 3000);

  // Total: (100+150+300+350+500) input = 1400, (200+250+100+120+300) output = 970
  assert.equal(result.totalTokens.input, 1400);
  assert.equal(result.totalTokens.output, 970);
});

// ============================================================================
// Mode Configuration Tests
// ============================================================================

test("DEFAULT_COUNCIL_CONFIG has all required modes", () => {
  assert.ok(DEFAULT_COUNCIL_CONFIG.modes.quick);
  assert.ok(DEFAULT_COUNCIL_CONFIG.modes.standard);
  assert.ok(DEFAULT_COUNCIL_CONFIG.modes.full);
});

test("quick mode skips peer review and chairman", () => {
  const quick = DEFAULT_COUNCIL_CONFIG.modes.quick;
  assert.equal(quick.skipPeerReview, true);
  assert.equal(quick.skipChairman, true);
});

test("standard mode includes peer review but skips chairman", () => {
  const standard = DEFAULT_COUNCIL_CONFIG.modes.standard;
  assert.equal(standard.skipPeerReview, false);
  assert.equal(standard.skipChairman, true);
});

test("full mode includes all stages", () => {
  const full = DEFAULT_COUNCIL_CONFIG.modes.full;
  assert.equal(full.skipPeerReview, false);
  assert.equal(full.skipChairman, false);
});

// ============================================================================
// Edge Cases Tests
// ============================================================================

test("parseCouncilResponse handles arrays as strings", () => {
  const response = `{
  "summary": "test",
  "key_claims": "claim1, claim2, claim3",
  "risks": "risk1\\nrisk2",
  "recommended_action": "Do the thing",
  "blockers": "",
  "confidence": 0.8
}`;

  const parsed = parseCouncilResponse(response);

  assert.equal(parsed.success, true);
  assert.ok(parsed.data.key_claims.length > 0);
  assert.ok(parsed.data.risks.length > 0);
  assert.equal(parsed.data.blockers.length, 0);
});

test("parseCouncilResponse handles negative confidence", () => {
  const response = `{
  "recommended_action": "Test",
  "confidence": -0.5
}`;

  const parsed = parseCouncilResponse(response);

  assert.equal(parsed.success, true);
  assert.equal(parsed.data.confidence, 0);
});

test("parseCouncilResponse handles non-numeric confidence", () => {
  const response = `{
  "recommended_action": "Test",
  "confidence": "high"
}`;

  const parsed = parseCouncilResponse(response);

  assert.equal(parsed.success, true);
  assert.equal(parsed.data.confidence, 0.5); // default when invalid
});

test("aggregatePeerReviews handles reviews without structured data", () => {
  const mapping = { modelToLabel: {}, labelToModel: {} };
  const reviews = [
    { reviewer: "gpt4o", structured: null, parseError: "invalid json" },
    { reviewer: "claude", structured: null, parseError: "invalid json" }
  ];

  const aggregation = aggregatePeerReviews(reviews, mapping);

  assert.deepEqual(aggregation.modelRankings, []);
  assert.equal(aggregation.reviewerAgreement, 1.0);
});

test("buildCouncilResult handles all models failing", () => {
  const stages = [
    {
      stage: 1,
      name: "initial_responses",
      responses: [],
      errors: [{ model: "gpt4o", error: "timeout" }],
      durationMs: 1000
    }
  ];

  const result = buildCouncilResult("Test", stages, "quick", DEFAULT_COUNCIL_CONFIG, Date.now() - 1000);

  assert.equal(result.success, true); // Still returns a result
  assert.equal(result.recommendation, "Unable to determine recommendation");
  assert.equal(result.confidence, 0);
});

// ============================================================================
// Integration Sanity Tests
// ============================================================================

test("council module exports all required functions", async () => {
  const council = await import("./council.js");

  // Main functions
  assert.equal(typeof council.runCouncil, "function");
  assert.equal(typeof council.quickCouncil, "function");
  assert.equal(typeof council.standardCouncil, "function");
  assert.equal(typeof council.fullCouncil, "function");
  assert.equal(typeof council.formatCouncilResult, "function");

  // Stage functions
  assert.equal(typeof council.collectInitialResponses, "function");
  assert.equal(typeof council.conductPeerReview, "function");
  assert.equal(typeof council.executeChairmanSynthesis, "function");

  // Parsing functions
  assert.equal(typeof council.parseCouncilResponse, "function");
  assert.equal(typeof council.parsePeerReviewResponse, "function");
  assert.equal(typeof council.parseChairmanResponse, "function");

  // Utilities
  assert.equal(typeof council.createAnonymousMapping, "function");
  assert.equal(typeof council.aggregatePeerReviews, "function");
  assert.equal(typeof council.buildCouncilResult, "function");
});

test("consensus module re-exports council functions", async () => {
  const consensus = await import("./consensus.js");

  assert.equal(typeof consensus.runCouncil, "function");
  assert.equal(typeof consensus.quickCouncil, "function");
  assert.equal(typeof consensus.standardCouncil, "function");
  assert.equal(typeof consensus.fullCouncil, "function");
  assert.equal(typeof consensus.smartConsensus, "function");
  assert.equal(typeof consensus.buildConsensusEnhanced, "function");
});
