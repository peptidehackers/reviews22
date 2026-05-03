/**
 * @fileoverview Preflight Checks Module (claude-code-harness pattern)
 *
 * Implements worker contract validation before execution:
 * - Validate code context exists
 * - Check entry points are resolvable
 * - Verify memory systems are available
 * - Validate security context
 *
 * Usage:
 *   const preflight = await runPreflightChecks(taskContext);
 *   if (!preflight.ready) {
 *     return { blocked: true, reason: preflight.errors };
 *   }
 *
 * @module preflight
 */

import { isMem0Available } from "./memory.js";
import { emitProgress, PROGRESS_EVENTS } from "./session.js";

// ============================================================================
// Preflight Check Registry
// ============================================================================

/**
 * Check result structure
 * @typedef {Object} CheckResult
 * @property {boolean} passed - Whether the check passed
 * @property {string} name - Check name
 * @property {string} [error] - Error message if failed
 * @property {string} [warning] - Warning message (non-blocking)
 * @property {number} durationMs - Time taken for check
 */

/**
 * Preflight result structure
 * @typedef {Object} PreflightResult
 * @property {boolean} ready - Whether all critical checks passed
 * @property {boolean} hasWarnings - Whether any warnings were raised
 * @property {CheckResult[]} checks - All check results
 * @property {string[]} errors - Error messages from failed checks
 * @property {string[]} warnings - Warning messages
 * @property {number} totalDurationMs - Total preflight time
 */

/**
 * Check severity levels
 */
export const CHECK_SEVERITY = {
  CRITICAL: "critical",   // Blocks execution
  WARNING: "warning",     // Logged but doesn't block
  INFO: "info"           // Informational only
};

/**
 * Built-in preflight checks
 */
const PREFLIGHT_CHECKS = {
  /**
   * Check that code context is provided and non-empty
   */
  context_exists: {
    name: "Code Context Exists",
    severity: CHECK_SEVERITY.WARNING,
    check: async (ctx) => {
      const hasContext = ctx.codeContext && ctx.codeContext.trim().length > 0;
      return {
        passed: hasContext,
        message: hasContext
          ? `Context provided (${ctx.codeContext.length} chars)`
          : "No code context provided - analysis may be limited"
      };
    }
  },

  /**
   * Check that entry points are provided (for Axon integration)
   */
  entry_points_provided: {
    name: "Entry Points Provided",
    severity: CHECK_SEVERITY.INFO,
    check: async (ctx) => {
      const hasEntryPoints = Array.isArray(ctx.entryPoints) && ctx.entryPoints.length > 0;
      return {
        passed: hasEntryPoints,
        message: hasEntryPoints
          ? `${ctx.entryPoints.length} entry point(s) provided`
          : "No entry points - Axon system mapping will be skipped"
      };
    }
  },

  /**
   * Check that Mem0 is available for memory recall
   */
  memory_available: {
    name: "Memory System Available",
    severity: CHECK_SEVERITY.WARNING,
    check: async (ctx) => {
      const isAvailable = isMem0Available();
      return {
        passed: isAvailable,
        message: isAvailable
          ? "Mem0 available for memory recall"
          : "Mem0 not configured - past fixes won't be recalled"
      };
    }
  },

  /**
   * Check that bug description is meaningful
   */
  description_meaningful: {
    name: "Bug Description Meaningful",
    severity: CHECK_SEVERITY.CRITICAL,
    check: async (ctx) => {
      const desc = ctx.bugDescription || ctx.prompt || "";
      const wordCount = desc.trim().split(/\s+/).length;
      const isMeaningful = wordCount >= 3;
      return {
        passed: isMeaningful,
        message: isMeaningful
          ? `Description contains ${wordCount} words`
          : "Bug description too short (< 3 words) - provide more detail"
      };
    }
  },

  /**
   * Check that models are specified
   */
  models_specified: {
    name: "Models Specified",
    severity: CHECK_SEVERITY.WARNING,
    check: async (ctx) => {
      const models = ctx.models || [];
      const hasModels = Array.isArray(models) && models.length > 0;
      return {
        passed: hasModels,
        message: hasModels
          ? `${models.length} model(s) specified: ${models.join(", ")}`
          : "No models specified - will use defaults"
      };
    }
  },

  /**
   * Check for dangerous patterns in prompt (security)
   */
  prompt_safe: {
    name: "Prompt Safety Check",
    severity: CHECK_SEVERITY.CRITICAL,
    check: async (ctx) => {
      const prompt = ctx.bugDescription || ctx.prompt || "";
      const dangerousPatterns = [
        /rm\s+-rf\s+\//i,
        /DROP\s+DATABASE/i,
        /DELETE\s+FROM\s+.*WHERE\s+1\s*=\s*1/i,
        /eval\s*\(/i,
        /curl.*\|\s*sh/i
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(prompt)) {
          return {
            passed: false,
            message: `Dangerous pattern detected: ${pattern.source}`
          };
        }
      }

      return {
        passed: true,
        message: "No dangerous patterns detected"
      };
    }
  },

  /**
   * Check that council mode is valid
   */
  council_mode_valid: {
    name: "Council Mode Valid",
    severity: CHECK_SEVERITY.WARNING,
    check: async (ctx) => {
      const validModes = ["quick", "standard", "full", "auto", null, undefined];
      const mode = ctx.councilMode;
      const isValid = validModes.includes(mode);
      return {
        passed: isValid,
        message: isValid
          ? `Council mode: ${mode || "default"}`
          : `Invalid council mode "${mode}" - will use default`
      };
    }
  }
};

