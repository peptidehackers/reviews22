#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { buildShowcaseData } from "../showcase/lib/showcase-data.mjs";
import { showcaseRoot, siteDataPath } from "../showcase/lib/source-data.mjs";

const portArg = process.argv.find((arg) => arg.startsWith("--port="));
const port = Number.parseInt(portArg?.split("=")[1] || process.env.PORT || "4173", 10);

fs.writeFileSync(siteDataPath, `${JSON.stringify(buildShowcaseData(), null, 2)}\n`);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png"
};

const server = http.createServer((request, response) => {
  const requestPath = request.url === "/" ? "/index.html" : request.url.split("?")[0];
  const filePath = path.join(showcaseRoot, decodeURIComponent(requestPath));

  if (!filePath.startsWith(showcaseRoot)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, buffer) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500, {
        "Content-Type": "text/plain; charset=utf-8"
      });
      response.end(error.code === "ENOENT" ? "Not found" : error.message);
      return;
    }

    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    response.end(buffer);
  });
});

server.on("error", (error) => {
  console.error(`Unable to serve showcase on 127.0.0.1:${port}: ${error.message}`);
  process.exit(1);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Showcase ready at http://127.0.0.1:${port}`);
});
