import test from "node:test";
import assert from "node:assert/strict";

import { explainRouting, routeTask } from "./router.js";

test("routeTask infers fast search profile", () => {
  const route = routeTask("Find files mentioning session_info");

  assert.equal(route.taskType, "fast-search");
  assert.equal(route.intent, "search");
  assert.equal(route.speedDepth, "fast");
  assert.equal(route.memoryMode, "exact");
  assert.equal(route.actionMode, "answer");
});

test("routeTask escalates security investigations", () => {
  const route = routeTask("Investigate auth bypass vulnerability across multiple services");

  assert.equal(route.taskType, "security");
  assert.equal(route.intent, "security");
  assert.equal(route.risk, "high");
  assert.equal(route.consensusMode, "strong");
  assert.equal(route.useParallel, true);
});

test("explainRouting exposes multi-axis routing details", () => {
  const explanation = explainRouting("Review this pull request for concurrency bugs");

  assert.equal(explanation.classification, "code-review");
  assert.equal(explanation.intent, "review");
  assert.equal(explanation.actionMode, "analyze");
  assert.ok(explanation.reasoning.includes("Intent inferred"));
});
