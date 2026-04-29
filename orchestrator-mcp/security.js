/**
 * Security Module - Command validation, trust levels, and input sanitization.
 */

import { compileRegexList, loadConfig } from "./config-loader.js";

const config = loadConfig("security.json");

export const TRUST_LEVELS = {
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low"
};

export const MODEL_TRUST = config.modelTrust;
export const OPERATION_TYPES = {
  READ: config.operationTypes.read,
  ANALYZE: config.operationTypes.analyze,
  WRITE: config.operationTypes.write,
  EXECUTE: config.operationTypes.execute,
  DESTRUCTIVE: config.operationTypes.destructive
};

const DANGEROUS_PATTERNS = Object.fromEntries(
  Object.entries(config.dangerousPatterns).map(([category, patterns]) => [category, compileRegexList(patterns)])
);
const AUTO_DENY_PATTERNS = compileRegexList(config.autoDenyPatterns);
const ANALYSIS_HINTS = compileRegexList(config.analysisHints);
const RESOURCE_SENSITIVE_PATTERNS = compileRegexList(config.resourceSensitivePatterns);
const DESTRUCTIVE_INTENT_PATTERNS = compileRegexList(config.destructiveIntentPatterns);
const LITERAL_MODE_PATTERNS = compileRegexList(config.literalModePatterns);

function normalizeOperation(operation) {
  const normalized = String(operation || "").toLowerCase();
  return Object.values(OPERATION_TYPES).includes(normalized)
    ? normalized
    : OPERATION_TYPES.EXECUTE;
}

function matchesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

export function getModelTrust(model) {
  return MODEL_TRUST[model] || TRUST_LEVELS.LOW;
}

export function inferActionContext(prompt, options = {}) {
  const operation = normalizeOperation(options.operation);
  const literalMode = Boolean(
    options.literalMode ||
    matchesAny(prompt, LITERAL_MODE_PATTERNS) ||
    matchesAny(prompt, ANALYSIS_HINTS)
  );

  const resource = options.resource || (
    matchesAny(prompt, RESOURCE_SENSITIVE_PATTERNS)
      ? "sensitive"
      : "standard"
  );

  const destructiveIntent = operation === OPERATION_TYPES.DESTRUCTIVE ||
    matchesAny(prompt, DESTRUCTIVE_INTENT_PATTERNS);

  return {
    operation,
    literalMode,
    resource,
    destructiveIntent,
    analysisIntent: operation === OPERATION_TYPES.READ ||
      operation === OPERATION_TYPES.ANALYZE ||
      matchesAny(prompt, ANALYSIS_HINTS)
  };
}

function getSeverity(category, trustLevel, actionContext) {
  const operation = actionContext.operation;
  const literalMode = actionContext.literalMode;

  if (literalMode && (operation === OPERATION_TYPES.READ || operation === OPERATION_TYPES.ANALYZE)) {
    if (category === "destructive_sql" || category === "command_injection") {
      return "warning";
    }
    return "info";
  }

  const destructiveBias = operation === OPERATION_TYPES.DESTRUCTIVE ? 1 : 0;

  const severityMatrix = {
    command_injection: {
      [TRUST_LEVELS.HIGH]: destructiveBias ? "critical" : "warning",
      [TRUST_LEVELS.MEDIUM]: "critical",
      [TRUST_LEVELS.LOW]: "critical"
    },
    path_traversal: {
      [TRUST_LEVELS.HIGH]: actionContext.resource === "sensitive" ? "critical" : "warning",
      [TRUST_LEVELS.MEDIUM]: "warning",
      [TRUST_LEVELS.LOW]: "critical"
    },
    secrets_exposure: {
      [TRUST_LEVELS.HIGH]: actionContext.resource === "sensitive" ? "critical" : "warning",
      [TRUST_LEVELS.MEDIUM]: "warning",
      [TRUST_LEVELS.LOW]: "critical"
    },
    destructive_sql: {
      [TRUST_LEVELS.HIGH]: operation === OPERATION_TYPES.WRITE ? "critical" : "warning",
      [TRUST_LEVELS.MEDIUM]: "critical",
      [TRUST_LEVELS.LOW]: "critical"
    }
  };

  return severityMatrix[category]?.[trustLevel] || "warning";
}

