/**
 * Config loader for orchestrator policy tables.
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = process.env.ORCHESTRATOR_CONFIG_DIR || join(MODULE_DIR, "config");
const configCache = new Map();

export function getConfigDir() {
  return CONFIG_DIR;
}

export function loadConfig(name) {
  const cached = configCache.get(name);
  if (cached) {
    return cached;
  }

  const configPath = join(CONFIG_DIR, name);
  const parsed = JSON.parse(readFileSync(configPath, "utf8"));
  configCache.set(name, parsed);
  return parsed;
}

export function compileRegexList(patterns = [], flags = "i") {
  return patterns.map((pattern) => new RegExp(pattern, flags));
}

export function resetConfigCache() {
  configCache.clear();
}
