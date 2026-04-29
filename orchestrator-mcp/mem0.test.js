import test from "node:test";
import assert from "node:assert/strict";

import {
  MEMORY_MODES,
  buildMemoryWritePayload,
  selectMemoryPolicy,
  shouldStoreMemory
} from "./mem0.js";

test("selectMemoryPolicy enables exact recall for explicit exact mode", () => {
  const policy = selectMemoryPolicy("Find session_info references", {
    explicit: true,
    mode: MEMORY_MODES.EXACT,
    content: "server.js route_explain"
  });

  assert.equal(policy.enabled, true);
  assert.equal(policy.mode, MEMORY_MODES.EXACT);
  assert.equal(policy.limit, 4);
  assert.match(policy.query, /session_info/i);
});

test("selectMemoryPolicy skips when router policy says none", () => {
  const policy = selectMemoryPolicy("Write a greeting", {
    explicit: true,
    mode: MEMORY_MODES.NONE
  });

  assert.equal(policy.enabled, false);
  assert.match(policy.rationale, /skipped recall/i);
});

test("buildMemoryWritePayload creates structured high-signal memory", () => {
  const payload = buildMemoryWritePayload({
    content: "Cache keys were stale after deploy",
    bugType: "cache invalidation",
    taskType: "debug",
    rootCause: "Versioned cache key omitted deployment id",
    fixApproach: "Include deployment id in cache key derivation",
    filesAffected: ["src/cache.ts", "src/deploy.ts"],
    confidence: 0.9
  });

  assert.equal(payload.shouldStore, true);
  assert.match(payload.content, /Root cause:/);
  assert.deepEqual(payload.metadata.files_affected, ["src/cache.ts", "src/deploy.ts"]);
  assert.equal(payload.metadata.memory_mode, MEMORY_MODES.SEMANTIC);
});

test("shouldStoreMemory rejects low-signal entries", () => {
  assert.equal(shouldStoreMemory({ content: "done" }), false);
});
