/**
 * Security Module - Command validation, trust levels, and input sanitization
 * Based on Claude Code source patterns
 */

// Model trust levels
export const TRUST_LEVELS = {
  HIGH: "high",       // Execute any task, minimal validation
  MEDIUM: "medium",   // Standard validation, no destructive auto-approve
  LOW: "low"          // Strict validation, require approval for writes
};

// Trust level assignments per model
export const MODEL_TRUST = {
  // High trust - well-established providers
  claude: TRUST_LEVELS.HIGH,
  claude45: TRUST_LEVELS.HIGH,
  "claude-haiku": TRUST_LEVELS.HIGH,
  gpt4o: TRUST_LEVELS.HIGH,
  gpt51: TRUST_LEVELS.HIGH,
  "gpt54": TRUST_LEVELS.HIGH,
  "gpt54mini": TRUST_LEVELS.HIGH,

  // Medium trust - reliable but secondary
  deepseek: TRUST_LEVELS.MEDIUM,
  gemini: TRUST_LEVELS.MEDIUM,
  gemini3pro: TRUST_LEVELS.MEDIUM,
  grok4: TRUST_LEVELS.MEDIUM,
  moonshot: TRUST_LEVELS.MEDIUM,
  minimax: TRUST_LEVELS.MEDIUM,
  qwen: TRUST_LEVELS.MEDIUM,
  venice: TRUST_LEVELS.MEDIUM,  // Upgraded - legitimate provider with uncensored option
  chutes: TRUST_LEVELS.MEDIUM,  // Upgraded - legitimate decentralized provider

  // Low trust - experimental
  llama: TRUST_LEVELS.LOW
};

// Dangerous patterns to block or flag
const DANGEROUS_PATTERNS = {
  command_injection: [
    /`[^`]+`/,                           // Backtick command substitution
    /\$\([^)]+\)/,                        // $() command substitution
    /;\s*(rm|sudo|chmod|chown|dd|mkfs)/i, // Command chaining with dangerous ops
    /\|\s*(sh|bash|zsh|exec)/i            // Pipe to shell
  ],
  path_traversal: [
    /\.\.\//,                             // Directory traversal
    /\/etc\/(passwd|shadow|sudoers)/,     // Sensitive system files
    /~\/\.(ssh|gnupg|aws)/                // Credential directories
  ],
  secrets_exposure: [
    /api[_-]?key\s*[=:]/i,
    /password\s*[=:]/i,
    /secret\s*[=:]/i,
    /token\s*[=:]/i,
    /credential/i
  ],
  destructive_sql: [
    /drop\s+(table|database)/i,
    /truncate\s+table/i,
    /delete\s+from\s+\w+\s*;/i,           // DELETE without WHERE
    /update\s+\w+\s+set\s+.*\s*;/i        // UPDATE without WHERE
  ]
};

// Auto-deny patterns (never execute)
const AUTO_DENY_PATTERNS = [
  /rm\s+-rf\s+[\/~]/,                     // rm -rf with root or home
  /sudo\s+rm/,                             // sudo rm anything
  /chmod\s+777/,                           // World writable
  />\s*\/dev\/sd[a-z]/,                    // Write to disk device
  /mkfs/,                                  // Format filesystem
  /dd\s+if.*of=\/dev/,                     // dd to device
  /:(){ :|:& };:/                          // Fork bomb
];

/**
 * Get trust level for a model
 */
export function getModelTrust(model) {
  return MODEL_TRUST[model] || TRUST_LEVELS.LOW;
}

/**
 * Validate a prompt for security issues
 */
export function validatePrompt(prompt, options = {}) {
  const { model = "unknown", strict = false } = options;
  const trustLevel = getModelTrust(model);
  const issues = [];

  // Check auto-deny patterns first
  for (const pattern of AUTO_DENY_PATTERNS) {
    if (pattern.test(prompt)) {
      return {
        valid: false,
        blocked: true,
        reason: "auto-denied: dangerous command pattern detected",
        pattern: pattern.source
      };
    }
  }

  // Check dangerous patterns
  for (const [category, patterns] of Object.entries(DANGEROUS_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(prompt)) {
        issues.push({
          category,
          pattern: pattern.source,
          severity: getSeverity(category, trustLevel)
        });
      }
    }
  }

  // Filter based on trust level
  const criticalIssues = issues.filter(i => i.severity === "critical");
  const warnings = issues.filter(i => i.severity === "warning");

  // Decision based on trust level and issues
  let valid = true;
  let reason = "prompt validated";

  if (criticalIssues.length > 0) {
    valid = false;
    reason = `blocked: ${criticalIssues.length} critical security issue(s)`;
  } else if (strict && warnings.length > 0) {
    valid = false;
    reason = `strict mode: ${warnings.length} warning(s) require review`;
  }

  return {
    valid,
    blocked: !valid,
    trustLevel,
    issues,
    criticalCount: criticalIssues.length,
    warningCount: warnings.length,
    reason
  };
}

/**
 * Get severity based on category and trust level
 */
function getSeverity(category, trustLevel) {
  const severityMatrix = {
    command_injection: {
      [TRUST_LEVELS.HIGH]: "warning",
      [TRUST_LEVELS.MEDIUM]: "critical",
      [TRUST_LEVELS.LOW]: "critical"
    },
    path_traversal: {
      [TRUST_LEVELS.HIGH]: "warning",
      [TRUST_LEVELS.MEDIUM]: "warning",
      [TRUST_LEVELS.LOW]: "critical"
    },
    secrets_exposure: {
      [TRUST_LEVELS.HIGH]: "warning",
      [TRUST_LEVELS.MEDIUM]: "warning",
      [TRUST_LEVELS.LOW]: "critical"
    },
    destructive_sql: {
      [TRUST_LEVELS.HIGH]: "warning",
      [TRUST_LEVELS.MEDIUM]: "critical",
      [TRUST_LEVELS.LOW]: "critical"
    }
  };

  return severityMatrix[category]?.[trustLevel] || "warning";
}

/**
 * Sanitize prompt for safer execution
 */
export function sanitizePrompt(prompt) {
  let sanitized = prompt;

  // Remove potential command injection
  sanitized = sanitized.replace(/`[^`]+`/g, "[command-removed]");
  sanitized = sanitized.replace(/\$\([^)]+\)/g, "[subshell-removed]");

  // Flag but don't remove path traversal (might be legitimate)
  sanitized = sanitized.replace(/\.\.\//g, "[../-flagged]");

  return {
    original: prompt,
    sanitized,
    modified: sanitized !== prompt
  };
}

