import { loadConfig } from "./config-loader.js";
import { routeTask } from "./router.js";
import { createVeniceChatCompletion } from "./venice-api.js";

const DEFAULT_SAMPLE_TASK = "Build a new feature that coordinates multiple services";

export function describeVeniceRuntime(options = {}) {
  const {
    env = process.env,
    sampleTask = DEFAULT_SAMPLE_TASK
  } = options;

  const models = loadConfig("models.json");
  const router = loadConfig("router.json");
  const sampleRoute = routeTask(sampleTask);
  const endpoint = models.apiEndpoints?.venice?.url ?? null;

  return {
    providerConfigured: Boolean(endpoint),
    endpoint,
    envKey: models.apiEndpoints?.venice?.envKey ?? "VENICE_API_KEY",
    hasVeniceKey: Boolean(env.VENICE_API_KEY),
    routerDefaults: {
      heavyReasoning: router.primaryModels?.["heavy-reasoning"] ?? null,
      uncensored: router.primaryModels?.uncensored ?? null
    },
    sampleRoute: {
      task: sampleTask,
      taskType: sampleRoute.taskType,
      primaryModel: sampleRoute.primaryModel,
      fallbackChain: sampleRoute.fallbackChain,
      promptStyle: sampleRoute.promptStyle
    }
  };
}

export async function smokeTestVenice(options = {}) {
  const {
    prompt = "Reply with exactly: OK",
    maxCompletionTokens = 32
  } = options;

  const response = await createVeniceChatCompletion({
    messages: [{ role: "user", content: prompt }],
    maxCompletionTokens
  });

  const text = response.choices?.[0]?.message?.content?.trim() ?? "";
  const usage = response.usage ?? {};

  return {
    text,
    inputTokens: usage.prompt_tokens ?? null,
    outputTokens: usage.completion_tokens ?? null
  };
}
