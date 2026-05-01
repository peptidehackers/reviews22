const data = await fetch("./site-data.json").then((response) => response.json());

const $ = (selector) => document.querySelector(selector);
const byId = (id) => document.getElementById(id);

function badgeClass(kind, value) {
  if (kind === "risk") {
    return `badge-risk-${value}`;
  }
  if (kind === "consensus") {
    return `badge-consensus-${value}`;
  }
  if (kind === "latency") {
    return `badge-latency-${value}`;
  }
  if (kind === "context") {
    return `badge-context-${value}`;
  }
  return "badge-default";
}

function renderHero() {
  byId("hero-eyebrow").textContent = data.hero.eyebrow;
  byId("hero-title").textContent = data.hero.title;
  byId("hero-summary").textContent = data.hero.summary;
  byId("footer-digest").textContent = `source digest: ${data.sourceDigest.slice(0, 16)}…`;

  const principles = byId("hero-principles");
  principles.innerHTML = data.hero.principles.map((item) => `<li>${item}</li>`).join("");

  const stats = byId("stats-grid");
  stats.innerHTML = data.stats
    .map(
      (stat) => `
        <article class="stat-card">
          <div class="small">${stat.label}</div>
          <div class="stat-value">${stat.value}</div>
          <div class="stat-detail">${stat.detail}</div>
        </article>
      `
    )
    .join("");
}

function renderNarrative() {
  byId("narrative-grid").innerHTML = data.narrativePanels
    .map(
      (panel) => `
        <article class="card">
          <div class="kicker">${panel.title}</div>
          <p>${panel.body}</p>
        </article>
      `
    )
    .join("");
}

function matchesAny(task, patterns = []) {
  return patterns.some((pattern) => new RegExp(pattern, "i").test(task));
}

function scoreIntent(task, patterns) {
  return Object.fromEntries(
    Object.entries(patterns).map(([intent, intentPatterns]) => [
      intent,
      intentPatterns.reduce((score, pattern) => score + (new RegExp(pattern, "i").test(task) ? 1 : 0), 0)
    ])
  );
}

function inferIntent(task, config) {
  const scores = scoreIntent(task, config.intentPatterns);
  return Object.entries(scores).sort((a, b) => b[1] - a[1])[0]?.[1] > 0
    ? Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0]
    : "implement";
}

function inferRisk(task, intent, config) {
  if (matchesAny(task, config.riskPatterns.high) || intent === "security") {
    return "high";
  }
  if (matchesAny(task, config.riskPatterns.medium) || ["debug", "architecture", "review"].includes(intent)) {
    return "medium";
  }
  return "low";
}

function inferScope(task, config) {
  if (matchesAny(task, config.scopePatterns.project)) {
    return "project-wide";
  }
  if (matchesAny(task, config.scopePatterns.single)) {
    return "single-file";
  }
  return "cross-file";
}

function inferDepth(task, intent, risk, config) {
  if (matchesAny(task, config.depthPatterns.fast) && risk === "low" && intent === "search") {
    return "fast";
  }
  if (matchesAny(task, config.depthPatterns.deep) || risk === "high" || ["architecture", "security"].includes(intent)) {
    return "deep";
  }
  return "balanced";
}

function inferActionMode(task, intent) {
  if (/implement|fix|write|change|update|modify/i.test(task) || intent === "implement") {
    return "execute";
  }
  if (intent === "search") {
    return "answer";
  }
  return "analyze";
}

function inferMemoryMode(task, intent, scope, config) {
  if (intent === "search" || matchesAny(task, config.memoryPatterns.exact)) {
    return "exact";
  }
  if (intent === "architecture") {
    return "semantic";
  }
  if (["debug", "security", "review"].includes(intent) || scope === "project-wide") {
    return "hybrid";
  }
  return "none";
}

function inferConsensusMode(task, intent, risk, config) {
  if (risk === "high" || ["architecture", "security"].includes(intent)) {
    return "strong";
  }
  if (["review", "debug"].includes(intent) || matchesAny(task, config.memoryPatterns.lightConsensus)) {
    return "light";
  }
  return "off";
}

