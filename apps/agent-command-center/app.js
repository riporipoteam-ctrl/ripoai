const colorPalette = [
  "#ff5f2e",
  "#00a78e",
  "#ffcf4a",
  "#4c79ff",
  "#ff7b89",
  "#7d5cff",
  "#1fbaec",
  "#f08d00",
  "#2d6a4f",
  "#d9486b",
  "#3f8efc",
  "#8d6e63",
];

const modeConfigs = {
  "product-launch": {
    label: "Product Launch",
    cadence: "daily",
    routing:
      "Lead coordinator routes design, build, QA, and launch tasks, then merges the outputs into one client-ready response.",
    roles: [
      ["Vision Architect", "Turns the mission into a clear product direction and outcome map."],
      ["Frontend Lead", "Builds the interface, motion, layout, and visual system."],
      ["Backend Operator", "Shapes APIs, data flows, integrations, and reliability rules."],
      ["Growth Strategist", "Handles launch angle, funnel hooks, and positioning."],
      ["Quality Sentinel", "Stress-tests flows, catches regressions, and writes release notes."],
      ["Delivery Captain", "Owns packaging, hosting prep, and handoff checklists."],
      ["Design Director", "Pushes the product away from generic templates into strong visual taste."],
      ["Prompt Engineer", "Refines agent instructions, orchestration logic, and execution plans."],
      ["Analytics Mapper", "Defines instrumentation, dashboards, and success metrics."],
      ["Customer Storyteller", "Writes onboarding, landing copy, and key user moments."],
      ["Partnership Scout", "Surfaces launch channels, referrals, and promo angles."],
      ["Monetization Analyst", "Designs pricing, packaging, and upgrade hooks."],
    ],
    agenda: [
      ["09:00", "Vision Architect locks the feature priorities and success bar."],
      ["09:20", "Design Director and Frontend Lead align on the visual lane."],
      ["10:00", "Backend Operator scopes data contracts and integration risk."],
      ["13:00", "Growth Strategist and Storyteller sharpen the launch message."],
      ["16:30", "Quality Sentinel runs the release gate and Delivery Captain closes the ship list."],
    ],
    pipeline: [
      ["System direction", "Clear product spec, role split, and delivery priorities."],
      ["Build sprint", "Frontend, backend, and content loops run in parallel."],
      ["Review gate", "QA, design critique, and prompt cleanup before shipping."],
      ["Release pack", "Zip, deploy notes, and hosting recommendations are assembled."],
    ],
    surfaces: [
      ["Telegram front desk", "One main bot collects requests and reports progress back to you."],
      ["Command center UI", "A web surface tracks roles, meetings, and delivery lanes."],
      ["Release bundle", "Final app/site output is packaged for download and hosting."],
    ],
  },
  "research-swarm": {
    label: "Research Swarm",
    cadence: "twice daily",
    routing:
      "The coordinator fans out research tasks, compares findings, and asks one reviewer to merge contradictions before answering.",
    roles: [
      ["Research Director", "Breaks the mission into investigative tracks."],
      ["Source Hunter", "Finds credible documents, products, and references."],
      ["Trend Analyst", "Summarizes patterns, competition, and market movement."],
      ["Skeptic Reviewer", "Challenges weak claims and missing evidence."],
      ["Synthesis Writer", "Turns findings into a crisp, useful brief."],
      ["Ops Librarian", "Organizes notes, links, and reusable knowledge."],
      ["Experiment Planner", "Suggests next tests, prototypes, and validation runs."],
      ["Decision Coach", "Converts research into action-oriented recommendations."],
      ["Signal Tracker", "Keeps watch on fast-changing items and alerts."],
      ["Proof Builder", "Creates charts, tables, or demos to support the case."],
      ["Counterpoint Agent", "Argues the opposite side to harden the plan."],
      ["Delivery Reporter", "Packages the final brief for handoff."],
    ],
    agenda: [
      ["08:30", "Research Director assigns tracks and confidence goals."],
      ["11:00", "Source Hunter and Trend Analyst compare findings."],
      ["14:00", "Skeptic Reviewer pressures the weakest claims."],
      ["17:00", "Synthesis Writer and Delivery Reporter prepare the final brief."],
    ],
    pipeline: [
      ["Track split", "Parallel research lanes open with clear focus areas."],
      ["Evidence pull", "Browser search, fetch, and reading gather the facts."],
      ["Critique pass", "The skeptic loop removes weak assumptions."],
      ["Decision brief", "Findings become a plan, not just a dump of links."],
    ],
    surfaces: [
      ["Telegram summaries", "You get fast reports without reading the whole notebook."],
      ["Research dashboard", "Clusters, findings, and confidence are visible in one place."],
      ["Exportable brief", "The final research package can be saved or zipped."],
    ],
  },
  "ops-lab": {
    label: "Ops Lab",
    cadence: "hourly",
    routing:
      "The lead bot triages, the ops team handles incidents and deploy prep, and one closer writes the exact next steps back to you.",
    roles: [
      ["Ops Chief", "Sets priorities and assigns the highest-impact fixes."],
      ["Infra Wrangler", "Handles deploy surfaces, env rules, and runtime health."],
      ["Automation Builder", "Creates scripts, cron flows, and repeatable fixes."],
      ["Security Watch", "Checks blast radius, approvals, and secret handling."],
      ["Release Engineer", "Owns packaging, artifacts, and deployment readiness."],
      ["Incident Scribe", "Writes clean timelines, statuses, and recovery notes."],
      ["QA Gatekeeper", "Runs checks before changes ship."],
      ["Cost Sentinel", "Flags hidden spend, sleep limits, and hosting traps."],
      ["Observability Lead", "Builds logs, metrics, and health panels."],
      ["Backup Planner", "Prepares rollback and recovery paths."],
      ["Runtime Tuner", "Improves performance and keeps noisy tools in check."],
      ["Owner Liaison", "Translates ops work into clear owner-facing updates."],
    ],
    agenda: [
      ["08:00", "Ops Chief reviews incidents, blockers, and queued changes."],
      ["10:00", "Infra Wrangler and Security Watch clear risky deploy items."],
      ["13:00", "Automation Builder and Runtime Tuner optimize repetitive work."],
      ["18:00", "Release Engineer and Incident Scribe publish the state of the system."],
    ],
    pipeline: [
      ["Triage", "New issues get routed to the right operator quickly."],
      ["Repair", "Fixes, scripts, and mitigations are applied with review loops."],
      ["Verify", "Health, config, and release checks confirm the outcome."],
      ["Communicate", "You get the outcome, risk, and next step in plain language."],
    ],
    surfaces: [
      ["Ops relay in Telegram", "You can approve and review from chat."],
      ["Hosted control panel", "Statuses, release gates, and environment notes stay visible."],
      ["Artifact trail", "Scripts, configs, and zip outputs are collected for reuse."],
    ],
  },
  "content-engine": {
    label: "Content Engine",
    cadence: "daily",
    routing:
      "The main bot briefs the team, creators draft in parallel, and one editor normalizes voice and quality before delivery.",
    roles: [
      ["Editorial Lead", "Owns the voice, strategy, and publishing priorities."],
      ["Campaign Planner", "Maps content to launch moments and distribution goals."],
      ["Landing Page Writer", "Writes headlines, sections, and conversion copy."],
      ["Social Builder", "Turns the campaign into short-form assets and hooks."],
      ["SEO Strategist", "Structures search-friendly topics and page architecture."],
      ["Visual Narrator", "Directs layout, visual rhythm, and creative references."],
      ["Proofreader", "Cleans up logic, grammar, and consistency issues."],
      ["Audience Researcher", "Finds pain points, language patterns, and objections."],
      ["Repurposing Agent", "Converts one core idea into many channels."],
      ["Offer Designer", "Shapes calls to action, lead magnets, and upsell hooks."],
      ["Metrics Watcher", "Tracks what content works and what to revise."],
      ["Release Curator", "Packages the campaign into neat deliverables."],
    ],
    agenda: [
      ["09:15", "Editorial Lead frames the campaign angle."],
      ["11:00", "Writers, SEO, and audience research align on message."],
      ["14:30", "Visual Narrator and Social Builder translate the concept into assets."],
      ["17:30", "Proofreader and Release Curator finalize the drop."],
    ],
    pipeline: [
      ["Campaign framing", "Audience, promise, and tone are defined."],
      ["Asset production", "Pages, posts, and content variants are generated."],
      ["Editorial review", "A final editor normalizes quality and consistency."],
      ["Distribution pack", "Content ships as a clean set of files and instructions."],
    ],
    surfaces: [
      ["Telegram approvals", "Quick yes/no feedback can happen in chat."],
      ["Content studio board", "The team dashboard shows drafts, versions, and channels."],
      ["Release zip", "The final asset pack is grouped for download or publishing."],
    ],
  },
};

