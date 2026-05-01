export const VENICE_API_BASE_URL = "https://api.venice.ai/api/v1";
export const VENICE_CHAT_COMPLETIONS_URL = `${VENICE_API_BASE_URL}/chat/completions`;
export const VENICE_MODELS_URL = `${VENICE_API_BASE_URL}/models`;
export const VENICE_DEFAULT_MODEL = "venice-uncensored";

function getVeniceApiKey(env = process.env) {
  const apiKey = env.VENICE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing VENICE_API_KEY");
  }
  return apiKey;
}

function buildHeaders(apiKey) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`
  };
}

export async function listVeniceModels(options = {}) {
  const {
    env = process.env,
    fetchImpl = global.fetch
  } = options;

  const apiKey = getVeniceApiKey(env);
  const response = await fetchImpl(VENICE_MODELS_URL, {
    method: "GET",
    headers: buildHeaders(apiKey)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Venice models error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.data ?? [];
}

export async function createVeniceChatCompletion(options = {}) {
  const {
    env = process.env,
    fetchImpl = global.fetch,
    model = VENICE_DEFAULT_MODEL,
    messages,
    maxCompletionTokens = 256,
    reasoningEffort = null,
    temperature = null
  } = options;

  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("messages must be a non-empty array");
  }

  const apiKey = getVeniceApiKey(env);
  const body = {
    model,
    messages,
    max_completion_tokens: maxCompletionTokens
  };

  if (reasoningEffort) {
    body.reasoning_effort = reasoningEffort;
  }

  if (temperature !== null && temperature !== undefined) {
    body.temperature = temperature;
  }

  const response = await fetchImpl(VENICE_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Venice chat error: ${response.status} - ${error}`);
  }

  return response.json();
}

