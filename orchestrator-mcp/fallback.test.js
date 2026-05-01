import test from "node:test";
import assert from "node:assert/strict";

import { callModelUnsafe } from "./fallback.js";

test("venice direct calls use the current venice chat model alias", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.VENICE_API_KEY;
  const calls = [];

  process.env.VENICE_API_KEY = "test-venice-key";
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      async json() {
        return {
          choices: [{ message: { content: "ok" } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 }
        };
      }
    };
  };

  try {
    const result = await callModelUnsafe("venice", "hello");

    assert.equal(result.text, "ok");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.venice.ai/api/v1/chat/completions");

    const payload = JSON.parse(calls[0].options.body);
    assert.equal(payload.model, "venice-uncensored");
    assert.equal(payload.max_completion_tokens, 4096);
    assert.equal(payload.max_tokens, undefined);
    assert.deepEqual(payload.messages, [{ role: "user", content: "hello" }]);
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) {
      delete process.env.VENICE_API_KEY;
    } else {
      process.env.VENICE_API_KEY = originalKey;
    }
  }
});
