import test from "node:test";
import assert from "node:assert/strict";

import { describeVeniceRuntime } from "./venice-runtime.js";

test("describeVeniceRuntime reports venice as the heavy reasoning default", () => {
  const status = describeVeniceRuntime({
    env: {},
    sampleTask: "Build a new feature that coordinates multiple services"
  });

  assert.equal(status.providerConfigured, true);
  assert.equal(status.endpoint, "https://api.venice.ai/api/v1/chat/completions");
  assert.equal(status.envKey, "VENICE_API_KEY");
  assert.equal(status.hasVeniceKey, false);
  assert.equal(status.routerDefaults.heavyReasoning, "venice");
  assert.equal(status.routerDefaults.uncensored, "venice");
  assert.equal(status.sampleRoute.taskType, "heavy-reasoning");
  assert.equal(status.sampleRoute.primaryModel, "venice");
  assert.equal(status.sampleRoute.fallbackChain[0], "venice");
});
