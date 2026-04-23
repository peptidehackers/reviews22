import test from "node:test";
import assert from "node:assert/strict";

import { LLM_COUNCIL_MODELS } from "./models.js";
import { routeTask } from "./router.js";

test("security routing uses the full council roster for consensus", () => {
  const route = routeTask("Investigate auth bypass vulnerability across multiple services");

  assert.equal(route.taskType, "security");
  assert.deepEqual(route.consensusModels, LLM_COUNCIL_MODELS);
});
