import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

type GovernanceDecision = "allow" | "block" | "needs_review";
type GovernanceRisk = "low" | "medium" | "high" | "critical";
type ToolClassification = "discovery" | "mutation" | "verification" | "neutral";

interface GovernanceResult {
  decision: GovernanceDecision;
  risk_level?: GovernanceRisk;
  reason?: string;
}

interface PluginHookBeforeToolCallEvent {
  toolName: string;
  params: Record<string, unknown>;
  runId?: string;
  toolCallId?: string;
}

interface PluginHookToolContext {
  agentId?: string;
  sessionKey?: string;
  sessionId?: string;
  runId?: string;
  toolName?: string;
  toolCallId?: string;
}

interface PluginApprovalRequest {
  title: string;
  description: string;
  severity?: "info" | "warning" | "critical";
  timeoutMs?: number;
  timeoutBehavior?: "allow" | "deny";
}

interface PluginHookBeforeToolCallResult {
  params?: Record<string, unknown>;
  block?: boolean;
  blockReason?: string;
  requireApproval?: PluginApprovalRequest;
}

interface ToolResultMessageEnvelope {
  type?: string;
  message?: ToolResultMessage;
  role?: string;
  content?: Array<{ type?: string; text?: string }>;
  toolCallId?: string;
  toolName?: string;
  details?: { status?: string; exitCode?: number | null };
  isError?: boolean;
}

interface ToolResultMessage {
  role?: string;
  toolCallId?: string;
  toolName?: string;
  content?: Array<{ type?: string; text?: string }>;
  details?: { status?: string; exitCode?: number | null };
  isError?: boolean;
}

interface PluginHookToolResultPersistEvent {
  message: ToolResultMessageEnvelope;
}

interface PluginHookBeforeMessageWriteEvent {
  message: unknown;
}

interface BeforeMessageWriteResult {
  block?: boolean;
  message?: unknown;
}

interface PendingToolCall {
  tool_name: string;
  classification: ToolClassification;
  target_paths?: string[];
  recorded_at: string;
}

interface RunGovernanceState {
  run_id: string;
  discovery_count: number;
  discovery_paths: string[];
  mutation_count: number;
  verification_count: number;
  pending_mutation: boolean;
  lastDiscoveryAt?: string;
  lastMutationAt?: string;
  lastMutationTool?: string;
  lastVerificationAt?: string;
  lastVerificationTool?: string;
  pending_tool_calls: Record<string, PendingToolCall>;
}

interface SessionGovernanceState {
  session_key: string;
  discovery_count: number;
  discovery_paths: string[];
  mutation_count: number;
  verification_count: number;
  pending_mutation: boolean;
  lastDiscoveryAt?: string;
  lastMutationAt?: string;
  lastMutationTool?: string;
  lastVerificationAt?: string;
  lastVerificationTool?: string;
  pending_tool_calls: Record<string, PendingToolCall>;
  runs: Record<string, RunGovernanceState>;
}

interface GovernanceState {
  sessions: Record<string, SessionGovernanceState>;
  updated_at?: string;
}

const UNKNOWN_SESSION = "unknown";
const UNKNOWN_RUN = "unknown";
const GOVERNANCE_STATE_DIR = path.join(
  process.env.HOME || process.cwd(),
  ".openclaw",
  "workspace",
  "state"
);
const GOVERNANCE_STATE_PATH = path.join(GOVERNANCE_STATE_DIR, "governance-checkpoints.json");
const COMPLETION_GUARD_MARKER = "[governance-verification-required]";

const log = {
  info: (msg: string) => console.error(`[pre-execution-governance] ${msg}`),
  error: (msg: string) => console.error(`[pre-execution-governance] ERROR: ${msg}`),
  warn: (msg: string) => console.error(`[pre-execution-governance] WARN: ${msg}`)
};

function resolveGovernanceScript(): string {
  return path.join(
    process.env.HOME || process.cwd(),
    ".openclaw",
    "hooks",
    "pre-execution-governance",
    "enforce.py"
  );
}

function toApprovalSeverity(risk?: GovernanceRisk): "info" | "warning" | "critical" {
  if (risk === "critical") {
    return "critical";
  }
  if (risk === "high" || risk === "medium") {
    return "warning";
  }
  return "info";
}

function ensureGovernanceState(): GovernanceState {
  if (!fs.existsSync(GOVERNANCE_STATE_PATH)) {
    return { sessions: {} };
  }

  try {
    const raw = fs.readFileSync(GOVERNANCE_STATE_PATH, "utf8");
    const parsed = JSON.parse(raw) as GovernanceState;
    if (!parsed.sessions || typeof parsed.sessions !== "object") {
      return { sessions: {} };
    }
    return parsed;
  } catch (error) {
    log.warn(`Failed to parse governance state: ${String(error)}`);
    return { sessions: {} };
  }
}

