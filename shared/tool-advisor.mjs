import { BRIDGE_VERSION, MCP_TOOLS } from './command-registry.mjs';

const KNOWN_CLIENTS = new Set(['all', 'claude-code', 'cursor', 'codex', 'vscode', 'windsurf', 'hermes', 'generic']);
const KNOWN_SURFACES = new Set(['cli', 'mcp', 'both']);
const KNOWN_RISK_TOLERANCES = new Set(['read-only', 'confirmed-interaction', 'private-read']);

const SCENARIOS = Object.freeze([
  {
    id: 'setup',
    patterns: [
      /\b(setup|install|configure|snippet|config|compatibility|mcp|doctor|extension path|tool list|which tool)\b/i,
    ],
    recommendedPreflight: ['doctor', 'mcp-config', 'command-catalog'],
    recommendedFirst: 'doctor',
    recommendedNext: ['mcp-config', 'command-catalog', 'session-summary'],
    prompts: ['chrome_bridge_release_smoke'],
    resources: [
      'chrome-bridge://docs/quickstart',
      'chrome-bridge://docs/compatibility',
      'chrome-bridge://profiles/current',
      'chrome-bridge://catalog/tools',
    ],
    notes: [
      'This workflow stays offline by default and does not require a live Chrome bridge.',
      'Use mcp-config for client setup and command-catalog for the exact local contract.',
    ],
    artifactGuidance: 'No artifact output needed for setup and compatibility guidance.',
    requiresLiveBridge: false,
  },
  {
    id: 'existing-tab',
    patterns: [
      /\b(already open|existing tab|current tab|focused tab|target tab open|adopt tab)\b/i,
    ],
    recommendedPreflight: ['health', 'workspace'],
    recommendedFirst: 'adoptTab',
    recommendedNext: ['group', 'observe', 'snapshot', 'findElements'],
    prompts: ['chrome_bridge_existing_tab', 'chrome_bridge_read_first'],
    resources: [
      'chrome-bridge://workflows/read-first',
      'chrome-bridge://docs/quickstart',
    ],
    notes: [
      'Ask the user to focus the correct Chrome tab before adoption.',
      'After adoption, verify scope before proposing any interaction.',
    ],
    artifactGuidance: 'Prefer metadata-first reads before saving screenshots or PDFs.',
    requiresConfirmation: true,
    requiresLiveBridge: true,
  },
  {
    id: 'debug',
    patterns: [
      /\b(debug|bug|error|broken|diagnostic|trace|network|console|slow|performance|lighthouse)\b/i,
    ],
    recommendedPreflight: ['health', 'session-summary'],
    recommendedFirst: 'diagnostics',
    recommendedNext: ['trace-summary', 'debug-bundle', 'lighthouse-ingest'],
    prompts: ['chrome_bridge_debug_page'],
    resources: [
      'chrome-bridge://workflows/debug-bundle',
      'chrome-bridge://docs/safety',
    ],
    notes: [
      'Prefer diagnostics and trace summary before collecting heavier local artifacts.',
      'Keep raw evidence local and summarized unless the user explicitly wants heavier artifacts.',
    ],
    artifactGuidance: 'Use debug-bundle for redacted local artifacts and lighthouse-ingest for existing reports.',
    requiresLiveBridge: true,
  },
  {
    id: 'download-export',
    patterns: [
      /\b(download|export|csv|xlsx|invoice|report|save as pdf)\b/i,
    ],
    recommendedPreflight: ['health', 'workspace'],
    recommendedFirst: 'download-discovery',
    recommendedNext: ['observe', 'findElements', 'pdf'],
    prompts: ['chrome_bridge_read_first', 'chrome_bridge_safe_interaction'],
    resources: [
      'chrome-bridge://workflows/read-first',
      'chrome-bridge://docs/safety',
    ],
    notes: [
      'The current stable path is read-only download discovery first, then a user-approved interaction if needed.',
      'If a printable export is enough, pdf is often safer than clicking unknown export controls.',
    ],
    artifactGuidance: 'Prefer download-discovery or pdf output instead of broad screenshots.',
    requiresLiveBridge: true,
  },
  {
    id: 'private-read',
    patterns: [
      /\b(cookie|cookies|storage|local storage|session storage|history|bookmark|request headers|credentialed request)\b/i,
    ],
    recommendedPreflight: ['health', 'workspace'],
    recommendedFirst: 'cookiesList',
    recommendedNext: ['storageSnapshot', 'historySearch', 'bookmarksSearch', 'fetchUrl'],
    prompts: ['chrome_bridge_safe_interaction'],
    resources: [
      'chrome-bridge://docs/safety',
      'chrome-bridge://profiles/current',
    ],
    notes: [
      'Private browser reads require explicit user approval.',
      'Some IDE profiles intentionally omit private-data tools until the user switches to full.',
    ],
    artifactGuidance: 'Keep private values out of inline output unless the user explicitly approved sensitive reads.',
    requiresConfirmation: true,
    requiresSensitiveConfirmation: true,
    requiresLiveBridge: true,
  },
  {
    id: 'interaction',
    patterns: [
      /\b(click|press|type|fill|submit|select|upload|dialog|login|log in)\b/i,
    ],
    recommendedPreflight: ['health', 'workspace'],
    recommendedFirst: 'observe',
    recommendedNext: ['findElements', 'click', 'type', 'fillForm'],
    prompts: ['chrome_bridge_safe_interaction', 'chrome_bridge_read_first'],
    resources: [
      'chrome-bridge://workflows/read-first',
      'chrome-bridge://docs/safety',
    ],
    notes: [
      'Inspect first, then propose the exact action to the user before mutation.',
      'After one interaction, read the page again before chaining additional actions.',
    ],
    artifactGuidance: 'Prefer observe/find-elements over screenshots for action selection.',
    requiresConfirmation: true,
    requiresLiveBridge: true,
  },
  {
    id: 'structured-extract',
    patterns: [
      /\b(extract|structured|pricing table|article|product page|form fields|forms|lists|key values|schema)\b/i,
    ],
    recommendedPreflight: ['health', 'workspace'],
    recommendedFirst: 'extract',
    recommendedNext: ['snapshot', 'text', 'observe'],
    prompts: ['chrome_bridge_extract_structured', 'chrome_bridge_read_first'],
    resources: [
      'chrome-bridge://workflows/read-first',
      'chrome-bridge://catalog/tools',
    ],
    notes: [
      'Prefer a preset when it matches the page type because it is cheaper and more repeatable.',
      'Use artifact paths when output might be large.',
    ],
    artifactGuidance: 'Use out or artifactDir for larger extraction payloads.',
    requiresLiveBridge: true,
  },
  {
    id: 'find-elements',
    patterns: [
      /\b(find|locate|which button|which link|selector|field|cta|input|element)\b/i,
    ],
    recommendedPreflight: ['health', 'workspace'],
    recommendedFirst: 'observe',
    recommendedNext: ['findElements', 'snapshot', 'html'],
    prompts: ['chrome_bridge_read_first'],
    resources: [
      'chrome-bridge://workflows/read-first',
      'chrome-bridge://catalog/tools',
    ],
    notes: [
      'Use observe for ranked actionable elements, then find-elements for narrower matching.',
      'This is usually cheaper than guessing a selector or falling back to screenshots.',
    ],
    artifactGuidance: 'No artifact needed unless page text must be kept locally.',
    requiresLiveBridge: true,
  },
  {
    id: 'read-first',
    patterns: [],
    recommendedPreflight: ['health', 'workspace'],
    recommendedFirst: 'snapshot',
    recommendedNext: ['observe', 'text', 'findElements', 'extract'],
    prompts: ['chrome_bridge_read_first'],
    resources: [
      'chrome-bridge://workflows/read-first',
      'chrome-bridge://docs/quickstart',
      'chrome-bridge://catalog/tools',
    ],
    notes: [
      'Default to read-first when the task is unclear or may mutate a real account.',
      'Snapshot and observe usually answer "what is on the page?" with less friction than generic screenshots.',
    ],
    artifactGuidance: 'Use artifacts only when page text or snapshots may exceed comfortable inline size.',
    requiresLiveBridge: true,
  },
]);

