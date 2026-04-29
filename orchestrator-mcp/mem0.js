/**
 * Mem0 Integration - Persistent memory for patterns, fixes, and learned context.
 */

import { loadConfig } from "./config-loader.js";

const config = loadConfig("memory.json");
const defaults = config.defaults;

const MEM0_API_KEY = process.env.MEM0_API_KEY;
const MEM0_API_URL = process.env.MEM0_API_URL || config.apiUrl;

export const MEMORY_MODES = {
  NONE: config.memoryModes.none,
  EXACT: config.memoryModes.exact,
  SEMANTIC: config.memoryModes.semantic,
  HYBRID: config.memoryModes.hybrid
};

function truncateText(text, maxLength = defaults.contentHintLength) {
  if (!text) return "";
  const normalized = String(text).replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function compactList(values = [], maxItems = defaults.maxMemoryItems) {
  return values
    .map((value) => truncateText(value, 120))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeMode(mode) {
  const normalized = String(mode || "").toLowerCase();
  return Object.values(MEMORY_MODES).includes(normalized) ? normalized : MEMORY_MODES.NONE;
}

function extractIdentifiers(text = "") {
  const matches = text.match(/[A-Za-z_][A-Za-z0-9_./:-]{2,}/g) || [];
  return [...new Set(matches)].slice(0, defaults.maxIdentifiers);
}

function buildExactQuery(task, content) {
  const identifiers = extractIdentifiers(`${task} ${content}`);
  return identifiers.length > 0 ? identifiers.join(" ") : truncateText(task, defaults.queryMaxLength);
}

function buildSemanticQuery(task, content) {
  const parts = [truncateText(task, defaults.queryMaxLength)];
  const contentHint = truncateText(content, defaults.contentHintLength);
  if (contentHint) {
    parts.push(contentHint);
  }
  return parts.join(" | ");
}

export function selectMemoryPolicy(task, options = {}) {
  const {
    route = null,
    explicit = false,
    content = "",
    mode = route?.memoryMode || MEMORY_MODES.NONE
  } = options;

  const normalizedMode = normalizeMode(mode);
  const policy = {
    enabled: false,
    explicit,
    mode: normalizedMode,
    backendHint: defaults.backendHint,
    limit: 0,
    query: "",
    rationale: "memory disabled"
  };

  if (!explicit || normalizedMode === MEMORY_MODES.NONE) {
    policy.rationale = explicit
      ? "memory explicitly requested but router policy skipped recall for this task"
      : "memory not requested";
    return policy;
  }

  policy.enabled = true;

  switch (normalizedMode) {
    case MEMORY_MODES.EXACT:
      policy.limit = defaults.exactLimit;
      policy.query = buildExactQuery(task, content);
      policy.rationale = "exact recall for identifiers, errors, or narrow lookups";
      break;
    case MEMORY_MODES.SEMANTIC:
      policy.limit = defaults.semanticLimit;
      policy.query = buildSemanticQuery(task, content);
      policy.rationale = "semantic recall for concepts, architecture, or pattern matching";
      break;
    case MEMORY_MODES.HYBRID:
      policy.limit = defaults.hybridLimit;
      policy.query = `${buildExactQuery(task, content)} | ${buildSemanticQuery(task, content)}`;
      policy.rationale = "hybrid recall for debugging/review flows that benefit from exact and semantic context";
      break;
    default:
      policy.enabled = false;
      policy.limit = 0;
      policy.query = "";
      policy.rationale = "memory mode not recognized";
      break;
  }

  return policy;
}

export function isMem0Available() {
  return !!MEM0_API_KEY;
}

export async function searchMemories(query, options = {}) {
  if (!MEM0_API_KEY) {
    return { success: false, error: "MEM0_API_KEY not configured" };
  }

  const { limit = defaults.hybridLimit, userId = config.defaultUserId } = options;

  try {
    const response = await fetch(`${MEM0_API_URL}/memories/search/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token ${MEM0_API_KEY}`
      },
      body: JSON.stringify({
        query,
        user_id: userId,
        limit
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Mem0 API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return {
      success: true,
      memories: data.results || data.memories || data || [],
      query
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      query
    };
  }
}

export async function addMemory(content, options = {}) {
  if (!MEM0_API_KEY) {
    return { success: false, error: "MEM0_API_KEY not configured" };
  }

  const { userId = config.defaultUserId, metadata = {} } = options;

  try {
    const response = await fetch(`${MEM0_API_URL}/memories/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token ${MEM0_API_KEY}`
      },
      body: JSON.stringify({
        messages: [{ role: "user", content }],
        user_id: userId,
        metadata
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Mem0 API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return {
      success: true,
      memory: data,
      content: truncateText(content, defaults.previewLength)
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

export async function getMemories(options = {}) {
  if (!MEM0_API_KEY) {
    return { success: false, error: "MEM0_API_KEY not configured" };
  }

  const { userId = config.defaultUserId, limit = 50 } = options;

  try {
    const response = await fetch(`${MEM0_API_URL}/memories/?user_id=${userId}&limit=${limit}`, {
      method: "GET",
      headers: {
        Authorization: `Token ${MEM0_API_KEY}`
      }
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Mem0 API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const memories = data.results || data.memories || data || [];

    return {
      success: true,
      memories,
      count: memories.length
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

export function formatMemoriesForContext(memories, options = {}) {
  const { maxItems = defaults.maxMemoryItems } = options;

  if (!memories || memories.length === 0) {
    return "No relevant memories found.";
  }

  const lines = ["## Relevant Memories from Mem0", ""];

  for (const memory of memories.slice(0, maxItems)) {
    const content = truncateText(
      memory.memory || memory.content || memory.text || JSON.stringify(memory),
      defaults.queryMaxLength
    );
    const score = memory.score ? ` (relevance: ${(memory.score * 100).toFixed(0)}%)` : "";
    lines.push(`- ${content}${score}`);
  }

  return lines.join("\n");
}

export function shouldStoreMemory(options = {}) {
  const {
    content = "",
    rootCause = "",
    fixApproach = "",
    filesAffected = [],
    confidence = null
  } = options;

  const signalCount = [
    truncateText(content, 40),
    truncateText(rootCause, 40),
    truncateText(fixApproach, 40),
    Array.isArray(filesAffected) && filesAffected.length > 0 ? "files" : ""
  ].filter(Boolean).length;

  if (confidence !== null && Number(confidence) < defaults.confidenceFloor) {
    return false;
  }

  return signalCount >= defaults.minSignalCount;
}

export function buildMemoryMetadata(options = {}) {
  const {
    bugType,
    taskType,
    filesAffected = [],
    memoryMode,
    source = "orchestrator",
    confidence = null,
    tags = []
  } = options;

  return {
    source,
    bug_type: bugType || undefined,
    task_type: taskType || undefined,
    memory_mode: memoryMode || undefined,
    files_affected: compactList(filesAffected, defaults.maxFilesAffected),
    confidence: confidence === null || confidence === undefined ? undefined : Number(confidence),
    tags: compactList(tags, defaults.maxTags)
  };
}

export function buildFixMemory(options) {
  const {
    bugType,
    rootCause,
    fixApproach,
    filesAffected = [],
    edgeCases = [],
    modelFindings,
    consensus,
    verification = []
  } = options;

  const lines = [
    `Issue: ${truncateText(bugType || "unknown issue", 140)}`,
    `Root cause: ${truncateText(rootCause || "unknown", defaults.queryMaxLength)}`,
    `Fix: ${truncateText(fixApproach || "not provided", defaults.queryMaxLength)}`
  ];

  if (filesAffected.length > 0) {
    lines.push(`Files: ${compactList(filesAffected, defaults.maxFilesAffected).join(", ")}`);
  }

  if (edgeCases.length > 0) {
    lines.push(`Edge cases: ${compactList(edgeCases, defaults.maxEdgeCases).join("; ")}`);
  }

  if (modelFindings) {
    lines.push(`Model insight: ${truncateText(modelFindings, defaults.contentHintLength)}`);
  }

  if (consensus !== null && consensus !== undefined) {
    lines.push(`Consensus confidence: ${(Number(consensus) * 100).toFixed(0)}%`);
  }

  if (verification.length > 0) {
    lines.push(`Verification: ${compactList(verification, defaults.maxVerificationItems).join("; ")}`);
  }

  return lines.join("\n");
}

export function buildMemoryWritePayload(options = {}) {
  const {
    content = "",
    bugType,
    taskType,
    rootCause = "",
    fixApproach = "",
    filesAffected = [],
    edgeCases = [],
    modelFindings = null,
    confidence = null,
    consensus = null,
    verification = [],
    source = "orchestrator",
    memoryMode = MEMORY_MODES.SEMANTIC,
    force = false
  } = options;

  const derivedContent = buildFixMemory({
    bugType: bugType || taskType || "memory entry",
    rootCause: rootCause || content,
    fixApproach: fixApproach || content || "see source content",
    filesAffected,
    edgeCases,
    modelFindings,
    consensus,
    verification
  });

  const shouldStore = force || shouldStoreMemory({
    content,
    rootCause,
    fixApproach,
    filesAffected,
    confidence: consensus ?? confidence
  });

  return {
    shouldStore,
    content: derivedContent,
    metadata: buildMemoryMetadata({
      bugType,
      taskType,
      filesAffected,
      memoryMode,
      source,
      confidence: consensus ?? confidence,
      tags: [bugType, taskType, memoryMode].filter(Boolean)
    })
  };
}