function saveGovernanceState(state: GovernanceState): void {
  fs.mkdirSync(GOVERNANCE_STATE_DIR, { recursive: true });
  state.updated_at = new Date().toISOString();
  fs.writeFileSync(GOVERNANCE_STATE_PATH, JSON.stringify(state, null, 2));
}

function ensureSessionState(state: GovernanceState, sessionKey: string): SessionGovernanceState {
  const existing = state.sessions[sessionKey];
  if (existing) {
    existing.pending_tool_calls ||= {};
    existing.runs ||= {};
    existing.discovery_paths ||= [];
    return existing;
  }

  const created: SessionGovernanceState = {
    session_key: sessionKey,
    discovery_count: 0,
    discovery_paths: [],
    mutation_count: 0,
    verification_count: 0,
    pending_mutation: false,
    pending_tool_calls: {},
    runs: {}
  };
  state.sessions[sessionKey] = created;
  return created;
}

function ensureRunState(session: SessionGovernanceState, runId: string): RunGovernanceState {
  const existing = session.runs[runId];
  if (existing) {
    existing.pending_tool_calls ||= {};
    existing.discovery_paths ||= [];
    return existing;
  }

  const created: RunGovernanceState = {
    run_id: runId,
    discovery_count: 0,
    discovery_paths: [],
    mutation_count: 0,
    verification_count: 0,
    pending_mutation: false,
    pending_tool_calls: {}
  };
  session.runs[runId] = created;
  return created;
}

function coerceSessionKey(ctx: PluginHookToolContext): string {
  return ctx.sessionKey || ctx.sessionId || UNKNOWN_SESSION;
}

function coerceRunId(ctx: PluginHookToolContext): string {
  return ctx.runId || UNKNOWN_RUN;
}

function isToolResultEnvelope(value: unknown): value is ToolResultMessageEnvelope {
  return Boolean(value) && typeof value === "object";
}

function unwrapToolResultMessage(envelope: ToolResultMessageEnvelope): ToolResultMessage {
  let current: unknown = envelope;
  for (let i = 0; i < 3; i += 1) {
    if (!current || typeof current !== "object") {
      break;
    }
    const candidate = current as { message?: unknown };
    if (candidate.message && typeof candidate.message === "object") {
      current = candidate.message;
      continue;
    }
    break;
  }
  return current as ToolResultMessage;
}

function extractToolResultMeta(
  envelope: ToolResultMessageEnvelope
): { toolCallId: string; toolName: string; success: boolean } | null {
  const message = unwrapToolResultMessage(envelope);
  const toolCallId = message.toolCallId || envelope.toolCallId;
  const toolName = message.toolName || envelope.toolName;

  if (!toolCallId || !toolName) {
    return null;
  }

  const details = message.details || envelope.details;
  const explicitError = message.isError ?? envelope.isError;
  const status = details?.status;
  const exitCode = details?.exitCode;
  const success = explicitError !== true && status !== "failed" && status !== "error" && (exitCode == null || exitCode === 0);

  return { toolCallId, toolName, success };
}

function isReadLikeTool(toolName: string): boolean {
  const lower = toolName.toLowerCase();
  return (
    lower.includes("read") ||
    lower.includes("grep") ||
    lower.includes("find") ||
    lower.includes("glob") ||
    lower.includes("search") ||
    lower.includes("open") ||
    lower === "ls" ||
    lower === "cat"
  );
}

function isVerificationLikeTool(toolName: string): boolean {
  const lower = toolName.toLowerCase();
  return (
    lower.includes("test") ||
    lower.includes("lint") ||
    lower.includes("typecheck") ||
    lower.includes("build") ||
    lower.includes("verify") ||
    lower.includes("exec") ||
    lower.includes("command") ||
    isReadLikeTool(toolName)
  );
}

function clearResolvedPendingMutation(session: SessionGovernanceState): void {
  const stillPendingInRuns = Object.values(session.runs || {}).some((run) => run.pending_mutation);
  session.pending_mutation = stillPendingInRuns;
}

function mergeDiscoveryPaths(target: SessionGovernanceState | RunGovernanceState, paths: string[]): void {
  const merged = new Set(target.discovery_paths || []);
  for (const candidate of paths) {
    if (typeof candidate === "string" && candidate) {
      merged.add(candidate);
    }
  }
  target.discovery_paths = Array.from(merged);
}

function recordDiscovery(
  target: SessionGovernanceState | RunGovernanceState,
  toolName: string,
  paths: string[]
): void {
  target.discovery_count += 1;
  target.lastDiscoveryAt = new Date().toISOString();
  mergeDiscoveryPaths(target, paths);
}