const form = document.querySelector("#mission-form");
const missionInput = document.querySelector("#mission-input");
const modeSelect = document.querySelector("#mode-select");
const agentCountInput = document.querySelector("#agent-count");
const agentCountLabel = document.querySelector("#agent-count-label");
const websiteToggle = document.querySelector("#website-toggle");
const reviewToggle = document.querySelector("#review-toggle");
const zipToggle = document.querySelector("#zip-toggle");
const hostingToggle = document.querySelector("#hosting-toggle");
const modeBadge = document.querySelector("#mode-badge");
const heroCount = document.querySelector("#hero-count");
const heroCadence = document.querySelector("#hero-cadence");
const routingSummary = document.querySelector("#routing-summary");
const orbitNodes = document.querySelector("#orbit-nodes");
const agentGrid = document.querySelector("#agent-grid");
const agendaList = document.querySelector("#agenda-list");
const pipelineList = document.querySelector("#pipeline-list");
const surfaceStack = document.querySelector("#surface-stack");
const exportButton = document.querySelector("#export-json");

let currentSpec = null;

function makeAgent(roleEntry, index, mission) {
  const [role, purpose] = roleEntry;
  const color = colorPalette[index % colorPalette.length];
  const shortMission = mission.length > 84 ? `${mission.slice(0, 81)}...` : mission;

  return {
    id: `agent-${index + 1}`,
    role,
    color,
    purpose,
    handoff:
      index === 0
        ? "Feeds the coordinator with the first clean draft or system plan."
        : index % 3 === 0
          ? "Reviews upstream work and hardens it before final delivery."
          : "Passes artifacts back through the coordinator for merge and release.",
    output:
      index % 2 === 0
        ? `A concrete deliverable for: ${shortMission}`
        : "A reviewed improvement pack, checklist, or refinement set.",
  };
}

