import test from "node:test";
import assert from "node:assert/strict";

import { buildPrompt, getPrompt, getPromptComparison } from "./prompts.js";

test("getPrompt builds layered prompts", () => {
  const prompt = getPrompt("security", "gpt54", "const input = req.query.q;");

  assert.match(prompt, /## Identity/);
  assert.match(prompt, /## Operating Policy/);
  assert.match(prompt, /## Task Goal/);
  assert.match(prompt, /## Task Lens/);
  assert.match(prompt, /## Output Contract/);
  assert.match(prompt, /Content to Analyze/);
});

test("getPromptComparison returns both prompt styles and layers", () => {
  const comparison = getPromptComparison("architecture");

  assert.ok(comparison);
  assert.equal(comparison.layerNames.length, 6);
  assert.match(comparison.mechanics, /Mechanics Adapter/);
  assert.match(comparison.principles, /Principles Adapter/);
});

test("buildPrompt appends additional instructions", () => {
  const prompt = buildPrompt({
    taskType: "debug",
    model: "claude",
    context: "Stack trace goes here",
    additionalInstructions: "Prefer reproducible checks."
  });

  assert.match(prompt, /Additional Instructions/);
  assert.match(prompt, /Prefer reproducible checks/);
  assert.match(prompt, /Stack trace goes here/);
});
