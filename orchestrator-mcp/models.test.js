import test from "node:test";
import assert from "node:assert/strict";

import {
  LLM_COUNCIL_CHAIRMAN,
  LLM_COUNCIL_MODELS,
  getFallbackChain,
  getModelCost,
  listModels
} from "./models.js";

test("llm council preset models are registered", () => {
  const models = listModels();

  for (const model of LLM_COUNCIL_MODELS) {
    assert.ok(models.includes(model), `${model} should be available`);
  }

  assert.equal(LLM_COUNCIL_CHAIRMAN, "gemini3pro");
  assert.ok(LLM_COUNCIL_MODELS.includes("gpt54"));
  assert.ok(LLM_COUNCIL_MODELS.includes("claude"));
  assert.ok(LLM_COUNCIL_MODELS.includes("venice"));
  assert.ok(LLM_COUNCIL_MODELS.includes("minimax"));
});

test("native models stay native for codex and claude surfaces", () => {
  assert.equal(getModelCost("gpt54").provider, "codex");
  assert.equal(getModelCost("gpt54mini").provider, "codex");
  assert.equal(getModelCost("claude").provider, "native-claude");
  assert.equal(getModelCost("claude45").provider, "native-claude");
});

test("heavy reasoning fallback includes llm council frontier options", () => {
  const chain = getFallbackChain("heavy-reasoning");

  assert.deepEqual(chain.slice(0, 6), ["venice", "gpt54", "claude45", "gpt51", "grok4", "gemini3pro"]);
});