function buildSpec() {
  const config = modeConfigs[modeSelect.value];
  const count = Number(agentCountInput.value);
  const mission = missionInput.value.trim() || "Ship a standout product with a coordinated AI team.";
  const toggles = {
    buildsWeb: websiteToggle.checked,
    includesReviewer: reviewToggle.checked,
    packagesZip: zipToggle.checked,
    plansHosting: hostingToggle.checked,
  };
  const agents = config.roles.slice(0, count).map((roleEntry, index) => makeAgent(roleEntry, index, mission));

  return {
    mission,
    mode: config.label,
    cadence: config.cadence,
    toggles,
    routing: config.routing,
    agenda: config.agenda,
    pipeline: config.pipeline,
    surfaces: config.surfaces.map(([title, detail]) => ({ title, detail })),
    agents,
    createdAt: new Date().toISOString(),
  };
}

function renderOrbit(spec) {
  orbitNodes.innerHTML = "";
  spec.agents.forEach((agent, index) => {
    const node = document.createElement("div");
    const angle = ((Math.PI * 2) / spec.agents.length) * index - Math.PI / 2;
    const radius = index % 2 === 0 ? 210 : 145;
    node.className = "orbit-node";
    node.style.setProperty("--angle", `${angle}rad`);
    node.style.setProperty("--radius", `${radius}px`);
    node.innerHTML = `
      <div class="node-label">${agent.id}</div>
      <strong>${agent.role}</strong>
      <span>${agent.purpose}</span>
    `;
    orbitNodes.appendChild(node);
  });
}