function deriveTaskType(task, intent, risk, scope) {
  if (intent === "search") {
    return scope === "project-wide" ? "long-context" : "fast-search";
  }
  if (intent === "review") {
    return "code-review";
  }
  if (intent === "security" || (risk === "high" && /auth|vuln|security|pii/i.test(task))) {
    return "security";
  }
  if (intent === "architecture") {
    return "architecture";
  }
  if (intent === "debug") {
    return scope === "project-wide" ? "long-context" : "debug";
  }
  return "heavy-reasoning";
}

function routeTaskPreview(task) {
  const config = data.routerLab.routerConfig;
  const intent = inferIntent(task, config);
  const risk = inferRisk(task, intent, config);
  const scope = inferScope(task, config);
  const speedDepth = inferDepth(task, intent, risk, config);
  const actionMode = inferActionMode(task, intent);
  const memoryMode = inferMemoryMode(task, intent, scope, config);
  const consensusMode = inferConsensusMode(task, intent, risk, config);
  const taskType = deriveTaskType(task, intent, risk, scope);
  const primaryModel = config.primaryModels[taskType] || "venice";
  return {
    intent,
    risk,
    scope,
    speedDepth,
    actionMode,
    memoryMode,
    consensusMode,
    taskType,
    primaryModel,
    useParallel: consensusMode !== "off" || data.routerLab.parallelTasks.includes(taskType)
  };
}

function renderRoute(route) {
  byId("router-output").innerHTML = `
    <div class="route-grid">
      <article class="route-card"><strong>Intent</strong>${route.intent}</article>
      <article class="route-card"><strong>Task type</strong>${route.taskType}</article>
      <article class="route-card"><strong>Primary model</strong>${route.primaryModel}</article>
      <article class="route-card"><strong>Action mode</strong>${route.actionMode}</article>
      <article class="route-card"><strong>Scope</strong>${route.scope}</article>
      <article class="route-card"><strong>Memory mode</strong>${route.memoryMode}</article>
      <article class="route-card"><strong>Depth</strong>${route.speedDepth}</article>
      <article class="route-card"><strong>Parallel</strong>${route.useParallel ? "yes" : "no"}</article>
    </div>
    <div class="badge-row">
      <span class="badge ${badgeClass("risk", route.risk)}">risk: ${route.risk}</span>
      <span class="badge ${badgeClass("consensus", route.consensusMode)}">consensus: ${route.consensusMode}</span>
      <span class="badge badge-default">primary: ${route.primaryModel}</span>
    </div>
  `;
}

function renderRouterLab() {
  const input = byId("task-input");
  input.placeholder = data.routerLab.promptPlaceholder;
  input.value = data.routerLab.examples[0].prompt;
  renderRoute(routeTaskPreview(input.value));

  input.addEventListener("input", () => renderRoute(routeTaskPreview(input.value)));

  byId("example-chips").innerHTML = data.routerLab.examples
    .map(
      (example) => `<button class="chip" type="button" data-prompt="${example.prompt.replace(/"/g, "&quot;")}">${example.title}</button>`
    )
    .join("");

  byId("example-chips").addEventListener("click", (event) => {
    const target = event.target.closest("button[data-prompt]");
    if (!target) return;
    input.value = target.dataset.prompt;
    renderRoute(routeTaskPreview(input.value));
  });
}

function renderScenarios() {
  byId("scenario-grid").innerHTML = data.scenarioRoutes
    .map(
      (scenario) => `
        <article class="scenario-card">
          <div>
            <div class="kicker">${scenario.title}</div>
            <p>${scenario.prompt}</p>
          </div>
          <div class="small">${scenario.why}</div>
          <div class="badge-row">
            <span class="badge ${badgeClass("risk", scenario.route.risk)}">${scenario.route.taskType}</span>
            <span class="badge ${badgeClass("consensus", scenario.route.consensusMode)}">${scenario.route.consensusMode}</span>
            <span class="badge badge-default">${scenario.route.primaryModel}</span>
          </div>
        </article>
      `
    )
    .join("");
}

