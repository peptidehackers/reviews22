/**
 * Cost Tracker - Track usage and costs per model
 */

import { MODEL_COSTS } from "./models.js";

// In-memory usage log (resets on server restart)
const usageLog = [];

// Persistent session stats
let sessionStart = Date.now();

/**
 * Track usage for a model call
 */
export function trackUsage(model, inputTokens, outputTokens) {
  const cost = MODEL_COSTS[model] || { input: 1.0, output: 2.0 };
  const totalCost = (inputTokens * cost.input + outputTokens * cost.output) / 1_000_000;

  const entry = {
    timestamp: Date.now(),
    model,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    cost: totalCost
  };

  usageLog.push(entry);

  return totalCost;
}

/**
 * Get usage summary by model
 */
export function getUsageSummary() {
  const byModel = {};

  for (const entry of usageLog) {
    if (!byModel[entry.model]) {
      byModel[entry.model] = {
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        cost: 0
      };
    }

    byModel[entry.model].calls++;
    byModel[entry.model].inputTokens += entry.inputTokens;
    byModel[entry.model].outputTokens += entry.outputTokens;
    byModel[entry.model].totalTokens += entry.totalTokens;
    byModel[entry.model].cost += entry.cost;
  }

  // Calculate totals
  const totals = {
    calls: usageLog.length,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cost: 0
  };

  for (const stats of Object.values(byModel)) {
    totals.inputTokens += stats.inputTokens;
    totals.outputTokens += stats.outputTokens;
    totals.totalTokens += stats.totalTokens;
    totals.cost += stats.cost;
  }

  return {
    byModel,
    totals,
    sessionDuration: Date.now() - sessionStart,
    entryCount: usageLog.length
  };
}

/**
 * Get recent usage entries
 */
export function getRecentUsage(limit = 20) {
  return usageLog.slice(-limit).reverse();
}

/**
 * Get usage for a specific model
 */
export function getModelUsage(model) {
  const entries = usageLog.filter(e => e.model === model);

  const stats = {
    calls: entries.length,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cost: 0
  };

  for (const entry of entries) {
    stats.inputTokens += entry.inputTokens;
    stats.outputTokens += entry.outputTokens;
    stats.totalTokens += entry.totalTokens;
    stats.cost += entry.cost;
  }

  return stats;
}

/**
 * Reset usage tracking (new session)
 */
export function resetUsage() {
  usageLog.length = 0;
  sessionStart = Date.now();
  return { message: "Usage tracking reset" };
}

/**
 * Get cost estimate for a prompt (before calling)
 */
export function estimateCost(model, promptLength, expectedOutputLength = 1000) {
  const cost = MODEL_COSTS[model] || { input: 1.0, output: 2.0 };

  // Rough token estimation (4 chars per token)
  const inputTokens = Math.ceil(promptLength / 4);
  const outputTokens = Math.ceil(expectedOutputLength / 4);

  const estimated = (inputTokens * cost.input + outputTokens * cost.output) / 1_000_000;

  return {
    model,
    estimatedInputTokens: inputTokens,
    estimatedOutputTokens: outputTokens,
    estimatedCost: estimated,
    inputRate: cost.input,
    outputRate: cost.output
  };
}

/**
 * Format cost report as human-readable text
 */
export function formatCostReport() {
  const summary = getUsageSummary();
  const lines = [];

  lines.push("## Cost Report");
  lines.push("");
  lines.push(`Session Duration: ${formatDuration(summary.sessionDuration)}`);
  lines.push("");

  // By model
  lines.push("### By Model");
  lines.push("");
  lines.push("| Model | Calls | Input | Output | Total | Cost |");
  lines.push("|-------|-------|-------|--------|-------|------|");

  for (const [model, stats] of Object.entries(summary.byModel)) {
    lines.push(
      `| ${model} | ${stats.calls} | ${formatTokens(stats.inputTokens)} | ${formatTokens(stats.outputTokens)} | ${formatTokens(stats.totalTokens)} | $${stats.cost.toFixed(4)} |`
    );
  }

  lines.push("");
  lines.push("### Totals");
  lines.push("");
  lines.push(`- **Total Calls:** ${summary.totals.calls}`);
  lines.push(`- **Total Tokens:** ${formatTokens(summary.totals.totalTokens)}`);
  lines.push(`- **Total Cost:** $${summary.totals.cost.toFixed(4)}`);
  lines.push(`- **Avg Cost/Call:** $${(summary.totals.cost / Math.max(summary.totals.calls, 1)).toFixed(6)}`);

  return lines.join("\n");
}

/**
 * Format duration in human-readable form
 */
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Format token count in human-readable form
 */
function formatTokens(tokens) {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  } else if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
}
