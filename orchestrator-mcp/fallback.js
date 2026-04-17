/**
 * Fallback Chain Executor - Execute tasks with automatic retry through fallback chain
 */

import { getFallbackChain, getModelCost, API_ENDPOINTS, OPENROUTER_MODELS } from "./models.js";
import { trackUsage } from "./cost.js";
import { checkPermission, getPermissionMode, PERMISSION_MODES } from "./permissions.js";
import { validatePrompt, enforceTrust, checkRateLimit } from "./security.js";
import { logModelCall, logDenial, logError, emitProgress, PROGRESS_EVENTS } from "./session.js";

// API keys from environment
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const MOONSHOT_API_KEY = process.env.MOONSHOT_API_KEY;
const CHUTES_API_KEY = process.env.CHUTES_API_KEY;
const VENICE_API_KEY = process.env.VENICE_API_KEY;

/**
 * Call a model directly via its API
 */
async function callDirectAPI(model, prompt, system, maxTokens = 4096) {
  const endpoint = API_ENDPOINTS[model];
  if (!endpoint) {
    throw new Error(`No direct API endpoint for model: ${model}`);
  }

  const apiKey = process.env[endpoint.envKey];
  if (!apiKey) {
    throw new Error(`Missing API key: ${endpoint.envKey}`);
  }

  // Different APIs have different formats
  if (model === "gemini") {
    return callGemini(apiKey, prompt, system, maxTokens);
  }

  // Most other APIs use OpenAI-compatible format
  return callOpenAICompatible(endpoint.url, apiKey, model, prompt, system, maxTokens);
}

/**
 * Call Gemini API (different format)
 */
async function callGemini(apiKey, prompt, system, maxTokens) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const contents = [];
  if (system) {
    contents.push({ role: "user", parts: [{ text: `System: ${system}` }] });
    contents.push({ role: "model", parts: [{ text: "Understood." }] });
  }
  contents.push({ role: "user", parts: [{ text: prompt }] });

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      generationConfig: { maxOutputTokens: maxTokens }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

  // Estimate tokens (rough approximation)
  const inputTokens = Math.ceil((prompt.length + (system?.length || 0)) / 4);
  const outputTokens = Math.ceil(text.length / 4);

  return { text, inputTokens, outputTokens };
}

/**
 * Call OpenAI-compatible API (DeepSeek, Moonshot, Chutes, Venice)
 */
