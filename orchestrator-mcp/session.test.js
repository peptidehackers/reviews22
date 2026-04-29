import test from "node:test";
import assert from "node:assert/strict";

import {
  createSession,
  getSessionSummary,
  logConsensusRun,
  logMemoryEvent,
  logRoutingDecision,
  logSecurityEvent,
  resetSession
} from "./session.js";

test("session summary tracks routing, memory, security, and consensus telemetry", () => {
  resetSession();
  createSession({ id: "test-session", mode: "test" });

  logRoutingDecision({
    taskType: "security",
    intent: "security",
    risk: "high",
    scope: "cross-file",
    memoryMode: "hybrid",
    consensusMode: "strong",
    primaryModel: "gpt54"
  }, { source: "test" });
  logMemoryEvent({
    source: "test",
    enabled: true,
    mode: "hybrid",
    rationale: "needed",
    query: "auth bypass"
  });
  logSecurityEvent({
    source: "test",
    operation: "analyze",
    valid: true
  });
  logConsensusRun({ source: "test" });

  const summary = getSessionSummary();

  assert.equal(summary.consensusRuns, 1);
  assert.equal(summary.recentRouting.length, 1);
  assert.equal(summary.recentMemory.length, 1);
  assert.equal(summary.recentSecurity.length, 1);
  assert.equal(summary.recentRouting[0].primaryModel, "gpt54");
});
