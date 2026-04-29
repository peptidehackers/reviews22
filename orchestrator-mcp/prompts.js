/**
 * Layered prompt templates - shared identity/policy/output contracts plus model-style adapters.
 */

import { loadConfig } from "./config-loader.js";
import { getPromptStyle } from "./models.js";

const config = loadConfig("prompts.json");

const IDENTITY_LAYER = config.identityLayer;
const POLICY_LAYER = config.policyLayer;
const STYLE_ADAPTERS = config.styleAdapters;
const TASK_PROMPTS = config.taskPrompts;
const LAYER_NAMES = config.layerNames;

function renderSection(title, body) {
  return `## ${title}\n\n${body}`;
}

function getTaskPrompt(taskType) {
  return TASK_PROMPTS[taskType] || null;
}

function buildPromptLayers({ taskType, style, context = "", additionalInstructions = "" }) {
  const taskPrompt = getTaskPrompt(taskType);
  if (!taskPrompt) {
    return [];
  }

  const layers = [
    renderSection("Identity", IDENTITY_LAYER),
    renderSection("Operating Policy", POLICY_LAYER),
    renderSection("Task Goal", taskPrompt.goal),
    renderSection("Task Lens", taskPrompt[style] || taskPrompt.mechanics),
    renderSection(STYLE_ADAPTERS[style].title, STYLE_ADAPTERS[style].body),
    renderSection("Output Contract", taskPrompt.output)
  ];

  if (additionalInstructions) {
    layers.push(renderSection("Additional Instructions", additionalInstructions));
  }

  if (context) {
    layers.push(renderSection("Content to Analyze", context));
  }

  return layers;
}

export function getPrompt(taskType, model, context = "") {
  const style = getPromptStyle(model);
  const layers = buildPromptLayers({ taskType, style, context });

  if (layers.length === 0) {
    return context;
  }

  return layers.join("\n\n");
}

export function getRawPrompt(taskType, style = "mechanics") {
  const layers = buildPromptLayers({ taskType, style });
  return layers.length > 0 ? layers.join("\n\n") : null;
}

export function listPromptTemplates() {
  return Object.keys(TASK_PROMPTS);
}

export function getPromptComparison(taskType) {
  const taskPrompt = getTaskPrompt(taskType);
  if (!taskPrompt) {
    return null;
  }

  const mechanics = buildPromptLayers({ taskType, style: "mechanics" }).join("\n\n");
  const principles = buildPromptLayers({ taskType, style: "principles" }).join("\n\n");

  return {
    taskType,
    mechanics,
    principles,
    mechanicsLength: mechanics.length,
    principlesLength: principles.length,
    layerNames: LAYER_NAMES
  };
}

export function buildPrompt(options) {
  const { taskType, model, context = "", additionalInstructions = "" } = options;
  const style = getPromptStyle(model);
  const layers = buildPromptLayers({ taskType, style, context, additionalInstructions });

  return layers.length > 0 ? layers.join("\n\n") : context;
}