async function callOpenAICompatible(url, apiKey, model, prompt, system, maxTokens) {
  const messages = [];
  if (system) {
    messages.push({ role: "system", content: system });
  }
  messages.push({ role: "user", content: prompt });

  // Model-specific adjustments
  let modelId = model;
  if (model === "venice") {
    modelId = "llama-3.3-70b";  // Venice's best uncensored model
  } else if (model === "chutes") {
    modelId = "deepseek-ai/DeepSeek-V3-0324";
  } else if (model === "deepseek") {
    modelId = "deepseek-chat";
  } else if (model === "moonshot") {
    modelId = "moonshot-v1-auto";
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelId,
      messages,
      max_tokens: maxTokens
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`${model} API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || "";
  const inputTokens = data.usage?.prompt_tokens || Math.ceil((prompt.length + (system?.length || 0)) / 4);
  const outputTokens = data.usage?.completion_tokens || Math.ceil(text.length / 4);

  return { text, inputTokens, outputTokens };
}

/**
 * Call OpenRouter API (for non-GPT models like Qwen, Llama)
 */
async function callOpenRouter(model, prompt, system, maxTokens = 4096) {
  if (!OPENROUTER_API_KEY) {
    throw new Error("Missing OPENROUTER_API_KEY");
  }

  const modelId = OPENROUTER_MODELS[model];
  if (!modelId) {
    throw new Error(`Unknown OpenRouter model: ${model}`);
  }

  const messages = [];
  if (system) {
    messages.push({ role: "system", content: system });
  }
  messages.push({ role: "user", content: prompt });

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`
    },
    body: JSON.stringify({
      model: modelId,
      messages,
      max_tokens: maxTokens
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || "";
  const inputTokens = data.usage?.prompt_tokens || Math.ceil((prompt.length + (system?.length || 0)) / 4);
  const outputTokens = data.usage?.completion_tokens || Math.ceil(text.length / 4);

  return { text, inputTokens, outputTokens };
}

/**
 * Call GPT models via Codex CLI (uses OAuth, not API key)
 */
async function callCodex(model, prompt, system, maxTokens = 4096) {
  const { execSync } = await import("child_process");

  // Map model names to Codex model IDs
  const codexModels = {
    "gpt54": "gpt-5.4",
    "gpt54mini": "gpt-5.4-mini"
  };

  const codexModel = codexModels[model];
  if (!codexModel) {
    throw new Error(`Unknown Codex model: ${model}`);
  }

  // Build the prompt with system instruction if provided
  const fullPrompt = system ? `${system}\n\n${prompt}` : prompt;

  // Escape the prompt for shell (using double quotes and escaping)
  const escapedPrompt = fullPrompt.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$');

  try {
    // Pipe prompt via stdin to avoid shell escaping issues
    const result = execSync(
      `echo "${escapedPrompt}" | codex exec --skip-git-repo-check -m ${codexModel} --sandbox read-only 2>/dev/null`,
      {
        encoding: "utf-8",
        timeout: 120000,  // 2 minute timeout
        maxBuffer: 10 * 1024 * 1024,  // 10MB buffer
        shell: "/bin/bash"
      }
    );

    const text = result.trim();
    // Estimate tokens (rough approximation)
    const inputTokens = Math.ceil((fullPrompt.length) / 4);
    const outputTokens = Math.ceil(text.length / 4);

    return { text, inputTokens, outputTokens };
  } catch (error) {
    throw new Error(`Codex error: ${error.message}`);
  }
}

/**
 * Call MiniMax via native Anthropic-compatible API (supports M2.7 with thinking)
 */
async function callMiniMax(prompt, system, maxTokens = 4096) {
  if (!MINIMAX_API_KEY) {
    throw new Error("Missing MINIMAX_API_KEY");
  }

  const response = await fetch("https://api.minimax.io/anthropic/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${MINIMAX_API_KEY}`,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "MiniMax-M2.7",
      max_tokens: maxTokens,
      system: system || "You are a helpful AI assistant.",
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`MiniMax API error: ${response.status} - ${error}`);
  }

  const data = await response.json();

  // Extract text from MiniMax response (may include thinking blocks)
  let text = "";
  for (const block of data.content || []) {
    if (block.type === "text") {
      text = block.text;
    }
  }

  const inputTokens = data.usage?.input_tokens || Math.ceil((prompt.length + (system?.length || 0)) / 4);
  const outputTokens = data.usage?.output_tokens || Math.ceil(text.length / 4);

  return { text, inputTokens, outputTokens };
}

/**
 * Call any model by name (with security checks)
 */
export async function callModel(model, prompt, system = null, maxTokens = 4096, options = {}) {
  const { skipSecurity = false, operation = "execute" } = options;
  const cost = getModelCost(model);

  // Emit progress: starting model call
  emitProgress(PROGRESS_EVENTS.MODEL_CALL, { model, promptLength: prompt.length });

  // Security checks (unless bypassed)
  if (!skipSecurity) {
    // 1. Permission check
    const permission = checkPermission(prompt, { model, operation });
    if (!permission.allowed) {
      logDenial(prompt, model, permission.reason);
      throw new Error(`Permission denied: ${permission.reason}`);
    }

    // 2. Trust and validation check
    const trustCheck = enforceTrust(model, prompt, operation);
    if (!trustCheck.allowed) {
      logDenial(prompt, model, trustCheck.reason);
      throw new Error(`Trust check failed: ${trustCheck.reason}`);
    }

    // 3. Rate limit check
    const rateCheck = checkRateLimit(model);
    if (!rateCheck.allowed) {
      throw new Error(`Rate limit: ${rateCheck.reason}`);
    }
  }

  let result;

  try {
    switch (cost.provider) {
      case "mcp":
        if (model === "minimax") {
          result = await callMiniMax(prompt, system, maxTokens);
        } else {
          throw new Error(`Unknown MCP model: ${model}`);
        }
        break;

      case "direct":
        result = await callDirectAPI(model, prompt, system, maxTokens);
        break;

      case "openrouter":
        result = await callOpenRouter(model, prompt, system, maxTokens);
        break;

      case "codex":
        result = await callCodex(model, prompt, system, maxTokens);
        break;

      case "anthropic":
        // Claude is native, shouldn't be called through orchestrator
        throw new Error("Claude should be called natively, not through orchestrator");

      default:
        throw new Error(`Unknown provider for model: ${model}`);
    }

    // Track usage
    trackUsage(model, result.inputTokens, result.outputTokens);

    // Log to session
    logModelCall(model, prompt, result.text, {
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens
    });

    // Emit progress: model response received
    emitProgress(PROGRESS_EVENTS.MODEL_RESPONSE, {
      model,
      responseLength: result.text?.length || 0,
      tokens: { input: result.inputTokens, output: result.outputTokens }
    });

    return result;
  } catch (error) {
    // Log error
    logError(error, { model, promptLength: prompt.length });
    emitProgress(PROGRESS_EVENTS.ERROR, { model, error: error.message });

    throw new Error(`Failed to call ${model}: ${error.message}`);
  }
}

/**
 * Call model without security checks (internal use only)
 */
export async function callModelUnsafe(model, prompt, system = null, maxTokens = 4096) {
  return callModel(model, prompt, system, maxTokens, { skipSecurity: true });
}

/**
 * Execute with automatic fallback through chain
 */
export async function executeWithFallback(prompt, chain, options = {}) {
  const { system = null, maxTokens = 4096, maxRetries = 1, operation = "execute" } = options;
  const errors = [];

  emitProgress(PROGRESS_EVENTS.START, {
    type: "fallback_chain",
    chain: chain.filter(m => m !== "claude"),
    promptLength: prompt.length
  });

  for (const model of chain) {
    // Skip claude in fallback chains (it's the native model)
    if (model === "claude") {
      continue;
    }

    for (let retry = 0; retry <= maxRetries; retry++) {
      try {
        const result = await callModel(model, prompt, system, maxTokens, { operation });

        emitProgress(PROGRESS_EVENTS.COMPLETE, {
          type: "fallback_chain",
          model,
          success: true,
          failedModels: errors.map(e => e.model)
        });

        return {
          success: true,
          model,
          result: result.text,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          attempt: retry + 1,
          failedModels: errors.map(e => e.model)
        };
      } catch (error) {
        errors.push({ model, error: error.message, attempt: retry + 1 });

        // Only retry on transient errors
        if (!isTransientError(error)) {
          break;
        }

        // Brief delay before retry
        if (retry < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (retry + 1)));
        }
      }
    }
  }

  emitProgress(PROGRESS_EVENTS.COMPLETE, {
    type: "fallback_chain",
    success: false,
    errors
  });

  return {
    success: false,
    error: "All models in chain failed",
    attempts: errors
  };
}