export function validatePrompt(prompt, options = {}) {
  const { model = "unknown", strict = false } = options;
  const trustLevel = getModelTrust(model);
  const actionContext = inferActionContext(prompt, options);
  const issues = [];

  for (const pattern of AUTO_DENY_PATTERNS) {
    if (pattern.test(prompt) && !actionContext.literalMode) {
      return {
        valid: false,
        blocked: true,
        reason: "auto-denied: dangerous command pattern detected",
        pattern: pattern.source,
        trustLevel,
        actionContext,
        issues: []
      };
    }
  }

  for (const [category, patterns] of Object.entries(DANGEROUS_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(prompt)) {
        issues.push({
          category,
          pattern: pattern.source,
          severity: getSeverity(category, trustLevel, actionContext)
        });
      }
    }
  }

  const criticalIssues = issues.filter((issue) => issue.severity === "critical");
  const warningIssues = issues.filter((issue) => issue.severity === "warning");

  let valid = true;
  let reason = "prompt validated";

  if (criticalIssues.length > 0) {
    valid = false;
    reason = `blocked: ${criticalIssues.length} critical security issue(s)`;
  } else if (strict && warningIssues.length > 0) {
    valid = false;
    reason = `strict mode: ${warningIssues.length} warning(s) require review`;
  }

  return {
    valid,
    blocked: !valid,
    trustLevel,
    actionContext,
    issues,
    criticalCount: criticalIssues.length,
    warningCount: warningIssues.length,
    reason
  };
}

export function sanitizePrompt(prompt) {
  let sanitized = prompt;
  sanitized = sanitized.replace(/`[^`]+`/g, "[command-removed]");
  sanitized = sanitized.replace(/\$\([^)]+\)/g, "[subshell-removed]");
  sanitized = sanitized.replace(/\.\.\//g, "[../-flagged]");

  return {
    original: prompt,
    sanitized,
    modified: sanitized !== prompt
  };
}

export function isTrustedFor(model, operation) {
  const trust = getModelTrust(model);
  const required = config.trustRequirements[normalizeOperation(operation)] || TRUST_LEVELS.MEDIUM;
  const trustOrder = [TRUST_LEVELS.LOW, TRUST_LEVELS.MEDIUM, TRUST_LEVELS.HIGH];

  return trustOrder.indexOf(trust) >= trustOrder.indexOf(required);
}

export function enforceTrust(model, prompt, operation = OPERATION_TYPES.EXECUTE, options = {}) {
  const trustLevel = getModelTrust(model);
  const validation = validatePrompt(prompt, { ...options, model, operation });

  if (!validation.valid) {
    return {
      allowed: false,
      reason: validation.reason,
      trustLevel,
      issues: validation.issues,
      actionContext: validation.actionContext
    };
  }

  if (!isTrustedFor(model, operation)) {
    return {
      allowed: false,
      reason: `model ${model} (trust: ${trustLevel}) not trusted for ${operation}`,
      trustLevel,
      requiredTrust: operation === OPERATION_TYPES.DESTRUCTIVE ? TRUST_LEVELS.HIGH : TRUST_LEVELS.MEDIUM,
      actionContext: validation.actionContext
    };
  }

  return {
    allowed: true,
    reason: "trust and validation passed",
    trustLevel,
    model,
    actionContext: validation.actionContext
  };
}

const rateLimits = new Map();

export function checkRateLimit(model, options = {}) {
  const { maxPerMinute = 30, maxPerHour = 500 } = options;
  const now = Date.now();
  const key = model;

  if (!rateLimits.has(key)) {
    rateLimits.set(key, { minute: [], hour: [] });
  }

  const limits = rateLimits.get(key);
  limits.minute = limits.minute.filter((timestamp) => timestamp > now - 60000);
  limits.hour = limits.hour.filter((timestamp) => timestamp > now - 3600000);

  if (limits.minute.length >= maxPerMinute) {
    return { allowed: false, reason: `rate limit: ${maxPerMinute}/min exceeded`, retryAfter: 60 };
  }

  if (limits.hour.length >= maxPerHour) {
    return { allowed: false, reason: `rate limit: ${maxPerHour}/hour exceeded`, retryAfter: 3600 };
  }

  limits.minute.push(now);
  limits.hour.push(now);

  return { allowed: true };
}