function renderAgents(spec) {
  agentGrid.innerHTML = "";
  spec.agents.forEach((agent, index) => {
    const card = document.createElement("article");
    card.className = "agent-card";
    card.style.animationDelay = `${index * 55}ms`;
    card.innerHTML = `
      <div class="agent-card-header">
        <div>
          <div class="agent-chip">
            <span class="agent-color" style="background:${agent.color}"></span>
            ${agent.id}
          </div>
          <h3>${agent.role}</h3>
        </div>
      </div>
      <p>${agent.purpose}</p>
      <div class="agent-meta">
        <div>
          <strong>Output</strong>
          <span>${agent.output}</span>
        </div>
        <div>
          <strong>Handoff</strong>
          <span>${agent.handoff}</span>
        </div>
      </div>
    `;
    agentGrid.appendChild(card);
  });
}

function renderAgenda(spec) {
  agendaList.innerHTML = "";
  spec.agenda.forEach(([time, item]) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="agenda-time">${time}</span>
      <strong>${item}</strong>
    `;
    agendaList.appendChild(li);
  });
}

function renderPipeline(spec) {
  pipelineList.innerHTML = "";
  spec.pipeline.forEach(([title, detail], index) => {
    const card = document.createElement("article");
    card.className = "pipeline-step";
    card.innerHTML = `
      <strong>${index + 1}. ${title}</strong>
      <p>${detail}</p>
    `;
    pipelineList.appendChild(card);
  });
}

function renderSurfaces(spec) {
  const surfaces = [...spec.surfaces];

  if (!spec.toggles.buildsWeb) {
    surfaces[1] = {
      title: "Internal coordination only",
      detail: "The squad focuses on planning, writing, and system outputs instead of visual product delivery.",
    };
  }

  if (!spec.toggles.packagesZip) {
    surfaces.push({
      title: "Loose handoff",
      detail: "Artifacts stay in the workspace instead of getting packaged into a release zip.",
    });
  }

  if (!spec.toggles.plansHosting) {
    surfaces.push({
      title: "No hosting plan",
      detail: "The team stops at build output and does not prepare a deploy handoff.",
    });
  }

  surfaceStack.innerHTML = "";
  surfaces.forEach((surface) => {
    const card = document.createElement("article");
    card.className = "surface-item";
    card.innerHTML = `
      <strong>${surface.title}</strong>
      <p>${surface.detail}</p>
    `;
    surfaceStack.appendChild(card);
  });
}

function renderSpec() {
  currentSpec = buildSpec();
  heroCount.textContent = String(currentSpec.agents.length);
  heroCadence.textContent = currentSpec.cadence;
  agentCountLabel.textContent = `${currentSpec.agents.length} agents`;
  modeBadge.textContent = currentSpec.mode;
  routingSummary.textContent = currentSpec.routing;

  renderOrbit(currentSpec);
  renderAgents(currentSpec);
  renderAgenda(currentSpec);
  renderPipeline(currentSpec);
  renderSurfaces(currentSpec);
}

function exportSpec() {
  if (!currentSpec) {
    return;
  }

  const blob = new Blob([JSON.stringify(currentSpec, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "agent-team-spec.json";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  renderSpec();
});

[modeSelect, agentCountInput, websiteToggle, reviewToggle, zipToggle, hostingToggle].forEach((input) => {
  input.addEventListener("input", renderSpec);
  input.addEventListener("change", renderSpec);
});

missionInput.addEventListener("change", renderSpec);
exportButton.addEventListener("click", exportSpec);

renderSpec();
