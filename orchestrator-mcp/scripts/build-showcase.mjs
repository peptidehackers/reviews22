#!/usr/bin/env node
import fs from "node:fs";
import { buildShowcaseData } from "../showcase/lib/showcase-data.mjs";
import { siteDataPath } from "../showcase/lib/source-data.mjs";

const serialized = `${JSON.stringify(buildShowcaseData(), null, 2)}\n`;
const checkMode = process.argv.includes("--check");
const current = fs.existsSync(siteDataPath) ? fs.readFileSync(siteDataPath, "utf8") : "";

if (checkMode) {
  if (current !== serialized) {
    console.error("showcase/site-data.json is out of date. Run `npm run showcase:build`.");
    process.exit(1);
  }

  console.log("showcase/site-data.json is up to date.");
  process.exit(0);
}

fs.writeFileSync(siteDataPath, serialized);
const data = JSON.parse(serialized);
console.log(`Wrote showcase/site-data.json (${data.toolGroups.reduce((sum, group) => sum + group.tools.length, 0)} tools, ${data.models.summaries.length} models).`);
