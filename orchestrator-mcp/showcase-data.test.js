import test from "node:test";
import assert from "node:assert/strict";

import { buildShowcaseData } from "./showcase/lib/showcase-data.mjs";
import {
  readMinimaxTools,
  readOrchestratorTools,
  readShowcaseFile
} from "./showcase/lib/source-data.mjs";

test("showcase captures every orchestrator and minimax tool", () => {
  const data = buildShowcaseData();
  const groupedNames = data.toolGroups.flatMap((group) => group.tools.map((tool) => tool.name));
  const orchestratorNames = readOrchestratorTools().map((tool) => tool.name);
  const minimaxNames = readMinimaxTools().map((tool) => tool.name);

  assert.deepEqual(
    groupedNames.sort(),
    [...orchestratorNames, ...minimaxNames].sort()
  );
});

test("showcase file stays in sync with generated data", () => {
  assert.deepEqual(readShowcaseFile(), buildShowcaseData());
});

test("curated scenarios preserve the intended routing behavior", () => {
  const scenarios = Object.fromEntries(
    buildShowcaseData().scenarioRoutes.map((scenario) => [scenario.id, scenario.route])
  );

  assert.equal(scenarios["security-investigation"].taskType, "security");
  assert.equal(scenarios["security-investigation"].consensusMode, "strong");
  assert.equal(scenarios["fast-lookup"].taskType, "fast-search");
  assert.equal(scenarios["fast-lookup"].primaryModel, "minimax");
});
