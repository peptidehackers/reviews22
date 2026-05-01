import test from "node:test";
import assert from "node:assert/strict";

import { getConfigDir, loadConfig } from "./config-loader.js";

test("loadConfig reads policy files from config directory", () => {
  const models = loadConfig("models.json");
  const router = loadConfig("router.json");

  assert.ok(getConfigDir().endsWith("/orchestrator-mcp/config"));
  assert.equal(models.llmCouncil.chairman, "gemini3pro");
  assert.equal(router.primaryModels["heavy-reasoning"], "venice");
});