// ============================================================================
// Preflight Execution
// ============================================================================

/**
 * Run all preflight checks for a task context.
 *
 * @param {Object} taskContext - Task context to validate
 * @param {string} taskContext.bugDescription - Bug description
 * @param {string} taskContext.codeContext - Code context
 * @param {string[]} taskContext.entryPoints - Entry points for Axon
 * @param {string[]} taskContext.models - Models to use
 * @param {string} taskContext.councilMode - Council mode
 * @param {Object} options - Preflight options
 * @param {string[]} options.skipChecks - Check names to skip
 * @param {string[]} options.onlyChecks - Only run these checks
 * @returns {Promise<PreflightResult>} Preflight result
 */
export async function runPreflightChecks(taskContext, options = {}) {
  const { skipChecks = [], onlyChecks = null } = options;
  const startTime = Date.now();

  emitProgress(PROGRESS_EVENTS.START, {
    phase: "preflight_start",
    checkCount: Object.keys(PREFLIGHT_CHECKS).length
  });

  const results = [];
  const errors = [];
  const warnings = [];

  // Determine which checks to run
  let checksToRun = Object.entries(PREFLIGHT_CHECKS);
  if (onlyChecks) {
    checksToRun = checksToRun.filter(([name]) => onlyChecks.includes(name));
  }
  checksToRun = checksToRun.filter(([name]) => !skipChecks.includes(name));

  // Run checks in parallel
  const checkPromises = checksToRun.map(async ([checkName, checkDef]) => {
    const checkStart = Date.now();

    try {
      const result = await checkDef.check(taskContext);
      const checkResult = {
        name: checkDef.name,
        checkId: checkName,
        severity: checkDef.severity,
        passed: result.passed,
        message: result.message,
        durationMs: Date.now() - checkStart
      };

      if (!result.passed) {
        if (checkDef.severity === CHECK_SEVERITY.CRITICAL) {
          checkResult.error = result.message;
          errors.push(result.message);
        } else if (checkDef.severity === CHECK_SEVERITY.WARNING) {
          checkResult.warning = result.message;
          warnings.push(result.message);
        }
      }

      return checkResult;

    } catch (err) {
      const checkResult = {
        name: checkDef.name,
        checkId: checkName,
        severity: checkDef.severity,
        passed: false,
        error: `Check threw error: ${err.message}`,
        durationMs: Date.now() - checkStart
      };

      if (checkDef.severity === CHECK_SEVERITY.CRITICAL) {
        errors.push(checkResult.error);
      } else {
        warnings.push(checkResult.error);
      }

      return checkResult;
    }
  });

  const checkResults = await Promise.all(checkPromises);
  results.push(...checkResults);

  const totalDurationMs = Date.now() - startTime;
  const ready = errors.length === 0;
  const hasWarnings = warnings.length > 0;

  emitProgress(PROGRESS_EVENTS.START, {
    phase: "preflight_complete",
    ready,
    errors: errors.length,
    warnings: warnings.length,
    durationMs: totalDurationMs
  });

  return {
    ready,
    hasWarnings,
    checks: results,
    errors,
    warnings,
    totalDurationMs
  };
}

/**
 * Register a custom preflight check.
 *
 * @param {string} name - Unique check name
 * @param {Object} checkDef - Check definition
 * @param {string} checkDef.name - Human-readable name
 * @param {string} checkDef.severity - Check severity (critical/warning/info)
 * @param {Function} checkDef.check - Async check function (ctx) => { passed, message }
 */
export function registerPreflightCheck(name, checkDef) {
  if (PREFLIGHT_CHECKS[name]) {
    throw new Error(`Preflight check "${name}" already exists`);
  }
  PREFLIGHT_CHECKS[name] = checkDef;
}

/**
 * Get list of registered preflight checks.
 * @returns {string[]} Check names
 */
export function listPreflightChecks() {
  return Object.entries(PREFLIGHT_CHECKS).map(([id, def]) => ({
    id,
    name: def.name,
    severity: def.severity
  }));
}

/**
 * Format preflight result for display.
 * @param {PreflightResult} result - Preflight result
 * @returns {string} Formatted output
 */
export function formatPreflightResult(result) {
  const lines = [];

  lines.push("## Preflight Checks");
  lines.push("");
  lines.push(`**Status:** ${result.ready ? "✓ Ready" : "✗ Blocked"}`);
  lines.push(`**Duration:** ${result.totalDurationMs}ms`);
  lines.push("");

  // Group by status
  const passed = result.checks.filter(c => c.passed);
  const failed = result.checks.filter(c => !c.passed);

  if (failed.length > 0) {
    lines.push("### Failed Checks");
    for (const check of failed) {
      const icon = check.severity === CHECK_SEVERITY.CRITICAL ? "✗" : "⚠";
      lines.push(`- ${icon} **${check.name}**: ${check.error || check.warning}`);
    }
    lines.push("");
  }

  if (passed.length > 0) {
    lines.push("### Passed Checks");
    for (const check of passed) {
      lines.push(`- ✓ ${check.name}: ${check.message}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
