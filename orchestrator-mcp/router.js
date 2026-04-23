/**
 * Task Router - Auto-detect task type and select appropriate model(s)
 */

import { FALLBACK_CHAINS, LLM_COUNCIL_MODELS, getModelFamily, isSpeedTier } from "./models.js";

// Task classification patterns
const TASK_PATTERNS = {
  "fast-search": {
    patterns: [
      /search|find|grep|locate|list|where is|which files?/i,
      /how many|count|enumerate/i
    ],
    priority: 10
  },
  "code-review": {
    patterns: [
      /review|audit|check code|analyze code|code quality/i,
      /pull request|pr review|diff review/i
    ],
    priority: 5
  },
  "edge-cases": {
    patterns: [
      /edge case|race condition|stress test|failure mode|corner case/i,
      /what could go wrong|potential issues|vulnerabilities/i
    ],
    priority: 6
  },
  "heavy-reasoning": {
    patterns: [
      /debug|fix|architect|design|complex|implement|refactor/i,
      /why does|explain|understand|root cause/i
    ],
    priority: 1  // default fallback
  },
  "long-context": {
    patterns: [
      /cross-file|entire codebase|all files|large file|multiple files/i,
      /project-wide|global search|full context/i
    ],
    priority: 4
  },
  "security": {
    patterns: [
      /security|vulnerability|injection|xss|csrf|auth bypass/i,
      /exploit|attack vector|penetration|hardening/i
    ],
    priority: 7
  },
  "architecture": {
    patterns: [
      /architecture|design pattern|system design|scalability/i,
      /microservice|monolith|database design|api design/i
    ],
    priority: 5
  },
  "debug": {
    patterns: [
      /debug|error|exception|crash|not working|broken/i,
      /stack trace|traceback|failed|bug/i
    ],
    priority: 8
  },
  "uncensored": {
    patterns: [
      /uncensored|unfiltered|raw analysis|no restrictions/i
    ],
    priority: 9
  }
};

// Primary model selection by task type
const PRIMARY_MODELS = {
  "fast-search": "minimax",
  "code-review": "claude45",
  "edge-cases": "minimax",
  "heavy-reasoning": "claude45",
  "long-context": "moonshot",
  "security": "gpt54",
  "architecture": "gpt54",
  "debug": "claude45",
  "uncensored": "venice"
};

/**
 * Classify a task into a task type
 */
export function classifyTask(task) {
  const matches = [];

  for (const [taskType, config] of Object.entries(TASK_PATTERNS)) {
    for (const pattern of config.patterns) {
      if (pattern.test(task)) {
        matches.push({ taskType, priority: config.priority });
        break; // only count each task type once
      }
    }
  }

  // Sort by priority (higher = more specific)
  matches.sort((a, b) => b.priority - a.priority);

  // Return highest priority match or default
  return matches.length > 0 ? matches[0].taskType : "heavy-reasoning";
}

/**
 * Select primary model for a task type
 */
export function selectPrimary(taskType) {
  return PRIMARY_MODELS[taskType] || "claude";
}

/**
 * Determine if task should use parallel execution
 */
export function shouldUseParallel(taskType) {
  // Use parallel for tasks that benefit from multiple perspectives
  const parallelTasks = ["code-review", "edge-cases", "security", "architecture"];
  return parallelTasks.includes(taskType);
}

/**
 * Get recommended models for consensus building
 */
export function getConsensusModels(taskType) {
  const chain = FALLBACK_CHAINS[taskType] || FALLBACK_CHAINS["heavy-reasoning"];
  if (["code-review", "security", "architecture"].includes(taskType)) {
    return [...LLM_COUNCIL_MODELS];
  }
  return chain.slice(0, 3);
}

/**
 * Main routing function - determines full routing strategy for a task
 */
export function routeTask(task) {
  const taskType = classifyTask(task);
  const primaryModel = selectPrimary(taskType);
  const fallbackChain = FALLBACK_CHAINS[taskType] || FALLBACK_CHAINS["heavy-reasoning"];
  const useParallel = shouldUseParallel(taskType);
  const { promptStyle } = getModelFamily(primaryModel);
  const consensusModels = getConsensusModels(taskType);

  return {
    taskType,
    primaryModel,
    fallbackChain,
    useParallel,
    promptStyle,
    consensusModels,
    isSpeedTask: isSpeedTier(primaryModel),
    reasoning: generateRoutingReasoning(task, taskType, primaryModel)
  };
}

/**
 * Generate human-readable reasoning for the routing decision
 */
function generateRoutingReasoning(task, taskType, primaryModel) {
  const reasons = [];

  // Explain task classification
  const patterns = TASK_PATTERNS[taskType]?.patterns || [];
  for (const pattern of patterns) {
    if (pattern.test(task)) {
      reasons.push(`Task matches pattern: ${pattern.source}`);
      break;
    }
  }

  // Explain model selection
  const family = getModelFamily(primaryModel);
  reasons.push(`Selected ${primaryModel} (${family.family} family, ${family.promptStyle} prompt style)`);

  if (isSpeedTier(primaryModel)) {
    reasons.push("Using speed-tier model for fast execution");
  }

  return reasons.join(". ");
}

/**
 * Explain routing decision for a task (user-facing)
 */
export function explainRouting(task) {
  const route = routeTask(task);

  return {
    task: task.substring(0, 100) + (task.length > 100 ? "..." : ""),
    classification: route.taskType,
    selectedModel: route.primaryModel,
    fallbackChain: route.fallbackChain,
    parallelExecution: route.useParallel,
    promptStyle: route.promptStyle,
    consensusModels: route.consensusModels,
    reasoning: route.reasoning
  };
}
