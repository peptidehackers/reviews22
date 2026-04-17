/**
 * Permission System - 4-mode permission enforcement for model calls
 * Based on Claude Code source patterns
 */

// Permission modes
export const PERMISSION_MODES = {
  DEFAULT: "default",   // Interactive - ask before destructive ops
  PLAN: "plan",         // Research only - no writes/edits/execution
  AUTO: "auto",         // Auto-approve safe operations
  BYPASS: "bypass"      // Full trust - skip all checks (dangerous)
};

// Current session state
let currentMode = PERMISSION_MODES.DEFAULT;
let denialHistory = [];
let approvalCache = new Map();

// Operations by category
const OPERATION_CATEGORIES = {
  read_only: [
    "search", "find", "list", "query", "analyze", "review",
    "explain", "summarize", "compare", "check"
  ],
  write_ops: [
    "edit", "modify", "update", "change", "refactor", "fix", "patch"
  ],
  destructive: [
    "delete", "remove", "drop", "truncate", "reset", "destroy"
  ],
  execution: [
    "run", "execute", "deploy", "install", "build", "compile"
  ]
};

// Auto-approve patterns (safe operations)
const AUTO_APPROVE_PATTERNS = [
  /^(search|find|list|get|read|query)\s/i,
  /^analyze\s/i,
  /^explain\s/i,
  /^compare\s/i,
  /^describe\s/i,
  /^what\s+(is|are|does|do)\s/i,
  /^how\s+(does|do|to)\s/i
];

// Require approval patterns
const REQUIRE_APPROVAL_PATTERNS = [
  /delete|remove|drop/i,
  /overwrite|replace\s+all/i,
  /deploy|publish|release/i,
  /reset|wipe|clear\s+all/i,
  /force|--force/i
];

/**
 * Set the current permission mode
 */
export function setPermissionMode(mode) {
  if (!Object.values(PERMISSION_MODES).includes(mode)) {
    throw new Error(`Invalid permission mode: ${mode}. Valid: ${Object.values(PERMISSION_MODES).join(", ")}`);
  }
  currentMode = mode;
  return { mode: currentMode, timestamp: new Date().toISOString() };
}

/**
 * Get current permission mode
 */
export function getPermissionMode() {
  return currentMode;
}

/**
 * Classify an operation/prompt into a category
 */
export function classifyOperation(prompt) {
  const lower = prompt.toLowerCase();

  for (const [category, keywords] of Object.entries(OPERATION_CATEGORIES)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        return category;
      }
    }
  }

  return "unknown";
}

/**
 * Check if operation is allowed in current mode
 */
export function checkPermission(prompt, options = {}) {
  const { model = "unknown", operation = null } = options;
  const category = operation || classifyOperation(prompt);

  const result = {
    allowed: false,
    mode: currentMode,
    category,
    reason: null,
    requiresApproval: false
  };

  switch (currentMode) {
    case PERMISSION_MODES.BYPASS:
      // Everything allowed
      result.allowed = true;
      result.reason = "bypass mode - all operations permitted";
      break;

    case PERMISSION_MODES.PLAN:
      // Only read-only operations
      result.allowed = category === "read_only" || category === "unknown";
      result.reason = result.allowed
        ? "plan mode - read operation permitted"
        : `plan mode - ${category} operations blocked`;
      break;

    case PERMISSION_MODES.AUTO:
      // Auto-approve safe, require approval for risky
      if (isAutoApprove(prompt)) {
        result.allowed = true;
        result.reason = "auto mode - safe operation auto-approved";
      } else if (requiresApproval(prompt)) {
        result.allowed = false;
        result.requiresApproval = true;
        result.reason = "auto mode - operation requires explicit approval";
      } else {
        result.allowed = true;
        result.reason = "auto mode - operation permitted";
      }
      break;

    case PERMISSION_MODES.DEFAULT:
    default:
      // Default interactive behavior
      if (category === "destructive") {
        result.allowed = false;
        result.requiresApproval = true;
        result.reason = "default mode - destructive operation requires approval";
      } else if (requiresApproval(prompt)) {
        result.allowed = false;
        result.requiresApproval = true;
        result.reason = "default mode - risky operation requires approval";
      } else {
        result.allowed = true;
        result.reason = "default mode - operation permitted";
      }
      break;
  }

  // Track denials
  if (!result.allowed) {
    trackDenial(prompt, model, result);
  }

  return result;
}

/**
 * Check if prompt matches auto-approve patterns
 */
function isAutoApprove(prompt) {
  return AUTO_APPROVE_PATTERNS.some(pattern => pattern.test(prompt));
}

/**
 * Check if prompt requires explicit approval
 */
function requiresApproval(prompt) {
  return REQUIRE_APPROVAL_PATTERNS.some(pattern => pattern.test(prompt));
}

/**
 * Grant explicit approval for an operation
 */
export function grantApproval(promptHash, options = {}) {
  const { duration = 3600000, scope = "single" } = options; // default 1 hour

  approvalCache.set(promptHash, {
    granted: new Date().toISOString(),
    expires: new Date(Date.now() + duration).toISOString(),
    scope
  });

  return { approved: true, hash: promptHash };
}

/**
 * Check if operation has been pre-approved
 */
export function hasApproval(promptHash) {
  const approval = approvalCache.get(promptHash);
  if (!approval) return false;

  // Check expiration
  if (new Date(approval.expires) < new Date()) {
    approvalCache.delete(promptHash);
    return false;
  }

  return true;
}

/**
 * Track a permission denial for later analysis
 */
function trackDenial(prompt, model, result) {
  denialHistory.push({
    timestamp: new Date().toISOString(),
    prompt: prompt.substring(0, 200),
    model,
    mode: result.mode,
    category: result.category,
    reason: result.reason
  });

  // Keep last 100 denials
  if (denialHistory.length > 100) {
    denialHistory = denialHistory.slice(-100);
  }
}

/**
 * Get denial history
 */
export function getDenialHistory(limit = 10) {
  return denialHistory.slice(-limit);
}

/**
 * Reset permission state (for testing)
 */
export function resetPermissions() {
  currentMode = PERMISSION_MODES.DEFAULT;
  denialHistory = [];
  approvalCache.clear();
}

/**
 * Create a simple hash for prompt caching
 */
export function hashPrompt(prompt) {
  let hash = 0;
  for (let i = 0; i < prompt.length; i++) {
    const char = prompt.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `prompt_${Math.abs(hash).toString(16)}`;
}
