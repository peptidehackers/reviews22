import test from "node:test";
import assert from "node:assert/strict";

import { LLM_COUNCIL_MODELS } from "./models.js";
import { explainRouting, routeTask } from "./router.js";

test("strong consensus routes use the full council roster", () => {
  const route = routeTask("Investigate a security incident across the system and compare architectural tradeoffs");

  assert.equal(route.consensusMode, "strong");
  assert.deepEqual(route.consensusModels, LLM_COUNCIL_MODELS);
});

test("routing explanation exposes the expanded council", () => {
  const explanation = explainRouting("Investigate a security incident across the system and compare architectural tradeoffs");

  assert.equal(explanation.consensusMode, "strong");
  assert.deepEqual(explanation.consensusModels, LLM_COUNCIL_MODELS);
});
