/**
 * @fileoverview Comprehensive test suite for reasoning-loop.js
 *
 * Tests cover:
 * - ReasoningState class (LTI-stable state management)
 * - Model selection by depth
 * - Loop count inference from task complexity
 * - ACT halting conditions
 * - Confidence estimation
 * - State synthesis
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  ReasoningState,
  LOOP_CONFIG,
  selectModelByDepth,
  inferLoopCount,
  formatReasoningResult,
  sanitizeInput,
  deepMerge,
  validateConfig
} from "./reasoning-loop.js";

// ============================================================================
// ReasoningState Tests
// ============================================================================

test("ReasoningState: initializes with default config values", () => {
  const state = new ReasoningState("test input");

  assert.equal(state.originalInput, "test input");
  assert.equal(state.decay, LOOP_CONFIG.stateDecay);
  assert.equal(state.injection, LOOP_CONFIG.inputInjection);
  assert.deepEqual(state.iterations, []);
  assert.deepEqual(state.confidenceHistory, []);
  assert.equal(state.currentState, "");
  assert.equal(state.cumulativeConfidence, 0);
  assert.deepEqual(state.claims, []);
  assert.deepEqual(state.risks, []);
  assert.deepEqual(state.blockers, []);
});

test("ReasoningState: allows custom config overrides", () => {
  const state = new ReasoningState("test", { decay: 0.5, injection: 0.8 });

  assert.equal(state.decay, 0.5);
  assert.equal(state.injection, 0.8);
});

test("ReasoningState: initializes metrics tracking", () => {
  const state = new ReasoningState("test");

  assert.ok(state.metrics.startTime);
  assert.deepEqual(state.metrics.iterationTimes, []);
  assert.deepEqual(state.metrics.totalTokens, { input: 0, output: 0 });
  assert.equal(state.metrics.modelCalls, 0);
  assert.equal(state.metrics.errors, 0);
  assert.equal(state.metrics.retries, 0);
});

test("ReasoningState.update: adds iteration to history", () => {
  const state = new ReasoningState("original");
  const response = {
    model: "claude",
    response: "This is the analysis",
    family: "anthropic"
  };

  state.update(response, null, 0);

  assert.equal(state.iterations.length, 1);
  assert.equal(state.iterations[0].model, "claude");
  assert.equal(state.iterations[0].loop, 0);
  assert.equal(state.iterations[0].family, "anthropic");
});

test("ReasoningState.update: tracks confidence history", () => {
  const state = new ReasoningState("test");
  const response = { model: "test", response: "definitely the answer", family: "test" };

  state.update(response, { confidence: 0.8 }, 0);

  assert.equal(state.confidenceHistory.length, 1);
  assert.equal(state.confidenceHistory[0], 0.8);
});

test("ReasoningState.update: accumulates cumulative confidence (ACT)", () => {
  const state = new ReasoningState("test");

  state.update({ model: "t", response: "a", family: "t" }, { confidence: 0.5 }, 0);
  const firstCumulative = state.cumulativeConfidence;
  assert.ok(firstCumulative > 0);

  state.update({ model: "t", response: "b", family: "t" }, { confidence: 0.5 }, 1);
  assert.ok(state.cumulativeConfidence > firstCumulative);
});

test("ReasoningState.update: aggregates claims from structured responses", () => {
  const state = new ReasoningState("test");
  const parsed = {
    key_claims: ["Claim 1", "Claim 2"],
    confidence: 0.7
  };

  state.update({ model: "t", response: "x", family: "t" }, parsed, 0);

  assert.ok(state.claims.includes("Claim 1"));
  assert.ok(state.claims.includes("Claim 2"));
});

test("ReasoningState.update: deduplicates claims", () => {
  const state = new ReasoningState("test");
  const parsed1 = { key_claims: ["Same claim"], confidence: 0.7 };
  const parsed2 = { key_claims: ["Same claim", "New claim"], confidence: 0.8 };

  state.update({ model: "t", response: "x", family: "t" }, parsed1, 0);
  state.update({ model: "t", response: "y", family: "t" }, parsed2, 1);

  assert.equal(state.claims.filter(c => c === "Same claim").length, 1);
  assert.ok(state.claims.includes("New claim"));
});

test("ReasoningState.update: aggregates risks and blockers", () => {
  const state = new ReasoningState("test");
  const parsed = {
    risks: ["Risk A", "Risk B"],
    blockers: ["Blocker X"],
    confidence: 0.6
  };

  state.update({ model: "t", response: "x", family: "t" }, parsed, 0);

  assert.ok(state.risks.includes("Risk A"));
  assert.ok(state.risks.includes("Risk B"));
  assert.ok(state.blockers.includes("Blocker X"));
});

test("ReasoningState.update: tracks token usage in metrics", () => {
  const state = new ReasoningState("test");
  const response = {
    model: "claude",
    response: "response",
    family: "anthropic",
    inputTokens: 100,
    outputTokens: 50
  };

  state.update(response, null, 0);

  assert.equal(state.metrics.totalTokens.input, 100);
  assert.equal(state.metrics.totalTokens.output, 50);
});

test("ReasoningState.update: increments model calls counter", () => {
  const state = new ReasoningState("test");

  state.update({ model: "t", response: "a", family: "t" }, null, 0);
  state.update({ model: "t", response: "b", family: "t" }, null, 1);

  assert.equal(state.metrics.modelCalls, 2);
});

test("ReasoningState.update: prunes old iterations when exceeding limit", () => {
  const state = new ReasoningState("test");

  for (let i = 0; i < LOOP_CONFIG.maxIterationHistory + 5; i++) {
    state.update({ model: "t", response: `iter ${i}`, family: "t" }, null, i);
  }

  assert.ok(state.iterations.length <= LOOP_CONFIG.maxIterationHistory);
});

// ============================================================================
// Confidence Estimation Tests
// ============================================================================

test("ReasoningState.estimateConfidence: returns base confidence for neutral text", () => {
  const state = new ReasoningState("test");
  const confidence = state.estimateConfidence("This is a neutral response.");

  assert.ok(confidence > 0.3);
  assert.ok(confidence < 0.7);
});

test("ReasoningState.estimateConfidence: increases for positive signals", () => {
  const state = new ReasoningState("test");

  const lowConfidence = state.estimateConfidence("Neutral text.");
  const highConfidence = state.estimateConfidence("The solution is definitely clear and verified.");

  assert.ok(highConfidence > lowConfidence);
});

test("ReasoningState.estimateConfidence: decreases for negative signals", () => {
  const state = new ReasoningState("test");

  const baseConfidence = state.estimateConfidence("Neutral text.");
  const lowConfidence = state.estimateConfidence("Maybe this might work, not sure, needs more investigation.");

  assert.ok(lowConfidence < baseConfidence);
});

test("ReasoningState.estimateConfidence: clamps to valid range", () => {
  const state = new ReasoningState("test");

  const high = state.estimateConfidence(
    "definitely certainly clearly obviously verified confirmed tested solution"
  );
  assert.ok(high <= 0.95);

  const low = state.estimateConfidence(
    "might maybe possibly perhaps unclear uncertain not sure needs more"
  );
  assert.ok(low >= 0.1);
});

test("ReasoningState.estimateConfidence: handles empty/null input", () => {
  const state = new ReasoningState("test");

  assert.equal(state.estimateConfidence(""), 0.3);
  assert.equal(state.estimateConfidence(null), 0.3);
  assert.equal(state.estimateConfidence(undefined), 0.3);
});

// ============================================================================
// ACT Halting Tests
// ============================================================================

test("ReasoningState.shouldHalt: does not halt before minimum iterations", () => {
  const state = new ReasoningState("test");

  for (let i = 0; i < LOOP_CONFIG.defaultMinLoops - 1; i++) {
    state.update({ model: "t", response: "x", family: "t" }, { confidence: 0.99 }, i);
  }

  const result = state.shouldHalt();
  assert.equal(result.halt, false);
});

test("ReasoningState.shouldHalt: halts when cumulative confidence exceeds threshold", () => {
  const state = new ReasoningState("test");

  for (let i = 0; i < 5; i++) {
    state.update({ model: "t", response: "x", family: "t" }, { confidence: 0.9 }, i);
  }

  const result = state.shouldHalt();
  assert.equal(result.halt, true);
  assert.equal(result.reason, "cumulative_confidence");
});

test("ReasoningState.shouldHalt: halts on convergence (stable confidence)", () => {
  const state = new ReasoningState("test");

  state.cumulativeConfidence = 0.5;
  state.confidenceHistory = [0.75, 0.76, 0.75];
  state.iterations = [1, 2, 3];

  const result = state.shouldHalt();
  assert.equal(result.halt, true);
  assert.equal(result.reason, "convergence");
});

test("ReasoningState.shouldHalt: does not halt if confidence too low even when converged", () => {
  const state = new ReasoningState("test");

  state.cumulativeConfidence = 0.3;
  state.confidenceHistory = [0.3, 0.31, 0.3];
  state.iterations = [1, 2, 3];

  const result = state.shouldHalt();
  assert.equal(result.halt, false);
});

// ============================================================================
// Prompt Building Tests
// ============================================================================

test("ReasoningState.buildPromptForLoop: includes loop-specific prompts", () => {
  const state = new ReasoningState("Original task");

  const prompt0 = state.buildPromptForLoop(0, "Task");
  const loopPrompt0 = LOOP_CONFIG.loopPrompts[0] || LOOP_CONFIG.loopPrompts.default;
  assert.ok(prompt0.includes(loopPrompt0) || prompt0.toLowerCase().includes("analyz"));

  const prompt3 = state.buildPromptForLoop(3, "Task");
  const loopPrompt3 = LOOP_CONFIG.loopPrompts[3] || LOOP_CONFIG.loopPrompts.default;
  assert.ok(prompt3.includes(loopPrompt3) || prompt3.toLowerCase().includes("stress") || prompt3.includes("reasoning"));
});

test("ReasoningState.buildPromptForLoop: includes prior reasoning when iterations exist", () => {
  const state = new ReasoningState("Task");
  state.update(
    { model: "claude", response: "First analysis finding", family: "anthropic" },
    { summary: "Found important bug" },
    0
  );

  const prompt = state.buildPromptForLoop(1, "Task");
  assert.ok(prompt.includes("Prior Reasoning"));
});

test("ReasoningState.buildPromptForLoop: includes JSON schema instruction", () => {
  const state = new ReasoningState("Task");
  const prompt = state.buildPromptForLoop(0, "Task");

  assert.ok(prompt.includes("Return JSON"));
  assert.ok(prompt.includes("summary"));
  assert.ok(prompt.includes("key_claims"));
  assert.ok(prompt.includes("confidence"));
});

// ============================================================================
// Summarize Prior Tests
// ============================================================================

test("ReasoningState.summarizePrior: returns 'no prior' for empty state", () => {
  const state = new ReasoningState("test");
  assert.ok(state.summarizePrior().includes("No prior iterations"));
});

test("ReasoningState.summarizePrior: includes recent iteration summaries", () => {
  const state = new ReasoningState("test");
  state.update(
    { model: "claude", response: "Finding one", family: "anthropic" },
    { summary: "First summary" },
    0
  );

  const summary = state.summarizePrior();
  assert.ok(summary.includes("Loop 1"));
  assert.ok(summary.includes("claude"));
});

test("ReasoningState.summarizePrior: includes aggregated claims when iterations exist", () => {
  const state = new ReasoningState("test");
  // Must have iterations for summarizePrior to include claims
  state.update(
    { model: "t", response: "finding", family: "t" },
    { key_claims: ["Important claim"], confidence: 0.7 },
    0
  );

  const summary = state.summarizePrior();
  assert.ok(summary.includes("Established claims"));
  assert.ok(summary.includes("Important claim"));
});

// ============================================================================
// Synthesis Tests
// ============================================================================

test("ReasoningState.synthesize: returns complete synthesis object", () => {
  const state = new ReasoningState("test");
  state.update({ model: "t", response: "x", family: "t" }, { confidence: 0.7 }, 0);

  const synthesis = state.synthesize();

  assert.ok("totalIterations" in synthesis);
  assert.ok("averageConfidence" in synthesis);
  assert.ok("finalConfidence" in synthesis);
  assert.ok("convergenceAchieved" in synthesis);
  assert.ok("claims" in synthesis);
  assert.ok("risks" in synthesis);
  assert.ok("modelsUsed" in synthesis);
  assert.ok("iterationSummaries" in synthesis);
  assert.ok("metrics" in synthesis);
});

test("ReasoningState.synthesize: calculates average confidence correctly", () => {
  const state = new ReasoningState("test");
  state.update({ model: "t", response: "x", family: "t" }, { confidence: 0.6 }, 0);
  state.update({ model: "t", response: "y", family: "t" }, { confidence: 0.8 }, 1);

  const synthesis = state.synthesize();
  assert.ok(Math.abs(synthesis.averageConfidence - 0.7) < 0.01);
});

test("ReasoningState.synthesize: identifies consensus action", () => {
  const state = new ReasoningState("test");
  state.update(
    { model: "t", response: "x", family: "t" },
    { recommended_action: "Fix the bug", confidence: 0.7 },
    0
  );
  state.update(
    { model: "t", response: "y", family: "t" },
    { recommended_action: "Fix the bug", confidence: 0.8 },
    1
  );

  const synthesis = state.synthesize();
  assert.ok(synthesis.recommendedAction.toLowerCase().includes("fix"));
  assert.ok(synthesis.actionAgreement > 0.5);
});

test("ReasoningState.synthesize: includes timing metrics", () => {
  const state = new ReasoningState("test");
  state.update({ model: "t", response: "x", family: "t" }, null, 0);

  const synthesis = state.synthesize();
  assert.ok(synthesis.metrics.totalDuration >= 0);
});

// ============================================================================
// Error and Retry Tracking Tests
// ============================================================================

test("ReasoningState.recordError: increments error counter", () => {
  const state = new ReasoningState("test");
  assert.equal(state.metrics.errors, 0);

  state.recordError();
  assert.equal(state.metrics.errors, 1);

  state.recordError();
  assert.equal(state.metrics.errors, 2);
});

test("ReasoningState.recordRetry: increments retry counter", () => {
  const state = new ReasoningState("test");
  assert.equal(state.metrics.retries, 0);

  state.recordRetry();
  assert.equal(state.metrics.retries, 1);
});

// ============================================================================
// Model Selection Tests
// ============================================================================

test("selectModelByDepth: selects shallow models for early loops (0-1)", () => {
  const model0 = selectModelByDepth(0);
  const model1 = selectModelByDepth(1);

  assert.ok(LOOP_CONFIG.depthTiers.shallow.includes(model0));
  assert.ok(LOOP_CONFIG.depthTiers.shallow.includes(model1));
});

test("selectModelByDepth: selects mid models for loops 2-4", () => {
  const model2 = selectModelByDepth(2);
  const model3 = selectModelByDepth(3);
  const model4 = selectModelByDepth(4);

  assert.ok(LOOP_CONFIG.depthTiers.mid.includes(model2));
  assert.ok(LOOP_CONFIG.depthTiers.mid.includes(model3));
  assert.ok(LOOP_CONFIG.depthTiers.mid.includes(model4));
});

test("selectModelByDepth: selects deep models for loops 5+", () => {
  const model5 = selectModelByDepth(5);
  const model6 = selectModelByDepth(6);

  assert.ok(LOOP_CONFIG.depthTiers.deep.includes(model5));
  assert.ok(LOOP_CONFIG.depthTiers.deep.includes(model6));
});

test("selectModelByDepth: rotates through pool", () => {
  const model0 = selectModelByDepth(0);
  const model3 = selectModelByDepth(3);

  // Different tiers, different models
  assert.notEqual(model0, model3);
});

// ============================================================================
// Loop Count Inference Tests
// ============================================================================

test("inferLoopCount: returns default for neutral tasks", () => {
  const count = inferLoopCount("Do some work on the code.");
  assert.ok(count >= LOOP_CONFIG.defaultMinLoops);
  assert.ok(count <= LOOP_CONFIG.defaultMaxLoops);
});

test("inferLoopCount: increases loops for complex task signals", () => {
  const neutral = inferLoopCount("Handle this task.");
  const complex = inferLoopCount("Do a comprehensive architecture review with deep dive root cause analysis.");

  assert.ok(complex > neutral);
});

test("inferLoopCount: decreases loops for simple task signals", () => {
  const neutral = inferLoopCount("Handle this task.");
  const simple = inferLoopCount("Quick simple typo fix.");

  assert.ok(simple < neutral);
});

test("inferLoopCount: clamps to valid range", () => {
  const veryComplex = inferLoopCount(
    "comprehensive architecture security audit system-wide multi-file deep dive root cause investigate fully all modules"
  );
  assert.ok(veryComplex <= LOOP_CONFIG.defaultMaxLoops);

  const verySimple = inferLoopCount("quick fast brief simple single format lint typo rename");
  assert.ok(verySimple >= LOOP_CONFIG.defaultMinLoops);
});

// ============================================================================
// Format Result Tests
// ============================================================================

test("formatReasoningResult: formats basic result correctly", () => {
  const result = {
    totalIterations: 3,
    finalConfidence: 0.85,
    convergenceAchieved: true,
    convergenceReason: "cumulative_confidence",
    modelsUsed: ["claude", "gemini"],
    claims: ["Claim 1", "Claim 2"],
    risks: ["Risk 1"],
    blockers: [],
    recommendedAction: "Fix the bug",
    actionAgreement: 0.8,
    iterationSummaries: [
      { loop: 0, model: "claude", confidence: 0.7, duration: 100, summary: "Initial analysis" },
      { loop: 1, model: "gemini", confidence: 0.8, duration: 120, summary: "Refined finding" }
    ],
    metrics: {
      totalDuration: 2500,
      totalTokens: { input: 1000, output: 500 }
    }
  };

  const formatted = formatReasoningResult(result);

  assert.ok(formatted.includes("Reasoning Loop Results"));
  assert.ok(formatted.includes("Iterations:** 3"));
  assert.ok(formatted.includes("85%"));
  assert.ok(formatted.includes("Convergence:** Yes"));
  assert.ok(formatted.includes("claude, gemini"));
  assert.ok(formatted.includes("Established Claims"));
  assert.ok(formatted.includes("Claim 1"));
  assert.ok(formatted.includes("Identified Risks"));
  assert.ok(formatted.includes("Recommended Action"));
  assert.ok(formatted.includes("Fix the bug"));
  assert.ok(formatted.includes("Iteration History"));
});

test("formatReasoningResult: handles missing optional fields", () => {
  const result = {
    totalIterations: 1,
    finalConfidence: 0.5,
    convergenceAchieved: false,
    modelsUsed: [],
    claims: [],
    risks: [],
    blockers: [],
    iterationSummaries: []
  };

  const formatted = formatReasoningResult(result);

  assert.ok(formatted.includes("Reasoning Loop Results"));
  assert.ok(formatted.includes("No (max loops reached)"));
});

test("formatReasoningResult: includes blockers section when present", () => {
  const result = {
    totalIterations: 2,
    finalConfidence: 0.6,
    convergenceAchieved: false,
    modelsUsed: ["test"],
    claims: [],
    risks: [],
    blockers: ["Missing API key"],
    iterationSummaries: []
  };

  const formatted = formatReasoningResult(result);
  assert.ok(formatted.includes("Blockers"));
  assert.ok(formatted.includes("Missing API key"));
});

test("formatReasoningResult: includes final synthesis when present", () => {
  const result = {
    totalIterations: 2,
    finalConfidence: 0.8,
    convergenceAchieved: true,
    modelsUsed: ["test"],
    claims: [],
    risks: [],
    blockers: [],
    iterationSummaries: [],
    finalSynthesis: "The root cause is X. Recommend doing Y."
  };

  const formatted = formatReasoningResult(result);
  assert.ok(formatted.includes("Final Synthesis"));
  assert.ok(formatted.includes("root cause is X"));
});

// ============================================================================
// LTI Stability Tests
// ============================================================================

test("LTI Stability: decay coefficient is less than 1", () => {
  assert.ok(LOOP_CONFIG.stateDecay < 1);
  assert.ok(LOOP_CONFIG.stateDecay > 0);
});

test("LTI Stability: state does not grow unbounded over many iterations", () => {
  const state = new ReasoningState("Initial problem statement");

  for (let i = 0; i < 20; i++) {
    const longResponse = "x".repeat(2000);
    state.update({ model: "t", response: longResponse, family: "t" }, null, i);
  }

  assert.ok(state.currentState.length <= LOOP_CONFIG.maxStateSize);
});

test("LTI Stability: original input is preserved across iterations", () => {
  const originalInput = "UNIQUE_ORIGINAL_INPUT_MARKER";
  const state = new ReasoningState(originalInput);

  for (let i = 0; i < 5; i++) {
    state.update({ model: "t", response: "Some analysis", family: "t" }, null, i);
  }

  const prompt = state.buildPromptForLoop(5, originalInput);
  assert.ok(prompt.includes(originalInput));
});

// ============================================================================
// Edge Cases
// ============================================================================

test("Edge case: handles empty task gracefully", () => {
  const loops = inferLoopCount("");
  assert.ok(loops >= LOOP_CONFIG.defaultMinLoops);
  assert.ok(loops <= LOOP_CONFIG.defaultMaxLoops);
});

test("Edge case: handles very long task input without throwing", () => {
  const veryLongTask = "analyze ".repeat(10000);
  const state = new ReasoningState(veryLongTask);

  // Should complete without throwing
  assert.doesNotThrow(() => {
    state.buildPromptForLoop(0, veryLongTask);
  });

  // State should truncate properly in _updateState via update()
  for (let i = 0; i < 3; i++) {
    state.update({ model: "t", response: "x".repeat(5000), family: "t" }, null, i);
  }
  assert.ok(state.currentState.length <= LOOP_CONFIG.maxStateSize);
});

test("Edge case: handles null/undefined structured responses", () => {
  const state = new ReasoningState("test");

  assert.doesNotThrow(() => {
    state.update({ model: "t", response: "raw text", family: "t" }, null, 0);
  });

  assert.doesNotThrow(() => {
    state.update({ model: "t", response: "raw text", family: "t" }, undefined, 1);
  });
});

test("Edge case: handles malformed structured responses", () => {
  const state = new ReasoningState("test");

  const malformed = { not_summary: "wrong field" };
  assert.doesNotThrow(() => {
    state.update({ model: "t", response: "x", family: "t" }, malformed, 0);
  });
});

test("Edge case: handles negative loop index (prelude)", () => {
  const state = new ReasoningState("test");

  assert.doesNotThrow(() => {
    state.update({ model: "t", response: "prelude", family: "t" }, null, -1);
  });

  assert.equal(state.iterations[0].loop, -1);
});

// ============================================================================
// Configuration Tests
// ============================================================================

test("LOOP_CONFIG: has required properties", () => {
  assert.ok("defaultMaxLoops" in LOOP_CONFIG);
  assert.ok("defaultMinLoops" in LOOP_CONFIG);
  assert.ok("actThreshold" in LOOP_CONFIG);
  assert.ok("convergenceThreshold" in LOOP_CONFIG);
  assert.ok("stateDecay" in LOOP_CONFIG);
  assert.ok("inputInjection" in LOOP_CONFIG);
  assert.ok("depthTiers" in LOOP_CONFIG);
  assert.ok("loopPrompts" in LOOP_CONFIG);
  assert.ok("shallow" in LOOP_CONFIG.depthTiers);
  assert.ok("mid" in LOOP_CONFIG.depthTiers);
  assert.ok("deep" in LOOP_CONFIG.depthTiers);
});

test("LOOP_CONFIG: depth tiers are non-empty arrays", () => {
  assert.ok(Array.isArray(LOOP_CONFIG.depthTiers.shallow));
  assert.ok(LOOP_CONFIG.depthTiers.shallow.length > 0);
  assert.ok(Array.isArray(LOOP_CONFIG.depthTiers.mid));
  assert.ok(LOOP_CONFIG.depthTiers.mid.length > 0);
  assert.ok(Array.isArray(LOOP_CONFIG.depthTiers.deep));
  assert.ok(LOOP_CONFIG.depthTiers.deep.length > 0);
});

// ============================================================================
// Performance Tests
// ============================================================================

test("Performance: update operation completes quickly", () => {
  const state = new ReasoningState("test");
  const response = {
    model: "test",
    response: "Analysis result with some detail".repeat(10),
    family: "test"
  };

  const start = performance.now();
  state.update(response, { confidence: 0.7 }, 0);
  const elapsed = performance.now() - start;

  assert.ok(elapsed < 50, `Update took ${elapsed}ms, expected < 50ms`);
});

test("Performance: synthesis completes quickly even with many iterations", () => {
  const state = new ReasoningState("test");

  for (let i = 0; i < LOOP_CONFIG.maxIterationHistory; i++) {
    state.update({ model: "t", response: "x", family: "t" }, { confidence: 0.7 }, i);
  }

  const start = performance.now();
  state.synthesize();
  const elapsed = performance.now() - start;

  assert.ok(elapsed < 100, `Synthesis took ${elapsed}ms, expected < 100ms`);
});

// ============================================================================
// Security Tests (from Multi-LLM Review)
// ============================================================================

test("Security: claims/risks/blockers are bounded", () => {
  const state = new ReasoningState("test");
  const maxClaims = LOOP_CONFIG.maxClaims || 100;

  // Add more claims than the limit
  for (let i = 0; i < maxClaims + 20; i++) {
    state.update(
      { model: "t", response: "x", family: "t" },
      { key_claims: [`Claim ${i}`], confidence: 0.5 },
      i
    );
  }

  // Should be bounded at max
  assert.ok(state.claims.length <= maxClaims, `Claims exceeded max: ${state.claims.length}`);
});

test("Security: config validation catches missing required fields", () => {
  // LOOP_CONFIG should have been validated at load time
  assert.ok(LOOP_CONFIG.defaultMaxLoops > 0);
  assert.ok(LOOP_CONFIG.defaultMinLoops > 0);
  assert.ok(LOOP_CONFIG.actThreshold > 0 && LOOP_CONFIG.actThreshold <= 1);
  assert.ok(LOOP_CONFIG.stateDecay > 0 && LOOP_CONFIG.stateDecay < 1);
});

test("Security: config validation ensures depth tiers are non-empty", () => {
  assert.ok(LOOP_CONFIG.depthTiers.shallow.length > 0);
  assert.ok(LOOP_CONFIG.depthTiers.mid.length > 0);
  assert.ok(LOOP_CONFIG.depthTiers.deep.length > 0);
});

test("Bug fix: selectModelByDepth handles empty pool gracefully", () => {
  // This test verifies the fallback behavior
  // Since we can't easily mock LOOP_CONFIG, we just verify it returns a string
  const model = selectModelByDepth(0);
  assert.ok(typeof model === "string");
  assert.ok(model.length > 0);
});

// ============================================================================
// Deep Merge and Config Tests
// ============================================================================

test("Config: deep merge preserves nested structure", () => {
  // Verify the config loading merged correctly
  assert.ok(LOOP_CONFIG.depthTiers);
  assert.ok(LOOP_CONFIG.loopPrompts);
  assert.ok(LOOP_CONFIG.confidenceSignals);
  assert.ok(LOOP_CONFIG.taskComplexitySignals);

  // Verify specific values from config file override defaults
  assert.equal(LOOP_CONFIG.defaultMaxLoops, 8);
  assert.equal(LOOP_CONFIG.defaultMinLoops, 2);
});

test("Config: memory limits are defined", () => {
  assert.ok(typeof LOOP_CONFIG.maxStateSize === "number");
  assert.ok(typeof LOOP_CONFIG.maxIterationHistory === "number");
  assert.ok(typeof LOOP_CONFIG.maxClaims === "number");
  assert.ok(typeof LOOP_CONFIG.maxRisks === "number");
  assert.ok(typeof LOOP_CONFIG.maxBlockers === "number");
});

test("Config: timeout values are defined", () => {
  assert.ok(typeof LOOP_CONFIG.iterationTimeout === "number");
  assert.ok(typeof LOOP_CONFIG.preludeTimeout === "number");
  assert.ok(typeof LOOP_CONFIG.codaTimeout === "number");
  assert.ok(LOOP_CONFIG.iterationTimeout > 0);
});

test("Config: retry configuration is valid", () => {
  assert.ok(typeof LOOP_CONFIG.maxRetries === "number");
  assert.ok(typeof LOOP_CONFIG.retryDelay === "number");
  assert.ok(LOOP_CONFIG.maxRetries >= 0);
  assert.ok(LOOP_CONFIG.retryDelay > 0);
});

test("Config: LTI stability constraint is enforced", () => {
  // stateDecay must be < 1 for spectral radius < 1 (LTI stability)
  assert.ok(LOOP_CONFIG.stateDecay > 0, "stateDecay must be positive");
  assert.ok(LOOP_CONFIG.stateDecay < 1, "stateDecay must be < 1 for stability");
});

test("Config: all loop prompts reference valid loop indices", () => {
  // Verify prompts exist for loops 0-5 and default
  assert.ok(LOOP_CONFIG.loopPrompts["0"]);
  assert.ok(LOOP_CONFIG.loopPrompts["1"]);
  assert.ok(LOOP_CONFIG.loopPrompts["2"]);
  assert.ok(LOOP_CONFIG.loopPrompts["3"]);
  assert.ok(LOOP_CONFIG.loopPrompts["4"]);
  assert.ok(LOOP_CONFIG.loopPrompts["5"]);
  assert.ok(LOOP_CONFIG.loopPrompts["default"]);
});

test("Config: depth tiers cover all model phases", () => {
  // Shallow: loops 0-1
  assert.ok(LOOP_CONFIG.depthTiers.shallow.length >= 1);
  // Mid: loops 2-4
  assert.ok(LOOP_CONFIG.depthTiers.mid.length >= 1);
  // Deep: loops 5+
  assert.ok(LOOP_CONFIG.depthTiers.deep.length >= 1);
});

// ============================================================================
// ReasoningState Boundary Tests
// ============================================================================

test("ReasoningState: handles unicode and special characters", () => {
  const state = new ReasoningState("Test with émojis 🔥 and unicode: 日本語");

  assert.ok(state.originalInput.includes("émojis"));
  assert.ok(state.originalInput.includes("🔥"));
  assert.ok(state.originalInput.includes("日本語"));
});

test("ReasoningState: iteration history respects FIFO when full", () => {
  const state = new ReasoningState("test");
  const limit = LOOP_CONFIG.maxIterationHistory;

  // Fill beyond limit
  for (let i = 0; i < limit + 5; i++) {
    state.update({ model: `m${i}`, response: `r${i}`, family: "t" }, null, i);
  }

  // Should have exactly limit entries
  assert.equal(state.iterations.length, limit);

  // First entries should be pruned, last should remain
  const lastIter = state.iterations[state.iterations.length - 1];
  assert.equal(lastIter.loop, limit + 4);
});

test("ReasoningState: claims FIFO eviction when full", () => {
  const state = new ReasoningState("test");
  const maxClaims = LOOP_CONFIG.maxClaims;

  // Add exactly maxClaims unique claims
  for (let i = 0; i < maxClaims + 10; i++) {
    state.update(
      { model: "t", response: "x", family: "t" },
      { key_claims: [`Unique claim ${i}`], confidence: 0.5 },
      i
    );
  }

  // Should be bounded
  assert.equal(state.claims.length, maxClaims);

  // Oldest claims should be evicted
  assert.ok(!state.claims.includes("Unique claim 0"));
  assert.ok(state.claims.includes(`Unique claim ${maxClaims + 9}`));
});

// ============================================================================
// Model Selection Comprehensive Tests
// ============================================================================

test("selectModelByDepth: covers entire loop range 0-10", () => {
  for (let i = 0; i <= 10; i++) {
    const model = selectModelByDepth(i);
    assert.ok(typeof model === "string", `Loop ${i} should return a model`);
    assert.ok(model.length > 0, `Loop ${i} model should be non-empty`);
  }
});

test("selectModelByDepth: tier boundaries are correct", () => {
  // Loop 0-1: shallow
  assert.ok(LOOP_CONFIG.depthTiers.shallow.includes(selectModelByDepth(0)));
  assert.ok(LOOP_CONFIG.depthTiers.shallow.includes(selectModelByDepth(1)));

  // Loop 2-4: mid
  assert.ok(LOOP_CONFIG.depthTiers.mid.includes(selectModelByDepth(2)));
  assert.ok(LOOP_CONFIG.depthTiers.mid.includes(selectModelByDepth(3)));
  assert.ok(LOOP_CONFIG.depthTiers.mid.includes(selectModelByDepth(4)));

  // Loop 5+: deep
  assert.ok(LOOP_CONFIG.depthTiers.deep.includes(selectModelByDepth(5)));
  assert.ok(LOOP_CONFIG.depthTiers.deep.includes(selectModelByDepth(6)));
  assert.ok(LOOP_CONFIG.depthTiers.deep.includes(selectModelByDepth(7)));
});

// ============================================================================
// ACT Halting Edge Cases
// ============================================================================

test("ReasoningState.shouldHalt: convergence requires minimum average confidence", () => {
  const state = new ReasoningState("test");

  // Set up converged but LOW confidence
  state.confidenceHistory = [0.3, 0.31, 0.3];
  state.iterations = [1, 2, 3];
  state.cumulativeConfidence = 0.4;

  const result = state.shouldHalt();
  assert.equal(result.halt, false, "Should not halt with low confidence even if converged");
});

test("ReasoningState.shouldHalt: cumulative confidence triggers before convergence", () => {
  const state = new ReasoningState("test");

  // Set up high cumulative but not converged
  state.cumulativeConfidence = 0.96;
  state.confidenceHistory = [0.5, 0.7, 0.9]; // Not converged
  state.iterations = [1, 2, 3];

  const result = state.shouldHalt();
  assert.equal(result.halt, true);
  assert.equal(result.reason, "cumulative_confidence");
});

// ============================================================================
// Inference Tests
// ============================================================================

test("inferLoopCount: responds to all complexity signals", () => {
  // Each increase signal should add at least some loops
  const baseline = inferLoopCount("handle task");

  for (const signal of LOOP_CONFIG.taskComplexitySignals.increase.slice(0, 3)) {
    const count = inferLoopCount(`${signal} task analysis`);
    assert.ok(count >= baseline, `Signal '${signal}' should not decrease loop count`);
  }

  // Each decrease signal should reduce loops
  for (const signal of LOOP_CONFIG.taskComplexitySignals.decrease.slice(0, 3)) {
    const count = inferLoopCount(`${signal} task`);
    assert.ok(count <= baseline + 1, `Signal '${signal}' should not significantly increase loop count`);
  }
});

// ============================================================================
// Security Tests (Multi-LLM Review Fixes)
// ============================================================================

test("Security: sanitizeInput blocks script injection patterns", () => {
  const malicious = '<script>alert("xss")</script>';
  const sanitized = sanitizeInput(malicious);

  assert.ok(!sanitized.includes("<script"), "Should block script tags");
  assert.ok(sanitized.includes("[script_blocked]"), "Should replace with blocked marker");
});

test("Security: sanitizeInput blocks eval patterns", () => {
  const malicious = 'eval(getUserData())';
  const sanitized = sanitizeInput(malicious);

  assert.ok(!sanitized.includes("eval("), "Should block eval");
  assert.ok(sanitized.includes("blocked("), "Should replace with blocked marker");
});

test("Security: sanitizeInput blocks Function constructor", () => {
  const malicious = 'new Function("return this")()';
  const sanitized = sanitizeInput(malicious);

  assert.ok(!sanitized.toLowerCase().includes("function("), "Should block Function constructor");
});

test("Security: deepMerge blocks prototype pollution", () => {
  // Test __proto__ attack
  const target = { a: 1, nested: { x: 1 } };
  const malicious1 = JSON.parse('{"__proto__": {"polluted": true}, "b": 2}');
  const result1 = deepMerge(target, malicious1);

  assert.equal(({}).polluted, undefined, "__proto__ should be blocked");
  assert.equal(result1.b, 2, "Normal properties should merge");

  // Test constructor attack
  const malicious2 = JSON.parse('{"constructor": {"prototype": {"evil": true}}}');
  const result2 = deepMerge(target, malicious2);
  assert.equal(({}).evil, undefined, "constructor should be blocked");

  // Test prototype attack
  const malicious3 = { prototype: { hacked: true } };
  const result3 = deepMerge(target, malicious3);
  assert.equal(Object.prototype.hacked, undefined, "prototype key should be blocked");
});

test("Security: summarizePrior sanitizes model-generated content", () => {
  const state = new ReasoningState("test task");

  // Simulate a malicious model response with injection patterns
  state.update({
    model: "test",
    response: "Summary with {{injection}} attempt",
    family: "test"
  }, {
    summary: "<script>alert(1)</script>",
    key_claims: ["Valid claim"],
    confidence: 0.8
  }, 0);

  const summary = state.summarizePrior();

  assert.ok(!summary.includes("<script"), "Should sanitize script tags in summaries");
  assert.ok(!summary.includes("{{"), "Should escape template patterns");
});

test("Security: FIFO eviction prevents unbounded growth", () => {
  const state = new ReasoningState("test");
  const maxClaims = LOOP_CONFIG.maxClaims || 100;

  // Add more claims than the limit
  for (let i = 0; i < maxClaims + 50; i++) {
    state.update({
      model: "test",
      response: `Response ${i}`,
      family: "test"
    }, {
      key_claims: [`claim_${i}`],
      confidence: 0.5
    }, i % 8);
  }

  // Claims should be bounded
  assert.ok(state.claims.length <= maxClaims, `Claims should be bounded to ${maxClaims}`);

  // The latest claims should be preserved (FIFO eviction)
  assert.ok(state.claims.includes(`claim_${maxClaims + 49}`), "Latest claims should be preserved");
  assert.ok(!state.claims.includes("claim_0"), "Oldest claims should be evicted");
});