function recordMutation(target: SessionGovernanceState | RunGovernanceState, toolName: string): void {
  target.mutation_count += 1;
  target.pending_mutation = true;
  target.lastMutationAt = new Date().toISOString();
  target.lastMutationTool = toolName;
}

function recordVerification(target: SessionGovernanceState | RunGovernanceState, toolName: string): void {
  target.verification_count += 1;
  target.pending_mutation = false;
  target.lastVerificationAt = new Date().toISOString();
  target.lastVerificationTool = toolName;
}

function updateStateFromToolResult(
  state: GovernanceState,
  ctx: PluginHookToolContext,
  envelope: ToolResultMessageEnvelope
): boolean {
  const meta = extractToolResultMeta(envelope);
  if (!meta) {
    return false;
  }

  const sessionKey = coerceSessionKey(ctx);
  const runId = coerceRunId(ctx);
  const session = ensureSessionState(state, sessionKey);
  const run = runId !== UNKNOWN_RUN ? ensureRunState(session, runId) : null;

  const pendingFromRun = run?.pending_tool_calls?.[meta.toolCallId];
  const pending = pendingFromRun || session.pending_tool_calls?.[meta.toolCallId];
  const classification = pending?.classification || (isReadLikeTool(meta.toolName) ? "discovery" : "neutral");
  const targetPaths = Array.isArray(pending?.target_paths)
    ? pending.target_paths.filter((value): value is string => typeof value === "string" && value.length > 0)
    : [];

  if (run?.pending_tool_calls?.[meta.toolCallId]) {
    delete run.pending_tool_calls[meta.toolCallId];
  }
  if (session.pending_tool_calls?.[meta.toolCallId]) {
    delete session.pending_tool_calls[meta.toolCallId];
  }

  if (!meta.success) {
    return true;
  }

  const pendingMutation = Boolean(run?.pending_mutation || session.pending_mutation);
  const verificationLike = isVerificationLikeTool(meta.toolName);

  if (classification === "discovery") {
    recordDiscovery(session, meta.toolName, targetPaths);
    if (run) {
      recordDiscovery(run, meta.toolName, targetPaths);
    }
  }

  if (classification === "mutation") {
    recordMutation(session, meta.toolName);
    if (run) {
      recordMutation(run, meta.toolName);
    }
    return true;
  }

  if (pendingMutation && verificationLike) {
    recordVerification(session, meta.toolName);
    if (run) {
      recordVerification(run, meta.toolName);
    }
    clearResolvedPendingMutation(session);
    return true;
  }

  return true;
}

function extractAssistantMessageContainer(value: unknown): { role?: string; content?: unknown; message?: unknown } | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as { role?: string; content?: unknown; message?: unknown };
}

function unwrapAssistantContainer(value: unknown): { role?: string; content?: unknown; message?: unknown } | null {
  let current: unknown = value;
  for (let i = 0; i < 3; i += 1) {
    const container = extractAssistantMessageContainer(current);
    if (!container) {
      return null;
    }
    if (typeof container.role === "string" || Array.isArray(container.content)) {
      return container;
    }
    current = container.message;
  }
  return extractAssistantMessageContainer(current);
}

function getAssistantRole(value: unknown): string | undefined {
  return unwrapAssistantContainer(value)?.role;
}

function getAssistantText(value: unknown): string {
  const container = unwrapAssistantContainer(value);
  if (!container) {
    return "";
  }

  const directContent = Array.isArray(container.content) ? container.content : null;
  if (!directContent) {
    return "";
  }

  return directContent
    .map((item) => (item && typeof item === "object" && typeof (item as { text?: unknown }).text === "string" ? (item as { text: string }).text : ""))
    .filter(Boolean)
    .join("\n");
}

function looksLikeCompletionClaim(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) {
    return false;
  }
  if (normalized.includes(COMPLETION_GUARD_MARKER)) {
    return false;
  }
  if (/not verified|verification required|cannot determine from current evidence/i.test(normalized)) {
    return false;
  }
  return (
    /(^|\n)\s*(done|completed?|fixed|implemented|finished)\b/i.test(normalized) ||
    /status:\s*complete/i.test(normalized) ||
    /\b(it'?s|this is)\s+(done|complete|fixed|working)\b/i.test(normalized)
  );
}

function buildGuardMessage(original: unknown, session: SessionGovernanceState): unknown {
  const warning = `${COMPLETION_GUARD_MARKER}
Verification required before completion: a mutating tool ran in this session without a recorded post-mutation check. Run a targeted read, test, log, or state check first, then report completion. Last mutation tool: ${session.lastMutationTool || "unknown"}.`;

  function replaceAtDepth(value: unknown, depth: number): unknown {
    const container = extractAssistantMessageContainer(value);
    if (!container || depth > 4) {
      return value;
    }

    if (typeof container.role === "string") {
      return {
        ...container,
        content: [{ type: "text", text: warning }]
      };
    }

    return {
      ...container,
      message: replaceAtDepth(container.message, depth + 1)
    };
  }

  return replaceAtDepth(original, 0);
}

