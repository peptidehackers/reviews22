import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeStructuredResponses,
  parseStructuredConsensusResponse
} from "./consensus.js";

test("parseStructuredConsensusResponse extracts fenced json", () => {
  const parsed = parseStructuredConsensusResponse(`\`\`\`json
{"summary":"Safe fix","key_claims":["claim one"],"risks":["risk one"],"recommended_action":"Apply the safe fix","blockers":[],"confidence":0.82,"rationale":"Evidence supports it"}
\`\`\``);

  assert.equal(parsed.success, true);
  assert.equal(parsed.data.recommended_action, "Apply the safe fix");
  assert.equal(parsed.data.key_claims.length, 1);
});

test("analyzeStructuredResponses finds disagreement on recommended action", () => {
  const analysis = analyzeStructuredResponses([
    {
      model: "gpt54",
      family: "gpt-like",
      structured: {
        summary: "A",
        key_claims: ["Cache invalidation is broken"],
        risks: ["Stale reads"],
        recommended_action: "Add explicit cache busting",
        blockers: [],
        confidence: 0.8,
        rationale: "A"
      }
    },
    {
      model: "deepseek",
      family: "claude-like",
      structured: {
        summary: "B",
        key_claims: ["Cache invalidation is broken"],
        risks: ["Stale reads"],
        recommended_action: "Remove the cache layer temporarily",
        blockers: [],
        confidence: 0.7,
        rationale: "B"
      }
    }
  ]);

  assert.equal(analysis.mode, "structured");
  assert.equal(analysis.disagreements.length, 1);
  assert.equal(analysis.commonPoints.length, 1);
  assert.match(analysis.summary, /Recommended Action/);
});