const COMMANDS = Object.freeze({
  health: {
    cli: 'chrome-bridge health',
    mcp: 'chrome_bridge_health',
    liveBridge: true,
  },
  workspace: {
    cli: 'chrome-bridge workspace',
    mcp: 'chrome_bridge_workspace',
    liveBridge: true,
  },
  doctor: {
    cli: 'chrome-bridge doctor',
    mcp: 'chrome_bridge_doctor',
    liveBridge: false,
  },
  'mcp-config': {
    cli: 'chrome-bridge mcp-config',
    mcp: 'chrome_bridge_mcp_config',
    liveBridge: false,
  },
  'command-catalog': {
    cli: 'chrome-bridge command-catalog',
    mcp: 'chrome_bridge_command_catalog',
    liveBridge: false,
  },
  'session-summary': {
    cli: 'chrome-bridge session-summary',
    mcp: 'chrome_bridge_session_summary',
    liveBridge: true,
  },
  group: {
    cli: 'chrome-bridge group --tabs',
    mcp: 'chrome_bridge_group',
    liveBridge: true,
  },
  observe: {
    cli: 'chrome-bridge observe --limit 30',
    mcp: 'chrome_bridge_observe',
    liveBridge: true,
  },
  findElements: {
    cli: 'chrome-bridge find-elements --limit 20',
    mcp: 'chrome_bridge_find_elements',
    liveBridge: true,
  },
  extract: {
    cli: 'chrome-bridge extract --kind all',
    mcp: 'chrome_bridge_extract',
    liveBridge: true,
  },
  snapshot: {
    cli: 'chrome-bridge snapshot --max-chars 60000',
    mcp: 'chrome_bridge_snapshot',
    liveBridge: true,
  },
  text: {
    cli: 'chrome-bridge text --max-chars 60000',
    mcp: 'chrome_bridge_text',
    liveBridge: true,
  },
  html: {
    cli: 'chrome-bridge html --max-chars 60000',
    mcp: 'chrome_bridge_html',
    liveBridge: true,
  },
  adoptTab: {
    cli: 'chrome-bridge adopt-tab --confirm',
    mcp: 'chrome_bridge_adopt_tab',
    liveBridge: true,
  },
  diagnostics: {
    cli: 'chrome-bridge diagnostics --out /tmp/chrome-bridge-diagnostics.json',
    mcp: 'chrome_bridge_diagnostics',
    liveBridge: true,
  },
  'trace-summary': {
    cli: 'chrome-bridge trace-summary',
    mcp: 'chrome_bridge_trace_summary',
    liveBridge: true,
  },
  'debug-bundle': {
    cli: 'chrome-bridge debug-bundle --out /tmp/chrome-bridge-debug',
    mcp: 'chrome_bridge_debug_bundle',
    liveBridge: true,
  },
  'lighthouse-ingest': {
    cli: 'chrome-bridge lighthouse-ingest --report /tmp/lighthouse.json',
    mcp: 'chrome_bridge_lighthouse_ingest',
    liveBridge: false,
  },
  'download-discovery': {
    cli: 'chrome-bridge download-discovery --out /tmp/chrome-bridge-downloads.json',
    mcp: 'chrome_bridge_download_discovery',
    liveBridge: true,
  },
  pdf: {
    cli: 'chrome-bridge pdf --out /tmp/chrome-bridge.pdf',
    mcp: 'chrome_bridge_pdf',
    liveBridge: true,
  },
  click: {
    cli: 'chrome-bridge click --selector "<css>" --confirm',
    mcp: 'chrome_bridge_click',
    liveBridge: true,
  },
  type: {
    cli: 'chrome-bridge type --selector "<css>" --text "<text>" --confirm',
    mcp: 'chrome_bridge_type',
    liveBridge: true,
  },
  fillForm: {
    cli: 'chrome-bridge fill-form --fields-json "<json>" --confirm',
    mcp: 'chrome_bridge_fill_form',
    liveBridge: true,
  },
  cookiesList: {
    cli: 'chrome-bridge cookies --url "https://example.com" --confirm --confirm-sensitive',
    mcp: 'chrome_bridge_cookies_list',
    liveBridge: true,
  },
  storageSnapshot: {
    cli: 'chrome-bridge storage --confirm --include-values --confirm-sensitive',
    mcp: 'chrome_bridge_storage_snapshot',
    liveBridge: true,
  },
  historySearch: {
    cli: 'chrome-bridge history --confirm --query "<text>"',
    mcp: 'chrome_bridge_history_search',
    liveBridge: true,
  },
  bookmarksSearch: {
    cli: 'chrome-bridge bookmarks --confirm --query "<text>"',
    mcp: 'chrome_bridge_bookmarks_search',
    liveBridge: true,
  },
  fetchUrl: {
    cli: 'chrome-bridge request "https://example.com" --confirm --credentials include --confirm-sensitive',
    mcp: 'chrome_bridge_request',
    liveBridge: true,
  },
});