function renderToolAtlas() {
  byId("tool-spotlights").innerHTML = data.toolSpotlights
    .map(
      (tool) => `
        <article class="tool-card">
          <div class="kicker">${tool.serverId}</div>
          <strong>${tool.name}</strong>
          <p>${tool.highlight}</p>
          <div class="badge-row">
            <span class="badge badge-default">${tool.category}</span>
            <span class="badge badge-default">required: ${tool.required.join(", ") || "none"}</span>
          </div>
        </article>
      `
    )
    .join("");

  byId("tool-groups").innerHTML = data.toolGroups
    .map(
      (group) => `
        <section class="tool-group">
          <h3>${group.category}</h3>
          <div class="tool-grid">
            ${group.tools
              .map(
                (tool) => `
                  <article class="tool-card">
                    <div class="kicker">${tool.serverId}</div>
                    <strong>${tool.name}</strong>
                    <p>${tool.description}</p>
                    <ul class="property-list">
                      <li><strong>Required:</strong> ${tool.required.join(", ") || "none"}</li>
                      <li><strong>Optional:</strong> ${tool.optional.join(", ") || "none"}</li>
                    </ul>
                  </article>
                `
              )
              .join("")}
          </div>
        </section>
      `
    )
    .join("");
}

function renderRecipes() {
  byId("recipe-grid").innerHTML = data.quickstartRecipes
    .map(
      (recipe) => `
        <article class="recipe-card">
          <div class="kicker">${recipe.server}</div>
          <strong>${recipe.title}</strong>
          <p>${recipe.intent}</p>
          <pre>${JSON.stringify({ tool: recipe.tool, arguments: recipe.args }, null, 2)}</pre>
        </article>
      `
    )
    .join("");
}

function renderModels() {
  const leaders = data.models.leaders;
  byId("leader-grid").innerHTML = [
    { label: "Cheapest input", value: `${leaders.cheapestInput.model} • $${leaders.cheapestInput.cost}/M` },
    { label: "Cheapest output", value: `${leaders.cheapestOutput.model} • $${leaders.cheapestOutput.cost}/M` },
    { label: "Fastest lane", value: `${leaders.fastestLane.model} • ${leaders.fastestLane.latency}` },
    { label: "Deepest reasoning", value: `${leaders.deepestReasoning.model} • ${leaders.deepestReasoning.reasoning}` },
    { label: "Largest context", value: `${leaders.largestContext.model} • ${leaders.largestContext.context}` },
    { label: "LLM council", value: `${leaders.llmCouncilChairman} chairs ${leaders.llmCouncilSize} models` }
  ]
    .map(
      (leader) => `
        <article class="leader-card">
          <div class="small">${leader.label}</div>
          <strong>${leader.value}</strong>
        </article>
      `
    )
    .join("");

  byId("model-table-body").innerHTML = data.models.summaries
    .map(
      (model) => `
        <tr>
          <td>${model.name}</td>
          <td>${model.family}</td>
          <td>$${model.inputCost}</td>
          <td>$${model.outputCost}</td>
          <td>${model.reasoning}</td>
          <td>${model.latency}</td>
          <td>${model.context}</td>
        </tr>
      `
    )
    .join("");

  byId("fallback-stories").innerHTML = data.models.fallbackStories
    .map(
      (story) => `
        <article class="fallback-story">
          <strong>${story.taskType}</strong>
          <p>Primary: ${story.primary}. Backups: ${story.backups.join(" → ") || "none"}.</p>
          <div class="badge-row">
            <span class="badge badge-default">${story.chain.join(" → ")}</span>
          </div>
        </article>
      `
    )
    .join("");
}

function renderIntegrationNotes() {
  byId("integration-grid").innerHTML = data.integrationNotes
    .map(
      (note) => `
        <article class="integration-card">
          <strong>${note.title}</strong>
          <ul class="integration-list">
            ${note.bullets.map((bullet) => `<li>${bullet}</li>`).join("")}
          </ul>
        </article>
      `
    )
    .join("");
}

renderHero();
renderNarrative();
renderRouterLab();
renderScenarios();
renderToolAtlas();
renderRecipes();
renderModels();
renderIntegrationNotes();