/**
 * Check if error is transient (worth retrying)
 */
function isTransientError(error) {
  const transientPatterns = [
    /timeout/i,
    /rate limit/i,
    /503/,
    /502/,
    /overloaded/i,
    /temporarily unavailable/i
  ];

  return transientPatterns.some(pattern => pattern.test(error.message));
}

/**
 * Execute task on specific model
 */
export async function executeSingle(model, prompt, options = {}) {
  const { system = null, maxTokens = 4096, operation = "execute" } = options;

  emitProgress(PROGRESS_EVENTS.START, {
    type: "single_model",
    model,
    promptLength: prompt.length
  });

  try {
    const result = await callModel(model, prompt, system, maxTokens, { operation });

    emitProgress(PROGRESS_EVENTS.COMPLETE, {
      type: "single_model",
      model,
      success: true
    });

    return {
      success: true,
      model,
      result: result.text,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens
    };
  } catch (error) {
    emitProgress(PROGRESS_EVENTS.COMPLETE, {
      type: "single_model",
      model,
      success: false,
      error: error.message
    });

    return {
      success: false,
      model,
      error: error.message
    };
  }
}

// Re-export security utilities for external use
export { checkPermission, setPermissionMode, getPermissionMode, PERMISSION_MODES } from "./permissions.js";
export { validatePrompt, enforceTrust, getModelTrust, TRUST_LEVELS } from "./security.js";
export { createSession, getSession, endSession, getMetrics, onProgress, PROGRESS_EVENTS } from "./session.js";
