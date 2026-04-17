/**
 * Squirrel Integration - Website auditing for SEO, performance, security
 *
 * Provides website auditing with 230+ rules across 15+ categories
 */

import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

import { execSync } from "child_process";

/**
 * Check if Squirrel is available
 */
export function isSquirrelAvailable() {
  try {
    execSync("which squirrel", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Run a website audit
 */
export async function auditWebsite(url, options = {}) {
  const {
    maxPages = 50,
    coverage = "surface",  // quick, surface, full
    format = "llm",        // llm format is optimized for AI consumption
    refresh = false,
    verbose = false
  } = options;

  const args = [
    `"${url}"`,
    `-m ${maxPages}`,
    `-C ${coverage}`,
    `-f ${format}`
  ];

  if (refresh) args.push("-r");
  if (verbose) args.push("-v");

  try {
    const { stdout, stderr } = await execAsync(
      `squirrel audit ${args.join(" ")}`,
      {
        maxBuffer: 50 * 1024 * 1024,  // 50MB buffer for large audits
        timeout: 300000  // 5 minute timeout
      }
    );

    return {
      success: true,
      url,
      coverage,
      results: stdout.trim(),
      warnings: stderr.trim() || null
    };
  } catch (error) {
    return {
      success: false,
      url,
      error: error.message,
      stderr: error.stderr
    };
  }
}

/**
 * Quick audit - fast check for critical issues
 */
export async function quickAudit(url) {
  return auditWebsite(url, {
    maxPages: 10,
    coverage: "quick",
    format: "llm"
  });
}

/**
 * Full audit - comprehensive analysis
 */
export async function fullAudit(url, options = {}) {
  return auditWebsite(url, {
    ...options,
    coverage: "full",
    format: "llm"
  });
}

/**
 * Get audit report for a previously audited site
 */
export async function getReport(domain, options = {}) {
  const { format = "llm" } = options;

  try {
    const { stdout } = await execAsync(
      `squirrel report list --domain "${domain}" -f ${format}`,
      { maxBuffer: 10 * 1024 * 1024 }
    );

    return {
      success: true,
      domain,
      reports: stdout.trim()
    };
  } catch (error) {
    return {
      success: false,
      domain,
      error: error.message
    };
  }
}

/**
 * Audit categories available in Squirrel
 */
export const AUDIT_CATEGORIES = [
  "seo",
  "performance",
  "security",
  "accessibility",
  "technical",
  "content",
  "mobile",
  "images",
  "links",
  "meta-tags",
  "structured-data",
  "social",
  "analytics",
  "headers",
  "crawlability"
];

/**
 * Format audit results for consensus analysis
 */
export function formatAuditForAnalysis(auditResult) {
  if (!auditResult.success) {
    return `Audit failed: ${auditResult.error}`;
  }

  return `## Website Audit: ${auditResult.url}

Coverage: ${auditResult.coverage}

${auditResult.results}

${auditResult.warnings ? `\n### Warnings\n${auditResult.warnings}` : ""}`;
}
