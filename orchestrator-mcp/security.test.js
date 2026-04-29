import test from "node:test";
import assert from "node:assert/strict";

import {
  OPERATION_TYPES,
  enforceTrust,
  inferActionContext,
  validatePrompt
} from "./security.js";

test("validatePrompt downgrades dangerous literals during analysis", () => {
  const result = validatePrompt("Analyze this code: rm -rf /tmp and DELETE FROM users;", {
    model: "gpt54",
    operation: OPERATION_TYPES.ANALYZE,
    literalMode: true
  });

  assert.equal(result.valid, true);
  assert.equal(result.actionContext.literalMode, true);
  assert.ok(result.issues.every((issue) => issue.severity !== "critical"));
});

test("validatePrompt blocks destructive execute prompts", () => {
  const result = validatePrompt("rm -rf /", {
    model: "deepseek",
    operation: OPERATION_TYPES.DESTRUCTIVE
  });

  assert.equal(result.valid, false);
  assert.match(result.reason, /auto-denied/i);
});

test("inferActionContext detects analysis intent and resource sensitivity", () => {
  const context = inferActionContext("Review this production stack trace with API key references", {
    operation: OPERATION_TYPES.ANALYZE
  });

  assert.equal(context.analysisIntent, true);
  assert.equal(context.resource, "sensitive");
});

test("enforceTrust rejects low-trust destructive access", () => {
  const result = enforceTrust("llama", "Reset the production database", OPERATION_TYPES.DESTRUCTIVE);

  assert.equal(result.allowed, false);
  assert.match(result.reason, /not trusted/i);
});
