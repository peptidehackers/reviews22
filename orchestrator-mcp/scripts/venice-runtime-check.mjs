import { describeVeniceRuntime, smokeTestVenice } from "../venice-runtime.js";

const args = new Set(process.argv.slice(2));
const runSmoke = args.has("--smoke");
const asJson = args.has("--json");

const status = describeVeniceRuntime();

if (runSmoke && !status.hasVeniceKey) {
  const payload = {
    ok: false,
    ...status,
    error: "VENICE_API_KEY is missing from the current environment"
  };

  if (asJson) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.error("Venice runtime check failed: VENICE_API_KEY is missing from the current environment.");
  }

  process.exit(1);
}

let smoke = null;

if (runSmoke) {
  smoke = await smokeTestVenice();
}

const payload = {
  ok: true,
  ...status,
  smoke
};

if (asJson) {
  console.log(JSON.stringify(payload, null, 2));
} else {
  console.log(`Venice endpoint: ${payload.endpoint}`);
  console.log(`VENICE_API_KEY present: ${payload.hasVeniceKey ? "yes" : "no"}`);
  console.log(`Heavy reasoning default: ${payload.routerDefaults.heavyReasoning}`);
  console.log(`Uncensored lane default: ${payload.routerDefaults.uncensored}`);
  console.log(`Sample route primary: ${payload.sampleRoute.primaryModel} (${payload.sampleRoute.taskType})`);
  console.log(`Sample route fallback chain: ${payload.sampleRoute.fallbackChain.join(" -> ")}`);
  if (smoke) {
    console.log(`Smoke response: ${smoke.text}`);
    console.log(`Smoke tokens: in=${smoke.inputTokens} out=${smoke.outputTokens}`);
  }
}
