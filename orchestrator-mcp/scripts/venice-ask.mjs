import { createVeniceChatCompletion } from "../venice-api.js";

const prompt = process.argv.slice(2).join(" ").trim();

if (!prompt) {
  console.error("Usage: npm run venice:ask -- \"your prompt here\"");
  process.exit(1);
}

const response = await createVeniceChatCompletion({
  messages: [{ role: "user", content: prompt }],
  maxCompletionTokens: 256
});

const text = response.choices?.[0]?.message?.content?.trim() ?? "";
console.log(text);

