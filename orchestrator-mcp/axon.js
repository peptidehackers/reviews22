/**
 * Axon Integration - Graph-powered code intelligence
 *
 * Provides code analysis, symbol lookup, impact analysis, and dead code detection
 */

import { execSync, exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * Check if Axon is available
 */
export function isAxonAvailable() {
  try {
    execSync("which axon", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if current directory is indexed
 */
export async function getAxonStatus(path = ".") {
  try {
    const { stdout } = await execAsync(`cd "${path}" && axon status --json 2>/dev/null || axon status`);
    return { success: true, status: stdout.trim() };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Query the knowledge graph
 */
export async function axonQuery(query, options = {}) {
  const { limit = 20, path = "." } = options;

  try {
    const { stdout } = await execAsync(
      `cd "${path}" && axon query "${query.replace(/"/g, '\\"')}" -n ${limit}`,
      { maxBuffer: 10 * 1024 * 1024 }
    );
    return { success: true, results: stdout.trim(), query };
  } catch (error) {
    return { success: false, error: error.message, query };
  }
}

/**
 * Get 360-degree context for a symbol
 */
export async function axonContext(symbol, options = {}) {
  const { path = "." } = options;

  try {
    const { stdout } = await execAsync(
      `cd "${path}" && axon context "${symbol.replace(/"/g, '\\"')}"`,
      { maxBuffer: 10 * 1024 * 1024 }
    );
    return { success: true, context: stdout.trim(), symbol };
  } catch (error) {
    return { success: false, error: error.message, symbol };
  }
}

/**
 * Get blast radius / impact analysis for a symbol
 */
export async function axonImpact(symbol, options = {}) {
  const { path = "." } = options;

  try {
    const { stdout } = await execAsync(
      `cd "${path}" && axon impact "${symbol.replace(/"/g, '\\"')}"`,
      { maxBuffer: 10 * 1024 * 1024 }
    );
    return { success: true, impact: stdout.trim(), symbol };
  } catch (error) {
    return { success: false, error: error.message, symbol };
  }
}

/**
 * Find dead code in the repository
 */
export async function axonDeadCode(options = {}) {
  const { path = "." } = options;

  try {
    const { stdout } = await execAsync(
      `cd "${path}" && axon dead-code`,
      { maxBuffer: 10 * 1024 * 1024 }
    );
    return { success: true, deadCode: stdout.trim() };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Execute raw Cypher query
 */
export async function axonCypher(cypherQuery, options = {}) {
  const { path = "." } = options;

  try {
    const { stdout } = await execAsync(
      `cd "${path}" && axon cypher "${cypherQuery.replace(/"/g, '\\"')}"`,
      { maxBuffer: 10 * 1024 * 1024 }
    );
    return { success: true, results: stdout.trim(), query: cypherQuery };
  } catch (error) {
    return { success: false, error: error.message, query: cypherQuery };
  }
}

/**
 * Compare branches structurally
 */
export async function axonDiff(baseBranch, options = {}) {
  const { path = ".", targetBranch = "HEAD" } = options;

  try {
    const { stdout } = await execAsync(
      `cd "${path}" && axon diff ${baseBranch} ${targetBranch}`,
      { maxBuffer: 10 * 1024 * 1024 }
    );
    return { success: true, diff: stdout.trim(), baseBranch, targetBranch };
  } catch (error) {
    return { success: false, error: error.message, baseBranch, targetBranch };
  }
}

/**
 * Build system map using Axon (for multifix workflow)
 */
export async function buildSystemMap(entryPoints, options = {}) {
  const { path = "." } = options;
  const results = [];

  for (const entry of entryPoints) {
    // Get context for each entry point
    const context = await axonContext(entry, { path });
    if (context.success) {
      results.push({
        symbol: entry,
        context: context.context
      });
    }

    // Get impact analysis
    const impact = await axonImpact(entry, { path });
    if (impact.success) {
      results.push({
        symbol: entry,
        impact: impact.impact
      });
    }
  }

  return {
    success: true,
    entryPoints,
    results,
    summary: `Analyzed ${entryPoints.length} entry points, found ${results.length} context/impact results`
  };
}
