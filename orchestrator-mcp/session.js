/**
 * Session Module - Persistence, progress tracking, and context compression
 * Based on Claude Code source patterns
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

// Session storage directory
const SESSION_DIR = process.env.SESSION_DIR || "/tmp/orchestrator-sessions";

// Active session state
let currentSession = null;
let progressHandlers = [];

/**
 * Progress event types
 */
export const PROGRESS_EVENTS = {
  START: "start",
  ROUTING: "routing",
  MEMORY: "memory",
  SECURITY: "security",
  MODEL_CALL: "model_call",
  MODEL_RESPONSE: "model_response",
  CONSENSUS: "consensus",
  REASONING_LOOP: "reasoning_loop",  // RDT-inspired iterative reasoning
  ERROR: "error",
  COMPLETE: "complete"
};

/**
 * Initialize session storage
 */
function ensureSessionDir() {
  if (!existsSync(SESSION_DIR)) {
    mkdirSync(SESSION_DIR, { recursive: true });
  }
}

/**
 * Create a new session
 */
export function createSession(options = {}) {
  ensureSessionDir();

  const sessionId = options.id || `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  currentSession = {
    id: sessionId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    mode: options.mode || "default",
    transcript: [],
    denials: [],
    metrics: {
      totalCalls: 0,
      totalTokens: { input: 0, output: 0 },
      totalCost: 0,
      modelUsage: {},
      errors: 0,
      routingDecisions: [],
      memoryEvents: [],
      securityEvents: [],
      consensusRuns: 0
    },
    context: {
      compressed: false,
      originalLength: 0,
      currentLength: 0
    }
  };

  saveSession();
  return currentSession;
}

/**
 * Get current session or create one
 */
export function getSession() {
  if (!currentSession) {
    return createSession();
  }
  return currentSession;
}

/**
 * Load a session by ID
 */
export function loadSession(sessionId) {
  const path = join(SESSION_DIR, `${sessionId}.json`);

  if (!existsSync(path)) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  currentSession = JSON.parse(readFileSync(path, "utf-8"));
  return currentSession;
}

/**
 * Save current session
 */
function saveSession() {
  if (!currentSession) return;

  ensureSessionDir();
  currentSession.updatedAt = new Date().toISOString();

  const path = join(SESSION_DIR, `${currentSession.id}.json`);
  writeFileSync(path, JSON.stringify(currentSession, null, 2));
}

/**
 * Add entry to transcript
 */
export function logTranscript(entry) {
  const session = getSession();

  session.transcript.push({
    timestamp: new Date().toISOString(),
    ...entry
  });

  // Keep last 1000 entries
  if (session.transcript.length > 1000) {
    session.transcript = session.transcript.slice(-1000);
  }

  saveSession();
}

/**
 * Log a model call
 */
export function logModelCall(model, prompt, response, usage) {
  logTranscript({
    type: "model_call",
    model,
    promptLength: prompt.length,
    responseLength: response?.length || 0,
    inputTokens: usage?.inputTokens || 0,
    outputTokens: usage?.outputTokens || 0
  });

  // Update metrics
  const session = getSession();
  session.metrics.totalCalls++;
  session.metrics.totalTokens.input += usage?.inputTokens || 0;
  session.metrics.totalTokens.output += usage?.outputTokens || 0;
  session.metrics.modelUsage[model] = (session.metrics.modelUsage[model] || 0) + 1;

  saveSession();
}

function pushMetricEvent(metricKey, entry, maxEntries = 100) {
  const session = getSession();
  if (!Array.isArray(session.metrics[metricKey])) {
    session.metrics[metricKey] = [];
  }

  session.metrics[metricKey].push({
    timestamp: new Date().toISOString(),
    ...entry
  });

  if (session.metrics[metricKey].length > maxEntries) {
    session.metrics[metricKey] = session.metrics[metricKey].slice(-maxEntries);
  }

  saveSession();
}

export function logRoutingDecision(route, context = {}) {
  pushMetricEvent("routingDecisions", {
    taskType: route.taskType,
    intent: route.intent,
    risk: route.risk,
    scope: route.scope,
    memoryMode: route.memoryMode,
    consensusMode: route.consensusMode,
    primaryModel: route.primaryModel,
    context
  });

  emitProgress(PROGRESS_EVENTS.ROUTING, {
    taskType: route.taskType,
    intent: route.intent,
    risk: route.risk,
    primaryModel: route.primaryModel
  });
}

export function logMemoryEvent(event) {
  pushMetricEvent("memoryEvents", event);
  emitProgress(PROGRESS_EVENTS.MEMORY, event);
}

export function logSecurityEvent(event) {
  pushMetricEvent("securityEvents", event);
  emitProgress(PROGRESS_EVENTS.SECURITY, event);
}

export function logConsensusRun(event = {}) {
  const session = getSession();
  session.metrics.consensusRuns = (session.metrics.consensusRuns || 0) + 1;
  saveSession();
  emitProgress(PROGRESS_EVENTS.CONSENSUS, { phase: "tracked", ...event });
}

/**
 * Log a denial
 */
export function logDenial(prompt, model, reason) {
  const session = getSession();

  session.denials.push({
    timestamp: new Date().toISOString(),
    prompt: prompt.substring(0, 200),
    model,
    reason
  });

  // Keep last 100 denials
  if (session.denials.length > 100) {
    session.denials = session.denials.slice(-100);
  }

  saveSession();
}

/**
 * Log an error
 */
export function logError(error, context = {}) {
  logTranscript({
    type: "error",
    error: error.message || String(error),
    ...context
  });

  const session = getSession();
  session.metrics.errors++;
  saveSession();
}

/**
 * Register a progress handler
 */
export function onProgress(handler) {
  progressHandlers.push(handler);
  return () => {
    progressHandlers = progressHandlers.filter(h => h !== handler);
  };
}

/**
 * Emit a progress event
 */
export function emitProgress(event, data = {}) {
  const progressEvent = {
    type: event,
    timestamp: new Date().toISOString(),
    sessionId: currentSession?.id,
    ...data
  };

  for (const handler of progressHandlers) {
    try {
      handler(progressEvent);
    } catch (e) {
      console.error("Progress handler error:", e);
    }
  }

  // Log certain events to transcript
  if ([PROGRESS_EVENTS.MODEL_CALL, PROGRESS_EVENTS.ERROR, PROGRESS_EVENTS.COMPLETE].includes(event)) {
    logTranscript({ type: "progress", event, ...data });
  }

  return progressEvent;
}

/**
 * Context compression - 3-layer system
 */
export const COMPRESSION_LAYERS = {
  SNIP: "snip",           // Remove whitespace and comments
  SEMANTIC: "semantic",    // Keep key structures only
  SUMMARY: "summary"       // Generate summary
};

/**
 * Compress context to fit token limits
 */
export function compressContext(text, options = {}) {
  const { maxTokens = 8000, layer = COMPRESSION_LAYERS.SNIP } = options;
  const estimatedTokens = Math.ceil(text.length / 4);

  if (estimatedTokens <= maxTokens) {
    return {
      text,
      compressed: false,
      originalTokens: estimatedTokens,
      finalTokens: estimatedTokens,
      layer: null
    };
  }

  let compressed = text;
  let currentLayer = layer;

  // Layer 1: Snip - remove excess whitespace and comments
  if (currentLayer === COMPRESSION_LAYERS.SNIP || estimatedTokens > maxTokens) {
    compressed = snipCompress(compressed);
    const newTokens = Math.ceil(compressed.length / 4);

    if (newTokens <= maxTokens) {
      return {
        text: compressed,
        compressed: true,
        originalTokens: estimatedTokens,
        finalTokens: newTokens,
        layer: COMPRESSION_LAYERS.SNIP
      };
    }
    currentLayer = COMPRESSION_LAYERS.SEMANTIC;
  }

  // Layer 2: Semantic - keep structure
  if (currentLayer === COMPRESSION_LAYERS.SEMANTIC) {
    compressed = semanticCompress(compressed);
    const newTokens = Math.ceil(compressed.length / 4);

    if (newTokens <= maxTokens) {
      return {
        text: compressed,
        compressed: true,
        originalTokens: estimatedTokens,
        finalTokens: newTokens,
        layer: COMPRESSION_LAYERS.SEMANTIC
      };
    }
    currentLayer = COMPRESSION_LAYERS.SUMMARY;
  }

  // Layer 3: Summary - aggressive truncation
  if (currentLayer === COMPRESSION_LAYERS.SUMMARY) {
    compressed = summaryCompress(compressed, maxTokens);
    return {
      text: compressed,
      compressed: true,
      originalTokens: estimatedTokens,
      finalTokens: Math.ceil(compressed.length / 4),
      layer: COMPRESSION_LAYERS.SUMMARY
    };
  }

  return {
    text: compressed,
    compressed: true,
    originalTokens: estimatedTokens,
    finalTokens: Math.ceil(compressed.length / 4),
    layer: currentLayer
  };
}

/**
 * Layer 1: Snip compression
 */
function snipCompress(text) {
  // Remove multiple blank lines
  let result = text.replace(/\n{3,}/g, "\n\n");

  // Remove single-line comments (// and #)
  result = result.replace(/^\s*(\/\/|#)[^\n]*$/gm, "");

  // Remove multi-line comments
  result = result.replace(/\/\*[\s\S]*?\*\//g, "");

  // Collapse excessive whitespace
  result = result.replace(/[ \t]{2,}/g, " ");

  return result.trim();
}

/**
 * Layer 2: Semantic compression - keep structure
 */
function semanticCompress(text) {
  const lines = text.split("\n");
  const importantLines = [];

  const importantPatterns = [
    /^(import|export|from|require)/,
    /^(function|class|const|let|var|interface|type|enum)\s+\w/,
    /^(def|class|async\s+def)\s+\w/,
    /^(pub\s+)?(fn|struct|impl|trait|enum|mod)\s+\w/,
    /^\s*(return|throw|if|else|for|while|switch|case)/,
    /^[\t ]*\}/,
    /^[\t ]*\{/
  ];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (importantPatterns.some(p => p.test(trimmed))) {
      importantLines.push(line);
    }
  }

  return importantLines.join("\n");
}

/**
 * Layer 3: Summary compression - aggressive
 */
function summaryCompress(text, maxTokens) {
  const maxChars = maxTokens * 4;

  if (text.length <= maxChars) {
    return text;
  }

  // Take first portion and last portion
  const headSize = Math.floor(maxChars * 0.6);
  const tailSize = Math.floor(maxChars * 0.3);

  const head = text.substring(0, headSize);
  const tail = text.substring(text.length - tailSize);

  return `${head}\n\n[... ${text.length - headSize - tailSize} chars truncated ...]\n\n${tail}`;
}

/**
 * Get session metrics
 */
export function getMetrics() {
  return getSession().metrics;
}

/**
 * Get session summary
 */
export function getSessionSummary() {
  const session = getSession();

  return {
    id: session.id,
    duration: Date.now() - new Date(session.createdAt).getTime(),
    totalCalls: session.metrics.totalCalls,
    totalTokens: session.metrics.totalTokens,
    modelUsage: session.metrics.modelUsage,
    errors: session.metrics.errors,
    consensusRuns: session.metrics.consensusRuns || 0,
    recentRouting: (session.metrics.routingDecisions || []).slice(-5),
    recentMemory: (session.metrics.memoryEvents || []).slice(-5),
    recentSecurity: (session.metrics.securityEvents || []).slice(-5),
    denials: session.denials.length,
    transcriptLength: session.transcript.length
  };
}

/**
 * End session and cleanup
 */
export function endSession() {
  if (!currentSession) return null;

  const summary = getSessionSummary();

  emitProgress(PROGRESS_EVENTS.COMPLETE, {
    summary
  });

  saveSession();
  const sessionId = currentSession.id;
  currentSession = null;

  return { sessionId, summary };
}

/**
 * Reset session (for testing)
 */
export function resetSession() {
  currentSession = null;
  progressHandlers = [];
}