function normalized(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeSurface(value) {
  const normalizedValue = String(value || 'both').toLowerCase();
  return KNOWN_SURFACES.has(normalizedValue) ? normalizedValue : 'both';
}

function normalizeRiskTolerance(value) {
  const normalizedValue = String(value || 'read-only').toLowerCase();
  return KNOWN_RISK_TOLERANCES.has(normalizedValue) ? normalizedValue : 'read-only';
}

function normalizeClient(value) {
  if (!value) return null;
  const normalizedValue = String(value).toLowerCase();
  return KNOWN_CLIENTS.has(normalizedValue) ? normalizedValue : normalizedValue;
}

function normalizeAvailableMcpTools(value) {
  if (!Array.isArray(value) || !value.length) return [...MCP_TOOLS];
  return value.filter((entry) => typeof entry === 'string');
}

function scenarioScore(scenario, normalizedTask) {
  return scenario.patterns.reduce((score, pattern) => score + (pattern.test(normalizedTask) ? 1 : 0), 0);
}

function pickScenario(normalizedTask) {
  let bestScenario = SCENARIOS[SCENARIOS.length - 1];
  let bestScore = -1;
  for (const scenario of SCENARIOS) {
    const score = scenarioScore(scenario, normalizedTask);
    if (score > bestScore) {
      bestScenario = scenario;
      bestScore = score;
    }
  }
  return bestScenario;
}

function commandEntry(id) {
  return COMMANDS[id] || null;
}

function commandRef(id) {
  const entry = commandEntry(id);
  if (!entry) return null;
  return {
    id,
    cli: entry.cli,
    mcp: entry.mcp,
    liveBridge: entry.liveBridge,
  };
}

function refs(ids) {
  return ids.map((id) => commandRef(id)).filter(Boolean);
}

function profileNotes({ scenario, surface, client, mcpProfile, availableMcpTools }) {
  const notes = [];
  if (surface !== 'cli') {
    notes.push(`Current MCP profile: ${mcpProfile}.`);
  }
  if (client === 'cursor' || client === 'windsurf') {
    notes.push('Cursor and Windsurf usually start with the compact core MCP profile.');
  }
  if (scenario.id === 'private-read' && surface !== 'cli') {
    const privateTool = commandEntry('cookiesList')?.mcp;
    if (privateTool && !availableMcpTools.includes(privateTool)) {
      notes.push('Private browser-data tools are not available in the current MCP profile; switch to full if the user explicitly wants sensitive reads.');
    }
  }
  return notes;
}

function toolsToAvoid({ scenario, riskTolerance }) {
  const avoided = new Set();
  if (riskTolerance === 'read-only') {
    ['click', 'type', 'fillForm', 'cookiesList', 'storageSnapshot', 'fetchUrl'].forEach((id) => avoided.add(id));
  }
  if (scenario.id !== 'private-read') {
    ['cookiesList', 'storageSnapshot', 'fetchUrl'].forEach((id) => avoided.add(id));
  }
  if (scenario.id !== 'debug') {
    avoided.add('debug-bundle');
  }
  return refs([...avoided]);
}

function confirmationNotes(scenario) {
  const confirmations = [];
  if (scenario.requiresConfirmation) {
    confirmations.push('confirmed=true is required before the recommended mutation or private-data step.');
  }
  if (scenario.requiresSensitiveConfirmation) {
    confirmations.push('confirmSensitive=true is also required because the workflow can expose private browser data.');
  }
  if (!scenario.requiresConfirmation && !scenario.requiresSensitiveConfirmation) {
    confirmations.push('Start with read-only tools first; no confirmation is needed for the initial recommendation.');
  }
  return confirmations;
}

function exampleCalls(id, surface) {
  const entry = commandEntry(id);
  if (!entry) return null;
  if (surface === 'cli') {
    return entry.cli;
  }
  if (surface === 'mcp') {
    return {
      tool: entry.mcp,
      arguments: {},
    };
  }
  return {
    cli: entry.cli,
    mcp: {
      tool: entry.mcp,
      arguments: {},
    },
  };
}

export function buildToolAdvisor(input = {}) {
  const task = normalized(input.task, '');
  if (!task) {
    throw new Error('tool advisor requires a non-empty task');
  }

  const surface = normalizeSurface(input.surface);
  const riskTolerance = normalizeRiskTolerance(input.riskTolerance);
  const client = normalizeClient(input.client);
  const hasLiveBridge = input.hasLiveBridge === undefined ? null : Boolean(input.hasLiveBridge);
  const mcpProfile = String(input.mcpProfile || 'full').toLowerCase();
  const availableMcpTools = normalizeAvailableMcpTools(input.availableMcpTools);
  const normalizedTask = task.toLowerCase();
  const scenario = pickScenario(normalizedTask);
  const first = commandRef(scenario.recommendedFirst);
  const preflight = refs(scenario.recommendedPreflight);
  const next = refs(scenario.recommendedNext);
  const notes = [
    ...scenario.notes,
    ...profileNotes({ scenario, surface, client, mcpProfile, availableMcpTools }),
  ];

  if (scenario.requiresLiveBridge && hasLiveBridge === false) {
    notes.push('The recommended browser tools need the live bridge and extension connection; use doctor, mcp-config, or command-catalog until the bridge is free.');
  }
  if (scenario.id === 'download-export') {
    notes.push('Confirmed download-manager execution is still a planned follow-up; the safest current tool is download-discovery.');
  }

  return {
    ok: true,
    version: BRIDGE_VERSION,
    generatedAt: new Date().toISOString(),
    task,
    normalizedTask,
    matchedScenario: scenario.id,
    surface,
    riskTolerance,
    client,
    hasLiveBridge,
    mcpProfile,
    availableMcpToolCount: availableMcpTools.length,
    recommendedPreflight: preflight,
    recommendedFirstTool: first,
    recommendedNextTools: next,
    requiredConfirmations: confirmationNotes(scenario),
    toolsToAvoid: toolsToAvoid({ scenario, riskTolerance }),
    prompts: [...scenario.prompts],
    resources: [...scenario.resources],
    artifactGuidance: scenario.artifactGuidance,
    exampleFirstCall: exampleCalls(scenario.recommendedFirst, surface),
    notes,
  };
}
