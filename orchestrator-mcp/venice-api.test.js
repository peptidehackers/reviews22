import test from "node:test";
import assert from "node:assert/strict";

import {
  VENICE_CHAT_COMPLETIONS_URL,
  VENICE_MODELS_URL,
  createVeniceChatCompletion,
  listVeniceModels
} from "./venice-api.js";

test("listVeniceModels calls the official models endpoint", async () => {
  const calls = [];
  const models = await listVeniceModels({
    env: { VENICE_API_KEY: "test-key" },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        async json() {
          return { data: [{ id: "venice-uncensored" }] };
        }
      };
    }
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, VENICE_MODELS_URL);
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.headers.Authorization, "Bearer test-key");
  assert.deepEqual(models, [{ id: "venice-uncensored" }]);
});

test("createVeniceChatCompletion uses max_completion_tokens and venice default model", async () => {
  const calls = [];
  const response = await createVeniceChatCompletion({
    env: { VENICE_API_KEY: "test-key" },
    messages: [{ role: "user", content: "hi" }],
    maxCompletionTokens: 64,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        async json() {
          return { choices: [{ message: { content: "hello" } }] };
        }
      };
    }
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, VENICE_CHAT_COMPLETIONS_URL);
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.model, "venice-uncensored");
  assert.equal(body.max_completion_tokens, 64);
  assert.equal(body.max_tokens, undefined);
  assert.deepEqual(body.messages, [{ role: "user", content: "hi" }]);
  assert.equal(response.choices[0].message.content, "hello");
});