async function runGovernanceCheck(
  event: PluginHookBeforeToolCallEvent,
  ctx: PluginHookToolContext
): Promise<GovernanceResult> {
  const governanceScript = resolveGovernanceScript();
  if (!fs.existsSync(governanceScript)) {
    throw new Error(`Governance script not found: ${governanceScript}`);
  }

  const metadata = {
    tool_name: event.toolName,
    tool_arguments: event.params,
    source: process.env.OPENCLAW_GOVERNANCE_SOURCE || "cli",
    session_key: ctx.sessionKey || "unknown",
    session_id: ctx.sessionId || "unknown",
    agent_id: ctx.agentId || "unknown",
    run_id: event.runId || ctx.runId || "unknown",
    tool_call_id: event.toolCallId || ctx.toolCallId || "unknown"
  };

  return await new Promise<GovernanceResult>((resolve, reject) => {
    const child = spawn("python3", [governanceScript, JSON.stringify(metadata)]);
    let stdout = "";
    let stderr = "";
    let settled = false;

    child.stdout.on("data", (data: { toString(): string } | string) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data: { toString(): string } | string) => {
      stderr += data.toString();
    });

    child.on("error", (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    });

    child.on("close", (code: number | null) => {
      if (stderr.trim()) {
        log.warn(`Governance stderr: ${stderr.trim()}`);
      }

      if (settled) {
        return;
      }

      if (code !== 0) {
        settled = true;
        reject(new Error(`Governance check failed with code ${code}`));
        return;
      }

      try {
        const output = JSON.parse(stdout.trim()) as GovernanceResult;
        settled = true;
        resolve(output);
      } catch (error) {
        settled = true;
        reject(new Error(`Failed to parse governance output: ${String(error)}`));
      }
    });
  });
}

export default async function preExecutionGovernanceHandler(
  event: PluginHookBeforeToolCallEvent,
  ctx: PluginHookToolContext
): Promise<PluginHookBeforeToolCallResult | void> {
  log.info(`Processing tool call: ${event.toolName}`);

  try {
    const result = await runGovernanceCheck(event, ctx);
    log.info(`Governance decision: ${result.decision}`);

    if (result.decision === "block") {
      const reason = result.reason || "Blocked by governance policy";
      log.error(`Tool ${event.toolName} blocked: ${reason}`);
      return {
        block: true,
        blockReason: reason
      };
    }

    if (result.decision === "needs_review") {
      const reason = result.reason || "Review required by governance policy";
      log.warn(`Tool ${event.toolName} requires review: ${reason}`);
      return {
        requireApproval: {
          title: `Review required for ${event.toolName}`,
          description: reason,
          severity: toApprovalSeverity(result.risk_level),
          timeoutMs: 120000,
          timeoutBehavior: "deny"
        }
      };
    }

    log.info(`Tool ${event.toolName} allowed to proceed`);
    return;
  } catch (error) {
    log.error(`Handler error: ${String(error)}`);
    return {
      block: true,
      blockReason: "Governance hook failed closed"
    };
  }
}

export function toolResultPersistHandler(
  event: PluginHookToolResultPersistEvent,
  ctx: PluginHookToolContext
): { message?: unknown } | void {
  if (!isToolResultEnvelope(event.message)) {
    return;
  }

  try {
    const state = ensureGovernanceState();
    const changed = updateStateFromToolResult(state, ctx, event.message);
    if (changed) {
      saveGovernanceState(state);
    }
  } catch (error) {
    log.warn(`tool_result_persist update failed: ${String(error)}`);
  }

  return;
}

export function beforeMessageWriteHandler(
  event: PluginHookBeforeMessageWriteEvent,
  ctx: PluginHookToolContext
): BeforeMessageWriteResult | void {
  const role = getAssistantRole(event.message);
  if (role !== "assistant") {
    return;
  }

  const text = getAssistantText(event.message);
  if (!looksLikeCompletionClaim(text)) {
    return;
  }

  try {
    const state = ensureGovernanceState();
    const session = state.sessions[coerceSessionKey(ctx)];
    if (!session?.pending_mutation) {
      return;
    }

    log.warn("Completion claim rewritten: missing verification after mutation");
    return {
      message: buildGuardMessage(event.message, session)
    };
  } catch (error) {
    log.warn(`before_message_write guard failed: ${String(error)}`);
    return;
  }
}