/**
 * Check if model is trusted for a specific operation
 */
export function isTrustedFor(model, operation) {
  const trust = getModelTrust(model);

  const trustRequirements = {
    "destructive": TRUST_LEVELS.HIGH,
    "write": TRUST_LEVELS.MEDIUM,
    "execute": TRUST_LEVELS.MEDIUM,
    "read": TRUST_LEVELS.LOW
  };

  const required = trustRequirements[operation] || TRUST_LEVELS.MEDIUM;

  const trustOrder = [TRUST_LEVELS.LOW, TRUST_LEVELS.MEDIUM, TRUST_LEVELS.HIGH];
  const modelTrustIndex = trustOrder.indexOf(trust);
  const requiredIndex = trustOrder.indexOf(required);

  return modelTrustIndex >= requiredIndex;
}

/**
 * Enforce trust level validation before model call
 */
export function enforceTrust(model, prompt, operation = "execute") {
  const trustLevel = getModelTrust(model);
  const validation = validatePrompt(prompt, { model });

  if (!validation.valid) {
    return {
      allowed: false,
      reason: validation.reason,
      trustLevel,
      issues: validation.issues
    };
  }

  if (!isTrustedFor(model, operation)) {
    return {
      allowed: false,
      reason: `model ${model} (trust: ${trustLevel}) not trusted for ${operation}`,
      trustLevel,
      requiredTrust: operation === "destructive" ? TRUST_LEVELS.HIGH : TRUST_LEVELS.MEDIUM
    };
  }

  return {
    allowed: true,
    reason: "trust and validation passed",
    trustLevel,
    model
  };
}

/**
 * Rate limit tracking for models
 */
const rateLimits = new Map();

export function checkRateLimit(model, options = {}) {
  const { maxPerMinute = 30, maxPerHour = 500 } = options;
  const now = Date.now();
  const key = model;

  if (!rateLimits.has(key)) {
    rateLimits.set(key, { minute: [], hour: [] });
  }

  const limits = rateLimits.get(key);

  // Clean old entries
  limits.minute = limits.minute.filter(t => t > now - 60000);
  limits.hour = limits.hour.filter(t => t > now - 3600000);

  // Check limits
  if (limits.minute.length >= maxPerMinute) {
    return { allowed: false, reason: `rate limit: ${maxPerMinute}/min exceeded`, retryAfter: 60 };
  }
  if (limits.hour.length >= maxPerHour) {
    return { allowed: false, reason: `rate limit: ${maxPerHour}/hour exceeded`, retryAfter: 3600 };
  }

  // Record this call
  limits.minute.push(now);
  limits.hour.push(now);

  return { allowed: true };
}

/**
 * Reset rate limits (for testing)
 */
export function resetRateLimits() {
  rateLimits.clear();
}
