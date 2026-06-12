export const BRIDGE_VERSION = '0.4.1';

export const MANIFEST_PERMISSIONS = [
  'activeTab',
  'alarms',
  'bookmarks',
  'cookies',
  'debugger',
  'history',
  'offscreen',
  'scripting',
  'storage',
  'tabGroups',
  'tabs',
];

export const TAB_GROUP_COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
export const GROUP_SCOPE_KEYS = ['groupTitle', 'groupColor'];
export const TARGET_KEYS = ['tabId', 'allowExternal', ...GROUP_SCOPE_KEYS];
export const CONFIRMATION_KEYS = ['confirmed', 'confirmSensitive'];

const base = [...TARGET_KEYS];
const confirmed = [...TARGET_KEYS, 'confirmed'];
const sensitiveConfirmed = [...TARGET_KEYS, ...CONFIRMATION_KEYS];
const stringSelector = [...base, 'selector'];
const maxChars = [...base, 'maxChars'];

function freezeSchemaMap(schemas) {
  return Object.freeze(Object.fromEntries(
    Object.entries(schemas).map(([action, keys]) => [action, Object.freeze([...keys])]),
  ));
}

export const COMMAND_PAYLOAD_SCHEMAS = freezeSchemaMap({
  windows: ['includeAll', 'groupTitle', 'groupColor', 'confirmed'],
  tabs: ['includeAll', 'groupTitle', 'groupColor', 'confirmed'],
  group: ['includeTabs', 'groupTitle', 'groupColor'],
  workspace: ['includeTabs'],
  setWorkspace: ['name', 'groupTitle', 'groupColor', 'policyMode', 'confirmed'],
  clearWorkspace: ['confirmed'],
  ensureTab: ['url', 'active', 'groupTitle', 'groupColor'],
  adoptTab: ['tabId', 'confirmed', 'groupTitle', 'groupColor'],
  open: [...base, 'url', 'active', 'newTab'],
  activateTab: [...base, 'focusWindow'],
  closeTab: confirmed,
  closeGroup: ['confirmed', 'groupTitle', 'groupColor'],
  goBack: [...base, 'timeoutMs'],
  goForward: [...base, 'timeoutMs'],
  reloadTab: [...base, 'bypassCache', 'timeoutMs'],
  waitForSelector: [...stringSelector, 'timeoutMs', 'visible'],
  observe: [...base, 'limit', 'maxTextChars', 'role', 'text', 'nearText', 'placeholder', 'href', 'actionKind', 'risk'],
  findElements: [...base, 'limit', 'maxTextChars', 'role', 'text', 'nearText', 'placeholder', 'href', 'actionKind', 'risk'],
  extractPage: [...base, 'kind', 'maxItems', 'maxTextChars'],
  snapshot: [...maxChars, 'fullPage', 'waitForText', 'waitForPattern', 'scrollStepPx', 'maxScrollSteps', 'scrollDelayMs'],
  text: [...maxChars, 'fullPage', 'waitForText', 'waitForPattern', 'scrollStepPx', 'maxScrollSteps', 'scrollDelayMs'],
  html: [...maxChars, 'selector', 'outer'],
  diagnostics: base,
  screenshot: [...base, 'fullPage', 'selector', 'maxPixels', 'fallback'],
  printPdf: [...base, 'landscape', 'printBackground', 'preferCssPageSize', 'pageRanges', 'scale'],
  listSelectOptions: stringSelector,
  scroll: [...base, 'x', 'y'],
  click: [...confirmed, 'selector'],
  clickAt: [...confirmed, 'x', 'y', 'button', 'trusted'],
  hover: [...base, 'selector', 'x', 'y', 'trusted'],
  type: [...confirmed, 'selector', 'text', 'trusted'],
  press: [...confirmed, 'selector', 'key', 'code', 'ctrlKey', 'metaKey', 'altKey', 'shiftKey', 'trusted'],
  select: [...confirmed, 'selector', 'value', 'label', 'index'],
  fillForm: [...confirmed, 'fields', 'dryRun'],
  handleDialog: [...confirmed, 'accept', 'promptText'],
  uploadFile: [...confirmed, 'selector', 'file', 'files'],
  traceStart: [...confirmed, 'maxEvents', 'network', 'console', 'includeExtensionEvents'],
  traceSummary: base,
  traceEvents: [...base, 'limit'],
  traceStop: [...base, 'limit'],
  historySearch: ['query', 'limit', 'startTime', 'endTime', 'confirmed'],
  bookmarksSearch: ['query', 'limit', 'confirmed'],
  cookiesList: ['url', 'domain', 'name', 'limit', 'includeValues', 'confirmed', 'confirmSensitive'],
  storageSnapshot: [...sensitiveConfirmed, 'includeValues', 'maxValueChars'],
  fetchUrl: ['url', 'method', 'headers', 'body', 'credentials', 'maxChars', 'requestTimeoutMs', 'confirmed', 'confirmSensitive'],
  askUser: ['question', 'choices', 'allowText', 'closeOnAnswer', 'timeoutMs'],
  reloadExtension: ['confirmed'],
});

export const EXTENSION_ACTIONS = Object.freeze(Object.keys(COMMAND_PAYLOAD_SCHEMAS));

export const DEBUGGER_SERIALIZED_ACTIONS = Object.freeze([
  'screenshot',
  'printPdf',
  'clickAt',
  'hover',
  'type',
  'press',
  'handleDialog',
  'uploadFile',
  'traceStart',
  'traceStop',
]);

const PRIVATE_READ_ACTIONS = new Set([
  'historySearch',
  'bookmarksSearch',
  'cookiesList',
  'storageSnapshot',
  'fetchUrl',
]);

export const HTTP_METHODS = Object.freeze([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
]);

const HTTP_METHOD_SET = new Set(HTTP_METHODS);
const PAYLOAD_TIMEOUT_MIN_MS = 0;
const PAYLOAD_TIMEOUT_MAX_MS = 300_000;

const INTERACTION_ACTIONS = new Set([
  'adoptTab',
  'open',
  'activateTab',
  'closeTab',
  'closeGroup',
  'goBack',
  'goForward',
  'reloadTab',
  'scroll',
  'click',
  'clickAt',
  'hover',
  'type',
  'press',
  'select',
  'fillForm',
  'handleDialog',
  'uploadFile',
]);

const SYSTEM_ACTIONS = new Set([
  'ensureTab',
  'setWorkspace',
  'clearWorkspace',
  'traceStart',
  'traceStop',
  'askUser',
  'reloadExtension',
]);

export const ACTION_DEFAULT_TIMEOUT_MS = Object.freeze({
  reloadExtension: 5_000,
  windows: 10_000,
  tabs: 10_000,
  group: 10_000,
  workspace: 10_000,
  setWorkspace: 10_000,
  clearWorkspace: 10_000,
  activateTab: 10_000,
  closeTab: 10_000,
  closeGroup: 10_000,
  scroll: 10_000,
  askUser: 305_000,
  screenshot: 30_000,
  printPdf: 60_000,
  fetchUrl: 60_000,
  uploadFile: 60_000,
});

export function commandRiskTier(action) {
  if (PRIVATE_READ_ACTIONS.has(action)) return 'private-read';
  if (INTERACTION_ACTIONS.has(action)) return 'interaction';
  if (SYSTEM_ACTIONS.has(action)) return 'system';
  return 'read';
}

export function commandDefaultTimeoutMs(action) {
  return ACTION_DEFAULT_TIMEOUT_MS[action] || 30_000;
}

const ACTION_DOCS = Object.freeze({
  windows: {
    category: 'scope',
    summary: 'List Chrome windows, scoped to the configured bridge group by default; includeAll requires confirmation.',
    cli: ['windows'],
    mcp: ['chrome_bridge_windows'],
    requiresConditionalConfirmation: true,
  },
  tabs: {
    category: 'scope',
    summary: 'List Chrome tabs, scoped to the configured bridge group by default; includeAll requires confirmation.',
    cli: ['tabs'],
    mcp: ['chrome_bridge_tabs'],
    requiresConditionalConfirmation: true,
  },
  group: {
    category: 'scope',
    summary: 'Show the current scoped Chrome tab group and its tabs.',
    cli: ['group'],
    mcp: ['chrome_bridge_group'],
  },
  workspace: {
    category: 'scope',
    summary: 'Show local workspace defaults, policy mode, and scoped group counts.',
    cli: ['workspace'],
    mcp: ['chrome_bridge_workspace'],
  },
  setWorkspace: {
    category: 'scope',
    summary: 'Set local workspace group title, color, and scoped/strict policy defaults.',
    cli: ['set-workspace'],
    mcp: ['chrome_bridge_set_workspace'],
    requiresConfirmation: true,
  },
  clearWorkspace: {
    category: 'scope',
    summary: 'Clear local workspace defaults and return to the default group policy.',
    cli: ['clear-workspace'],
    mcp: ['chrome_bridge_clear_workspace'],
    requiresConfirmation: true,
  },
  ensureTab: {
    category: 'navigation',
    summary: 'Create or recover the dedicated scoped Chrome work tab.',
    cli: ['ensure-tab'],
    mcp: ['chrome_bridge_ensure_tab'],
  },
  adoptTab: {
    category: 'navigation',
    summary: 'Adopt an already-open Chrome tab into the scoped bridge group.',
    cli: ['adopt-tab'],
    mcp: ['chrome_bridge_adopt_tab'],
    requiresConfirmation: true,
  },
  open: {
    category: 'navigation',
    summary: 'Open a URL in the scoped bridge tab or a new grouped tab.',
    cli: ['open'],
    mcp: ['chrome_bridge_open'],
  },
  activateTab: {
    category: 'navigation',
    summary: 'Activate a scoped tab and optionally focus its window.',
    cli: ['activate'],
    mcp: ['chrome_bridge_activate_tab'],
  },
  closeTab: {
    category: 'navigation',
    summary: 'Close one scoped tab.',
    cli: ['close-tab'],
    mcp: ['chrome_bridge_close_tab'],
    requiresConfirmation: true,
  },
  closeGroup: {
    category: 'navigation',
    summary: 'Close all tabs in the scoped bridge group.',
    cli: ['close-group'],
    mcp: ['chrome_bridge_close_group'],
    requiresConfirmation: true,
  },
  goBack: {
    category: 'navigation',
    summary: 'Navigate the selected tab backward.',
    cli: ['back'],
    mcp: ['chrome_bridge_back'],
  },
  goForward: {
    category: 'navigation',
    summary: 'Navigate the selected tab forward.',
    cli: ['forward'],
    mcp: ['chrome_bridge_forward'],
  },
  reloadTab: {
    category: 'navigation',
    summary: 'Reload the selected tab.',
    cli: ['reload'],
    mcp: ['chrome_bridge_reload_tab'],
  },
  waitForSelector: {
    category: 'read',
    summary: 'Wait for a selector to appear in the selected tab.',
    cli: ['wait'],
    mcp: ['chrome_bridge_wait_for_selector'],
  },
  observe: {
    category: 'read',
    summary: 'Read ranked actionable elements with querySelector-verified selectors without mutating page state.',
    cli: ['observe'],
    mcp: ['chrome_bridge_observe'],
  },
  findElements: {
    category: 'read',
    summary: 'Filter ranked actionable elements with querySelector-verified selectors by role, text, nearby text, href, action, or risk.',
    cli: ['find-elements'],
    mcp: ['chrome_bridge_find_elements'],
  },
  extractPage: {
    category: 'read',
    summary: 'Extract structured tables, form structure, lists, key-value blocks, or artifact-backed CPA offer presets without current form values.',
    cli: ['extract'],
    mcp: ['chrome_bridge_extract'],
  },
  snapshot: {
    category: 'read',
    summary: 'Read a bounded structured page snapshot with optional full-page rendered text coverage.',
    cli: ['snapshot'],
    mcp: ['chrome_bridge_snapshot'],
  },
  text: {
    category: 'read',
    summary: 'Read bounded visible page text with optional full-page scroll-walk coverage.',
    cli: ['text'],
    mcp: ['chrome_bridge_text'],
  },
  html: {
    category: 'read',
    summary: 'Read bounded page HTML for a selector or the whole document.',
    cli: ['html'],
    mcp: ['chrome_bridge_html'],
  },
  screenshot: {
    category: 'artifact',
    summary: 'Capture a PNG screenshot of the selected tab, full page, or selector.',
    cli: ['screenshot'],
    mcp: ['chrome_bridge_screenshot'],
  },
  printPdf: {
    category: 'artifact',
    summary: 'Print the selected tab to a local PDF artifact.',
    cli: ['pdf'],
    mcp: ['chrome_bridge_pdf'],
  },
  listSelectOptions: {
    category: 'read',
    summary: 'Read available select options without returning current selection state.',
    cli: ['select-options'],
    mcp: ['chrome_bridge_select_options'],
  },
  scroll: {
    category: 'interaction',
    summary: 'Scroll the selected tab.',
    cli: ['scroll'],
    mcp: ['chrome_bridge_scroll'],
  },
  click: {
    category: 'interaction',
    summary: 'Click a selector in the selected tab.',
    cli: ['click'],
    mcp: ['chrome_bridge_click'],
    requiresConfirmation: true,
  },
  clickAt: {
    category: 'interaction',
    summary: 'Click viewport coordinates, optionally through trusted debugger input.',
    cli: ['click-at'],
    mcp: ['chrome_bridge_click_at'],
    requiresConfirmation: true,
  },
  hover: {
    category: 'interaction',
    summary: 'Hover an element or coordinates in the selected tab.',
    cli: ['hover'],
    mcp: ['chrome_bridge_hover'],
  },
  type: {
    category: 'interaction',
    summary: 'Type text into a selector, optionally through trusted debugger input.',
    cli: ['type'],
    mcp: ['chrome_bridge_type'],
    requiresConfirmation: true,
  },
  press: {
    category: 'interaction',
    summary: 'Press a keyboard key, optionally through trusted debugger input.',
    cli: ['press'],
    mcp: ['chrome_bridge_press'],
    requiresConfirmation: true,
  },
  select: {
    category: 'interaction',
    summary: 'Select an option in a select element.',
    cli: ['select'],
    mcp: ['chrome_bridge_select'],
    requiresConfirmation: true,
  },
  fillForm: {
    category: 'interaction',
    summary: 'Preview or apply field values without submitting or returning raw field values.',
    cli: ['fill-form'],
    mcp: ['chrome_bridge_fill_form'],
    requiresConfirmation: true,
  },
  handleDialog: {
    category: 'interaction',
    summary: 'Accept or dismiss the currently open JavaScript dialog.',
    cli: ['handle-dialog'],
    mcp: ['chrome_bridge_handle_dialog'],
    requiresConfirmation: true,
  },
  uploadFile: {
    category: 'interaction',
    summary: 'Set local files on a file input through Chrome Debugger.',
    cli: ['upload-file'],
    mcp: ['chrome_bridge_upload_file'],
    requiresConfirmation: true,
  },
  traceStart: {
    category: 'debug',
    summary: 'Start bounded console and network metadata tracing.',
    cli: ['trace-start'],
    mcp: ['chrome_bridge_trace_start'],
    requiresConfirmation: true,
  },
  traceSummary: {
    category: 'debug',
    summary: 'Read trace session metadata without returning the trace event log.',
    cli: ['trace-summary'],
    mcp: ['chrome_bridge_trace_summary'],
  },
  traceEvents: {
    category: 'debug',
    summary: 'Read recent bounded trace events.',
    cli: ['trace-events'],
    mcp: ['chrome_bridge_trace_events'],
  },
  diagnostics: {
    category: 'debug',
    summary: 'Read bounded page, trace, network-count, resource, and performance diagnostics without raw event logs.',
    cli: ['diagnostics'],
    mcp: ['chrome_bridge_diagnostics'],
  },
  traceStop: {
    category: 'debug',
    summary: 'Stop tracing and return recent events.',
    cli: ['trace-stop'],
    mcp: ['chrome_bridge_trace_stop'],
  },
  historySearch: {
    category: 'private-read',
    summary: 'Search Chrome history with explicit confirmation.',
    cli: ['history'],
    mcp: ['chrome_bridge_history_search'],
    requiresConfirmation: true,
  },
  bookmarksSearch: {
    category: 'private-read',
    summary: 'Search Chrome bookmarks with explicit confirmation.',
    cli: ['bookmarks'],
    mcp: ['chrome_bridge_bookmarks_search'],
    requiresConfirmation: true,
  },
  cookiesList: {
    category: 'private-read',
    summary: 'List Chrome cookie metadata; values require sensitive confirmation.',
    cli: ['cookies'],
    mcp: ['chrome_bridge_cookies_list'],
    requiresConfirmation: true,
    requiresSensitiveConfirmation: true,
  },
  storageSnapshot: {
    category: 'private-read',
    summary: 'Read page storage keys; values require sensitive confirmation.',
    cli: ['storage'],
    mcp: ['chrome_bridge_storage_snapshot'],
    requiresConfirmation: true,
    requiresSensitiveConfirmation: true,
  },
  fetchUrl: {
    category: 'private-read',
    summary: 'Run a bounded extension-context request; credentials require sensitive confirmation.',
    cli: ['request'],
    mcp: ['chrome_bridge_request'],
    requiresConfirmation: true,
    requiresSensitiveConfirmation: true,
  },
  askUser: {
    category: 'human',
    summary: 'Open a local prompt tab and wait for a user answer.',
    cli: ['ask'],
    mcp: ['chrome_bridge_ask_user'],
  },
  reloadExtension: {
    category: 'system',
    summary: 'Ask the unpacked extension to reload itself after local file edits; requires confirmation.',
    cli: ['reload-extension'],
    mcp: ['chrome_bridge_reload_extension'],
    requiresConfirmation: true,
  },
});

export const COMMAND_METADATA = Object.freeze(Object.fromEntries(
  EXTENSION_ACTIONS.map((action) => [action, Object.freeze({
    action,
    allowedKeys: COMMAND_PAYLOAD_SCHEMAS[action],
    riskTier: commandRiskTier(action),
    defaultTimeoutMs: commandDefaultTimeoutMs(action),
    category: ACTION_DOCS[action]?.category || 'uncategorized',
    summary: ACTION_DOCS[action]?.summary || '',
    cli: Object.freeze([...(ACTION_DOCS[action]?.cli || [])]),
    mcp: Object.freeze([...(ACTION_DOCS[action]?.mcp || [])]),
    requiresConfirmation: Boolean(ACTION_DOCS[action]?.requiresConfirmation),
    requiresConditionalConfirmation: Boolean(ACTION_DOCS[action]?.requiresConditionalConfirmation),
    requiresSensitiveConfirmation: Boolean(ACTION_DOCS[action]?.requiresSensitiveConfirmation),
  })]),
));

export const COMMAND_CATALOG = Object.freeze(EXTENSION_ACTIONS.map((action) => COMMAND_METADATA[action]));

const LOCAL_COMMAND_DOCS = Object.freeze({
  server: {
    category: 'service',
    riskTier: 'system',
    defaultTimeoutMs: null,
    summary: 'Start the local Chrome Bridge HTTP/WebSocket server.',
    cli: ['server'],
    mcp: [],
    usesLiveBridge: false,
  },
  health: {
    category: 'diagnostic',
    riskTier: 'read',
    defaultTimeoutMs: 10_000,
    summary: 'Read local bridge health and extension connection status.',
    cli: ['health'],
    mcp: ['chrome_bridge_health'],
    usesLiveBridge: true,
  },
  status: {
    category: 'diagnostic',
    riskTier: 'read',
    defaultTimeoutMs: 30_000,
    summary: 'Print cheap-first bridge status and token-budget recommendations.',
    cli: ['status'],
    mcp: [],
    usesLiveBridge: true,
  },
  'session-summary': {
    category: 'diagnostic',
    riskTier: 'read',
    defaultTimeoutMs: 30_000,
    summary: 'Summarize bridge health, workspace policy, scoped group state, and recommendations.',
    cli: ['session-summary'],
    mcp: ['chrome_bridge_session_summary'],
    usesLiveBridge: true,
  },
  'debug-bundle': {
    category: 'debug',
    riskTier: 'read',
    defaultTimeoutMs: 60_000,
    summary: 'Write a redacted local debug bundle with page artifacts and full trace events omitted unless requested.',
    cli: ['debug-bundle'],
    mcp: ['chrome_bridge_debug_bundle'],
    usesLiveBridge: true,
  },
  'with-temp-tab': {
    category: 'navigation',
    riskTier: 'interaction',
    defaultTimeoutMs: 120_000,
    summary: 'Open a run-owned temporary scoped tab, run a bounded read command, and clean up the tab automatically.',
    cli: ['with-temp-tab'],
    mcp: [],
    usesLiveBridge: true,
  },
  'cleanup-run-tabs': {
    category: 'navigation',
    riskTier: 'interaction',
    defaultTimeoutMs: 30_000,
    summary: 'Close tabs recorded as owned by a run id and remove them from local run state.',
    cli: ['cleanup-run-tabs'],
    mcp: [],
    usesLiveBridge: true,
  },
  'last-artifact': {
    category: 'artifact',
    riskTier: 'read',
    defaultTimeoutMs: 5_000,
    summary: 'Print metadata for the latest artifact recorded by metadata-first read outputs.',
    cli: ['last-artifact'],
    mcp: [],
    usesLiveBridge: false,
  },
  'read-artifact': {
    category: 'artifact',
    riskTier: 'read',
    defaultTimeoutMs: 5_000,
    summary: 'Read a small head and grep slice from a local artifact without dumping the full file.',
    cli: ['read-artifact'],
    mcp: [],
    usesLiveBridge: false,
  },
  'grep-page': {
    category: 'read',
    riskTier: 'read',
    defaultTimeoutMs: 30_000,
    summary: 'Read page text into an artifact and print regex-matching snippets only.',
    cli: ['grep-page'],
    mcp: [],
    usesLiveBridge: true,
  },
  links: {
    category: 'read',
    riskTier: 'read',
    defaultTimeoutMs: 30_000,
    summary: 'Read selector HTML into an artifact and print extracted links only.',
    cli: ['links'],
    mcp: [],
    usesLiveBridge: true,
  },
  tables: {
    category: 'read',
    riskTier: 'read',
    defaultTimeoutMs: 30_000,
    summary: 'Read selector HTML into an artifact and print extracted tables only.',
    cli: ['tables'],
    mcp: [],
    usesLiveBridge: true,
  },
  'download-discovery': {
    category: 'read',
    riskTier: 'read',
    defaultTimeoutMs: 30_000,
    summary: 'Discover download and offline-export candidates without clicking or fetching candidate URLs.',
    cli: ['download-discovery'],
    mcp: ['chrome_bridge_download_discovery'],
    usesLiveBridge: true,
  },
  'act-preview': {
    category: 'read',
    riskTier: 'read',
    defaultTimeoutMs: 30_000,
    summary: 'Plan one likely next browser action from intent and observed page state without mutating the page.',
    cli: ['act-preview'],
    mcp: ['chrome_bridge_act_preview'],
    usesLiveBridge: true,
  },
  'lighthouse-ingest': {
    category: 'diagnostic',
    riskTier: 'read',
    defaultTimeoutMs: 5_000,
    summary: 'Summarize a local Lighthouse JSON report into scores and failing audits.',
    cli: ['lighthouse-ingest'],
    mcp: ['chrome_bridge_lighthouse_ingest'],
    usesLiveBridge: false,
  },
  'command-catalog': {
    category: 'diagnostic',
    riskTier: 'read',
    defaultTimeoutMs: 5_000,
    summary: 'Print this shared command registry as JSON or Markdown.',
    cli: ['command-catalog'],
    mcp: ['chrome_bridge_command_catalog'],
    usesLiveBridge: false,
  },
  advise: {
    category: 'diagnostic',
    riskTier: 'read',
    defaultTimeoutMs: 5_000,
    summary: 'Recommend the safest next CLI and MCP tools for a task without contacting Chrome.',
    cli: ['advise'],
    mcp: ['chrome_bridge_tool_advisor'],
    usesLiveBridge: false,
  },
  'mcp-config': {
    category: 'diagnostic',
    riskTier: 'read',
    defaultTimeoutMs: 5_000,
    summary: 'Print MCP client configuration snippets for Claude Code, Cursor, Codex, VS Code, Windsurf, Hermes, or generic stdio clients.',
    cli: ['mcp-config'],
    mcp: ['chrome_bridge_mcp_config'],
    usesLiveBridge: false,
  },
  'mcp-write': {
    category: 'diagnostic',
    riskTier: 'read',
    defaultTimeoutMs: 5_000,
    summary: 'Write or merge a project-local MCP client config file, or render one to an explicit path without touching user-global config by default.',
    cli: ['mcp-write'],
    mcp: [],
    usesLiveBridge: false,
  },
  'self-test': {
    category: 'verification',
    riskTier: 'read',
    defaultTimeoutMs: 10_000,
    summary: 'Run static project parity checks without touching Chrome.',
    cli: ['self-test'],
    mcp: ['chrome_bridge_self_test'],
    usesLiveBridge: false,
  },
  'runtime-smoke': {
    category: 'verification',
    riskTier: 'interaction',
    defaultTimeoutMs: 180_000,
    summary: 'Run the real-browser fixture smoke test against the live bridge.',
    cli: ['runtime-smoke'],
    mcp: ['chrome_bridge_runtime_smoke'],
    usesLiveBridge: true,
  },
  doctor: {
    category: 'diagnostic',
    riskTier: 'read',
    defaultTimeoutMs: 10_000,
    summary: 'Inspect local installation paths offline; pass --live-checks to probe bridge health and Chrome settings.',
    cli: ['doctor'],
    mcp: ['chrome_bridge_doctor'],
    liveBridge: 'optional',
    usesLiveBridge: false,
  },
  'extension-path': {
    category: 'diagnostic',
    riskTier: 'read',
    defaultTimeoutMs: 5_000,
    summary: 'Print the unpacked extension directory path.',
    cli: ['extension-path'],
    mcp: ['chrome_bridge_extension_path'],
    usesLiveBridge: false,
  },
  'codex-config': {
    category: 'diagnostic',
    riskTier: 'read',
    defaultTimeoutMs: 5_000,
    summary: 'Print the legacy Codex MCP configuration snippet using the current Node executable.',
    cli: ['codex-config'],
    mcp: ['chrome_bridge_codex_config'],
    usesLiveBridge: false,
  },
});

export const LOCAL_COMMAND_METADATA = Object.freeze(Object.fromEntries(
  Object.entries(LOCAL_COMMAND_DOCS).map(([id, doc]) => [id, Object.freeze({
    id,
    category: doc.category,
    riskTier: doc.riskTier,
    defaultTimeoutMs: doc.defaultTimeoutMs,
    summary: doc.summary,
    cli: Object.freeze([...doc.cli]),
    mcp: Object.freeze([...doc.mcp]),
    liveBridge: doc.liveBridge || (doc.usesLiveBridge ? 'yes' : 'no'),
    usesLiveBridge: Boolean(doc.usesLiveBridge),
  })]),
));

export const LOCAL_COMMAND_CATALOG = Object.freeze(Object.values(LOCAL_COMMAND_METADATA));

export const CLI_USAGE_LINES = Object.freeze([
  'chrome-bridge server [--port 17376]',
  'chrome-bridge health',
  'chrome-bridge windows [--all --confirm] [--group-title <title>] [--group-color <color>]',
  'chrome-bridge group [--tabs] [--group-title <title>] [--group-color <color>]',
  'chrome-bridge tabs [--json --summary-only] [--all --confirm] [--group-title <title>] [--group-color <color>]',
  'chrome-bridge workspace [--tabs]',
  'chrome-bridge set-workspace [--name <name>] [--group-title <title>] [--group-color <color>] [--policy-mode scoped|strict] --confirm',
  'chrome-bridge clear-workspace --confirm',
  'chrome-bridge ensure-tab [url] [--active] [--group-title <title>] [--group-color <color>]',
  'chrome-bridge adopt-tab [--tab <id>] [--group-title <title>] [--group-color <color>] --confirm',
  'chrome-bridge open <url> [--tab <id>] [--active] [--new] [--allow-external] [--group-title <title>] [--group-color <color>]',
  'chrome-bridge activate [--tab <id>] [--focus-window] [--allow-external]',
  'chrome-bridge close-tab [--tab <id>] --confirm [--allow-external]',
  'chrome-bridge close-group [--group-title <title>] [--group-color <color>] --confirm',
  'chrome-bridge back [--tab <id>] [--allow-external]',
  'chrome-bridge forward [--tab <id>] [--allow-external]',
  'chrome-bridge reload [--tab <id>] [--bypass-cache] [--allow-external]',
  'chrome-bridge wait --selector <css> [--timeout-ms 10000] [--hidden-ok] [--tab <id>] [--allow-external]',
  'chrome-bridge observe [--tab <id>] [--limit 80] [--max-text-chars 160] [--allow-external]',
  'chrome-bridge act-preview --intent <text> [--tab <id>] [--max-candidates 5] [--risk read-only|confirmed-interaction|private-read] [--selector-preference stable|any] [--allow-external]',
  'chrome-bridge find-elements [--role <role>] [--text <text>] [--near-text <text>] [--placeholder <text>] [--href <text>] [--action <kind>] [--risk <risk>] [--limit 80] [--tab <id>] [--allow-external]',
  'chrome-bridge extract [--kind all|tables|forms|lists|keyValues] [--preset cpa-offer|article|product-page|pricing-table --network <name> --out <file> [--artifact-dir <dir>]] [--max-items 50] [--tab <id>] [--allow-external]',
  'chrome-bridge snapshot [--tab <id>] [--max-chars 200000] [--full-page] [--wait-for-text <text>] [--wait-for-pattern <regex>] [--scroll-step-px <n>] [--max-scroll-steps <n>] [--scroll-delay-ms <n>] [--out <path>] [--summary-only] [--include-content] [--no-content] [--max-inline-chars 4000] [--allow-external]',
  'chrome-bridge text [--tab <id>] [--max-chars 200000] [--full-page] [--wait-for-text <text>] [--wait-for-pattern <regex>] [--scroll-step-px <n>] [--max-scroll-steps <n>] [--scroll-delay-ms <n>] [--out <path>] [--summary-only] [--include-content] [--no-content] [--max-inline-chars 4000] [--allow-external]',
  'chrome-bridge html [--tab <id>] [--selector <css>] [--max-chars 500000] [--out <path>] [--inner] [--summary-only] [--include-content] [--no-content] [--max-inline-chars 4000] [--allow-external]',
  'chrome-bridge grep-page --pattern <regex> [--tab <id>] [--artifact-dir <dir>] [--max-matches 20] [--viewport-only] [--allow-external]',
  'chrome-bridge links [--selector <css>] [--tab <id>] [--artifact-dir <dir>] [--allow-external]',
  'chrome-bridge tables [--selector <css>] [--tab <id>] [--artifact-dir <dir>] [--allow-external]',
  'chrome-bridge download-discovery --out <file> [--selector <css>] [--tab <id>] [--artifact-dir <dir>] [--allow-external]',
  'chrome-bridge screenshot [--tab <id>] --out <file> [--full-page] [--selector <css>] [--max-pixels <n>] [--fallback viewport|error] [--timeout-ms <n>] [--allow-external]',
  'chrome-bridge pdf [--tab <id>] --out <file> [--landscape] [--omit-background] [--page-ranges <ranges>] [--scale <0.1-2>] [--allow-external]',
  'chrome-bridge scroll --tab <id> --y <pixels> [--allow-external]',
  'chrome-bridge click --tab <id> --selector <css> --confirm [--allow-external]',
  'chrome-bridge click-at --x <px> --y <px> --confirm [--trusted] [--tab <id>] [--allow-external]',
  'chrome-bridge hover [--selector <css>] [--x <px> --y <px>] [--trusted] [--tab <id>] [--allow-external]',
  'chrome-bridge type --tab <id> --selector <css> --text <text> --confirm [--trusted] [--allow-external]',
  'chrome-bridge press --key <key> --confirm [--selector <css>] [--trusted] [--tab <id>] [--allow-external]',
  'chrome-bridge select --selector <css> --confirm [--value <value> | --label <label> | --index <n>] [--tab <id>] [--allow-external]',
  'chrome-bridge select-options --selector <css> [--tab <id>] [--allow-external]',
  'chrome-bridge fill-form --fields-json <json> [--dry-run] [--confirm] [--tab <id>] [--allow-external]',
  'chrome-bridge handle-dialog --confirm [--dismiss] [--prompt-text <text>] [--tab <id>] [--allow-external]',
  'chrome-bridge upload-file --selector <css> (--file <path> | --files-json <json>) --confirm [--tab <id>] [--allow-external]',
  'chrome-bridge trace-start --confirm [--tab <id>] [--max-events 500] [--no-network] [--no-console] [--include-extension-events] [--allow-external]',
  'chrome-bridge trace-summary [--tab <id>] [--allow-external]',
  'chrome-bridge trace-events [--tab <id>] [--limit 100] [--allow-external]',
  'chrome-bridge diagnostics [--tab <id>] [--out <file>] [--allow-external]',
  'chrome-bridge lighthouse-ingest --report <file> [--out <file>] [--max-audits 25]',
  'chrome-bridge trace-stop [--tab <id>] [--limit 100] [--allow-external]',
  'chrome-bridge history [--query <text>] --confirm [--limit 25] [--start-time <ms>] [--end-time <ms>]',
  'chrome-bridge bookmarks [--query <text>] --confirm [--limit 50]',
  'chrome-bridge cookies [--url <url> | --domain <domain>] --confirm [--include-values --confirm-sensitive] [--limit 50]',
  'chrome-bridge storage [--tab <id>] --confirm [--include-values --confirm-sensitive] [--allow-external]',
  'chrome-bridge request <url> --confirm [--method GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS] [--headers-json <json>] [--body <text>] [--credentials include --confirm-sensitive] [--max-chars 20000] [--request-timeout-ms 60000]',
  'chrome-bridge ask --question <text> [--choices-json <json>] [--no-text] [--timeout-ms 300000] [--keep-tab]',
  'chrome-bridge session-summary',
  'chrome-bridge debug-bundle --out <dir> [--tab <id>] [--allow-external] [--include-snapshot] [--include-observe] [--include-screenshot] [--include-trace-events]',
  'chrome-bridge with-temp-tab <url> [--run-id <id>] [--active] [--keep-tab] [--group-title <title>] [--group-color <color>] -- <text|snapshot|html|screenshot> [read flags]',
  'chrome-bridge cleanup-run-tabs --run-id <id>',
  'chrome-bridge status [--token-budget]',
  'chrome-bridge last-artifact [--artifact-dir <dir>]',
  'chrome-bridge read-artifact --path <file> [--head <n>] [--grep <regex>] [--max-matches <n>]',
  'chrome-bridge command-catalog [--markdown]',
  'chrome-bridge advise --task <text> [--surface cli|mcp|both] [--risk read-only|confirmed-interaction|private-read] [--client claude-code|cursor|codex|vscode|windsurf|hermes|generic] [--live-bridge|--offline]',
  'chrome-bridge mcp-config [--client all|claude-code|cursor|codex|vscode|windsurf|hermes|generic]',
  'chrome-bridge mcp-write --client claude-code|cursor|codex|vscode|windsurf|hermes|generic [--root <dir>] [--out <file>] [--force]',
  'chrome-bridge reload-extension --confirm',
  'chrome-bridge self-test',
  'chrome-bridge runtime-smoke [--keep-tab] [--coverage-plan] [--summary-only] [--out <file>]',
  'chrome-bridge doctor [--live-checks] [--copy-path] [--open-extensions]',
  'chrome-bridge extension-path',
  'chrome-bridge codex-config',
]);

export const CLI_USAGE_GROUPS = Object.freeze([
  Object.freeze({
    id: 'server-diagnostics',
    title: 'Server and Diagnostics',
    commands: Object.freeze([
      'server',
      'health',
      'status',
      'windows',
      'doctor',
      'extension-path',
      'advise',
      'mcp-config',
      'mcp-write',
      'codex-config',
      'command-catalog',
      'lighthouse-ingest',
      'last-artifact',
      'read-artifact',
      'reload-extension',
      'self-test',
      'runtime-smoke',
    ]),
  }),
  Object.freeze({
    id: 'tabs-navigation',
    title: 'Tabs and Navigation',
    commands: Object.freeze([
      'group',
      'tabs',
      'workspace',
      'set-workspace',
      'clear-workspace',
      'ensure-tab',
      'adopt-tab',
      'open',
      'with-temp-tab',
      'cleanup-run-tabs',
      'activate',
      'close-tab',
      'close-group',
      'back',
      'forward',
      'reload',
    ]),
  }),
  Object.freeze({
    id: 'page-reads',
    title: 'Page Reads',
    commands: Object.freeze([
      'wait',
      'observe',
      'act-preview',
      'find-elements',
      'extract',
      'snapshot',
      'text',
      'html',
      'grep-page',
      'links',
      'tables',
      'download-discovery',
      'screenshot',
      'pdf',
      'scroll',
    ]),
  }),
  Object.freeze({
    id: 'interactions',
    title: 'Interactions',
    commands: Object.freeze([
      'click',
      'click-at',
      'hover',
      'type',
      'press',
      'select',
      'select-options',
      'fill-form',
      'handle-dialog',
      'upload-file',
    ]),
  }),
  Object.freeze({
    id: 'trace',
    title: 'Trace',
    commands: Object.freeze([
      'trace-start',
      'trace-summary',
      'trace-events',
      'diagnostics',
      'trace-stop',
    ]),
  }),
  Object.freeze({
    id: 'browser-data',
    title: 'Browser Data',
    commands: Object.freeze([
      'history',
      'bookmarks',
      'cookies',
      'storage',
      'request',
    ]),
  }),
  Object.freeze({
    id: 'human-in-the-loop',
    title: 'Human-in-the-Loop',
    commands: Object.freeze([
      'ask',
      'session-summary',
      'debug-bundle',
    ]),
  }),
]);

export function cliUsageLineForCommand(command) {
  const line = CLI_USAGE_LINES.find((candidate) => candidate === `chrome-bridge ${command}` || candidate.startsWith(`chrome-bridge ${command} `));
  if (!line) throw new Error(`Missing CLI usage line for command: ${command}`);
  return line;
}

export function generatedCliUsageBegin(groupId) {
  return `<!-- BEGIN GENERATED CLI USAGE: ${groupId} -->`;
}

export function generatedCliUsageEnd(groupId) {
  return `<!-- END GENERATED CLI USAGE: ${groupId} -->`;
}

export function cliUsageGroupMarkdown(groupId) {
  const group = CLI_USAGE_GROUPS.find((entry) => entry.id === groupId);
  if (!group) throw new Error(`Unknown CLI usage group: ${groupId}`);
  return [
    '```bash',
    ...group.commands.map((command) => cliUsageLineForCommand(command)),
    '```',
  ].join('\n');
}

export function generatedCliUsageBlock(groupId) {
  return [
    generatedCliUsageBegin(groupId),
    cliUsageGroupMarkdown(groupId),
    generatedCliUsageEnd(groupId),
  ].join('\n');
}

export const GENERATED_CLI_REFERENCE_BEGIN = '<!-- BEGIN GENERATED CLI REFERENCE -->';
export const GENERATED_CLI_REFERENCE_END = '<!-- END GENERATED CLI REFERENCE -->';

export function commandCatalog() {
  return {
    version: BRIDGE_VERSION,
    commands: COMMAND_CATALOG,
    localCommands: LOCAL_COMMAND_CATALOG,
    cliCommands: CLI_COMMANDS,
    mcpTools: MCP_TOOLS,
    cliUsageLines: CLI_USAGE_LINES,
    cliUsageGroups: CLI_USAGE_GROUPS,
    debuggerSerializedActions: DEBUGGER_SERIALIZED_ACTIONS,
    counts: {
      actions: EXTENSION_ACTIONS.length,
      localCommands: LOCAL_COMMAND_CATALOG.length,
      cliCommands: CLI_COMMANDS.length,
      mcpTools: MCP_TOOLS.length,
    },
  };
}

function tableCell(value) {
  return String(value).replace(/\|/g, '\\|');
}

function formatTimeoutMs(value) {
  return Number.isFinite(value) ? `${value} ms` : '-';
}

function formatConfirmation(entry) {
  if (entry.requiresSensitiveConfirmation) return 'sensitive';
  if (entry.requiresConfirmation) return 'yes';
  if (entry.requiresConditionalConfirmation) return 'conditional';
  return 'no';
}

export function commandCatalogMarkdown() {
  const rows = COMMAND_CATALOG.map((entry) => [
    entry.action,
    entry.category,
    entry.riskTier,
    formatTimeoutMs(entry.defaultTimeoutMs),
    entry.cli.join(', ') || '-',
    entry.mcp.join(', ') || '-',
    formatConfirmation(entry),
    entry.allowedKeys.join(', ') || '-',
    entry.summary,
  ]);

  return [
    '# Chrome Bridge Command Catalog',
    '',
    `Version: ${BRIDGE_VERSION}`,
    '',
    '| Action | Category | Risk | Default Timeout | CLI | MCP | Confirm | Direct Payload Keys | Summary |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map((row) => `| ${row.map(tableCell).join(' | ')} |`),
    '',
    '## Local Commands And Tools',
    '',
    '| ID | Category | Risk | Default Timeout | CLI | MCP | Live Bridge | Summary |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...LOCAL_COMMAND_CATALOG.map((entry) => `| ${[
      entry.id,
      entry.category,
      entry.riskTier,
      formatTimeoutMs(entry.defaultTimeoutMs),
      entry.cli.join(', ') || '-',
      entry.mcp.join(', ') || '-',
      entry.liveBridge || (entry.usesLiveBridge ? 'yes' : 'no'),
      entry.summary,
    ].map(tableCell).join(' | ')} |`),
    '',
    '## CLI Usage Signatures',
    '',
    '```text',
    ...CLI_USAGE_LINES,
    '```',
    '',
    '## Debugger-Serialized Actions',
    '',
    'These extension actions use the Chrome Debugger API and are serialized per tab by the extension:',
    '',
    ...DEBUGGER_SERIALIZED_ACTIONS.map((action) => `- \`${action}\``),
    '',
  ].join('\n');
}

export const CLI_COMMANDS = Object.freeze([
  'server',
  'health',
  'status',
  'windows',
  'group',
  'tabs',
  'workspace',
  'set-workspace',
  'clear-workspace',
  'ensure-tab',
  'adopt-tab',
  'open',
  'activate',
  'close-tab',
  'close-group',
  'back',
  'forward',
  'reload',
  'wait',
  'observe',
  'act-preview',
  'find-elements',
  'extract',
  'snapshot',
  'text',
  'html',
  'grep-page',
  'links',
  'tables',
  'download-discovery',
  'screenshot',
  'pdf',
  'scroll',
  'click',
  'click-at',
  'hover',
  'type',
  'press',
  'select',
  'select-options',
  'fill-form',
  'handle-dialog',
  'upload-file',
  'trace-start',
  'trace-summary',
  'trace-events',
  'diagnostics',
  'lighthouse-ingest',
  'trace-stop',
  'history',
  'bookmarks',
  'cookies',
  'storage',
  'request',
  'ask',
  'session-summary',
  'debug-bundle',
  'with-temp-tab',
  'cleanup-run-tabs',
  'last-artifact',
  'read-artifact',
  'command-catalog',
  'advise',
  'mcp-config',
  'mcp-write',
  'reload-extension',
  'self-test',
  'runtime-smoke',
  'doctor',
  'extension-path',
  'codex-config',
]);

export const MCP_TOOLS = Object.freeze([
  'chrome_bridge_health',
  'chrome_bridge_reload_extension',
  'chrome_bridge_self_test',
  'chrome_bridge_runtime_smoke',
  'chrome_bridge_doctor',
  'chrome_bridge_extension_path',
  'chrome_bridge_mcp_config',
  'chrome_bridge_codex_config',
  'chrome_bridge_windows',
  'chrome_bridge_tabs',
  'chrome_bridge_group',
  'chrome_bridge_workspace',
  'chrome_bridge_set_workspace',
  'chrome_bridge_clear_workspace',
  'chrome_bridge_ensure_tab',
  'chrome_bridge_adopt_tab',
  'chrome_bridge_open',
  'chrome_bridge_activate_tab',
  'chrome_bridge_close_tab',
  'chrome_bridge_close_group',
  'chrome_bridge_back',
  'chrome_bridge_forward',
  'chrome_bridge_reload_tab',
  'chrome_bridge_wait_for_selector',
  'chrome_bridge_observe',
  'chrome_bridge_act_preview',
  'chrome_bridge_find_elements',
  'chrome_bridge_extract',
  'chrome_bridge_download_discovery',
  'chrome_bridge_snapshot',
  'chrome_bridge_text',
  'chrome_bridge_html',
  'chrome_bridge_screenshot',
  'chrome_bridge_pdf',
  'chrome_bridge_click_at',
  'chrome_bridge_hover',
  'chrome_bridge_click',
  'chrome_bridge_type',
  'chrome_bridge_press',
  'chrome_bridge_select',
  'chrome_bridge_select_options',
  'chrome_bridge_fill_form',
  'chrome_bridge_handle_dialog',
  'chrome_bridge_upload_file',
  'chrome_bridge_scroll',
  'chrome_bridge_trace_start',
  'chrome_bridge_trace_summary',
  'chrome_bridge_trace_events',
  'chrome_bridge_diagnostics',
  'chrome_bridge_trace_stop',
  'chrome_bridge_history_search',
  'chrome_bridge_bookmarks_search',
  'chrome_bridge_cookies_list',
  'chrome_bridge_storage_snapshot',
  'chrome_bridge_request',
  'chrome_bridge_ask_user',
  'chrome_bridge_session_summary',
  'chrome_bridge_debug_bundle',
  'chrome_bridge_lighthouse_ingest',
  'chrome_bridge_command_catalog',
  'chrome_bridge_tool_advisor',
]);

export const GENERATED_MCP_TOOLS_BEGIN = '<!-- BEGIN GENERATED MCP TOOLS -->';
export const GENERATED_MCP_TOOLS_END = '<!-- END GENERATED MCP TOOLS -->';
export const GENERATED_CLI_SAFETY_NOTES_BEGIN = '<!-- BEGIN GENERATED CLI SAFETY NOTES -->';
export const GENERATED_CLI_SAFETY_NOTES_END = '<!-- END GENERATED CLI SAFETY NOTES -->';
export const GENERATED_MCP_SAFETY_NOTES_BEGIN = '<!-- BEGIN GENERATED MCP SAFETY NOTES -->';
export const GENERATED_MCP_SAFETY_NOTES_END = '<!-- END GENERATED MCP SAFETY NOTES -->';

function commandSurfaceMetadata(surface, id) {
  const surfaceKey = surface === 'cli' ? 'cli' : 'mcp';
  const action = COMMAND_CATALOG.find((entry) => entry[surfaceKey].includes(id));
  if (action) {
    return {
      id,
      contract: action.action,
      riskTier: action.riskTier,
      defaultTimeoutMs: action.defaultTimeoutMs,
      confirm: formatConfirmation(action),
      liveBridge: 'yes',
      summary: action.summary,
    };
  }

  const localCommand = LOCAL_COMMAND_CATALOG.find((entry) => entry[surfaceKey].includes(id));
  if (localCommand) {
    return {
      id,
      contract: localCommand.id,
      riskTier: localCommand.riskTier,
      defaultTimeoutMs: localCommand.defaultTimeoutMs,
      confirm: 'no',
      liveBridge: localCommand.liveBridge,
      summary: localCommand.summary,
    };
  }

  throw new Error(`Missing ${surface.toUpperCase()} metadata for id: ${id}`);
}

function commandSurfaceReferenceMarkdown(surface, ids, firstColumn) {
  const rows = ids.map((id) => {
    const entry = commandSurfaceMetadata(surface, id);
    return `| ${[
      `\`${entry.id}\``,
      `\`${entry.contract}\``,
      entry.riskTier,
      formatTimeoutMs(entry.defaultTimeoutMs),
      entry.confirm,
      entry.liveBridge,
      entry.summary,
    ].map(tableCell).join(' | ')} |`;
  });

  return [
    `| ${firstColumn} | Contract | Risk | Default Timeout | Confirm | Live Bridge | Summary |`,
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

export function cliCommandReferenceMarkdown() {
  return commandSurfaceReferenceMarkdown('cli', CLI_COMMANDS, 'Command');
}

export function generatedCliReferenceBlock() {
  return [
    GENERATED_CLI_REFERENCE_BEGIN,
    cliCommandReferenceMarkdown(),
    GENERATED_CLI_REFERENCE_END,
  ].join('\n');
}

export function mcpToolReferenceMarkdown() {
  return commandSurfaceReferenceMarkdown('mcp', MCP_TOOLS, 'Tool');
}

export function generatedMcpToolsBlock() {
  return [
    GENERATED_MCP_TOOLS_BEGIN,
    mcpToolReferenceMarkdown(),
    GENERATED_MCP_TOOLS_END,
  ].join('\n');
}

function codeList(values) {
  return values.map((value) => `\`${value}\``).join(', ');
}

function commandIdsByConfirmation(surface, ids, confirmation) {
  return ids.filter((id) => commandSurfaceMetadata(surface, id).confirm === confirmation);
}

export function cliSafetyNotesMarkdown() {
  const required = commandIdsByConfirmation('cli', CLI_COMMANDS, 'yes');
  const conditional = commandIdsByConfirmation('cli', CLI_COMMANDS, 'conditional');
  const sensitive = commandIdsByConfirmation('cli', CLI_COMMANDS, 'sensitive');

  return [
    'The safety notes below are generated from the shared registry by `npm run docs:commands`.',
    '',
    `- \`--confirm\` is required for: ${codeList(required)}.`,
    `- \`--confirm\` is conditionally required for: ${codeList(conditional)}; use it with \`--all\` on scoped inventory commands.`,
    `- \`--confirm-sensitive\` is required in addition to \`--confirm\` for private-value requests exposed by: ${codeList(sensitive)}.`,
    '- Live bridge caution: run `reload-extension --confirm`, `doctor --live-checks`, and `runtime-smoke` only when no other session is using the bridge.',
  ].join('\n');
}

export function generatedCliSafetyNotesBlock() {
  return [
    GENERATED_CLI_SAFETY_NOTES_BEGIN,
    cliSafetyNotesMarkdown(),
    GENERATED_CLI_SAFETY_NOTES_END,
  ].join('\n');
}

export function mcpSafetyNotesMarkdown() {
  const required = commandIdsByConfirmation('mcp', MCP_TOOLS, 'yes');
  const conditional = commandIdsByConfirmation('mcp', MCP_TOOLS, 'conditional');
  const sensitive = commandIdsByConfirmation('mcp', MCP_TOOLS, 'sensitive');

  return [
    'The safety notes below are generated from the shared registry by `npm run docs:commands`.',
    '',
    `- \`confirmed: true\` is required for: ${codeList(required)}.`,
    `- \`confirmed: true\` is conditionally required for: ${codeList(conditional)}; use it when passing \`includeAll: true\`.`,
    `- \`confirmSensitive: true\` is required in addition to \`confirmed: true\` for private-value requests exposed by: ${codeList(sensitive)}.`,
    '- Live bridge caution: run `chrome_bridge_reload_extension`, `chrome_bridge_doctor` with `liveChecks: true`, and `chrome_bridge_runtime_smoke` only when no other session is using the bridge.',
  ].join('\n');
}

export function generatedMcpSafetyNotesBlock() {
  return [
    GENERATED_MCP_SAFETY_NOTES_BEGIN,
    mcpSafetyNotesMarkdown(),
    GENERATED_MCP_SAFETY_NOTES_END,
  ].join('\n');
}

export class CommandPayloadValidationError extends Error {
  constructor(message, details = undefined, code = 'INVALID_PAYLOAD') {
    super(message);
    this.name = 'CommandPayloadValidationError';
    this.code = code;
    this.details = details;
  }
}

function payloadError(message, details = undefined, code = 'INVALID_PAYLOAD') {
  return new CommandPayloadValidationError(message, details, code);
}

function confirmationError(action) {
  return payloadError(`${action} requires confirmed=true`, undefined, 'CONFIRMATION_REQUIRED');
}

function sensitiveConfirmationError(action) {
  return payloadError(
    `${action} requires confirmSensitive=true because it can expose private browser data`,
    undefined,
    'SENSITIVE_CONFIRMATION_REQUIRED',
  );
}

function rejectUnknownKeys(payload, allowedKeys, action) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw payloadError(`${action} payload must be an object`);
  }
  const allowed = new Set(allowedKeys);
  const unknown = Object.keys(payload).filter((key) => !allowed.has(key));
  if (unknown.length) {
    throw payloadError(`${action} payload has unsupported keys: ${unknown.join(', ')}`);
  }
}

function ensureString(payload, key, action, options = {}) {
  if (payload[key] === undefined) {
    if (options.required) throw payloadError(`${action}.${key} is required`);
    return;
  }
  if (typeof payload[key] !== 'string') {
    throw payloadError(`${action}.${key} must be a string`);
  }
}

function ensureRequired(payload, key, action) {
  if (payload[key] === undefined || payload[key] === null) {
    throw payloadError(`${action}.${key} is required`);
  }
}

function ensureNonEmptyString(payload, key, action) {
  ensureRequired(payload, key, action);
  ensureString(payload, key, action);
  if (!payload[key].trim()) {
    throw payloadError(`${action}.${key} must not be empty`);
  }
}

function ensureBoolean(payload, key, action) {
  if (payload[key] !== undefined && typeof payload[key] !== 'boolean') {
    throw payloadError(`${action}.${key} must be a boolean`);
  }
}

function ensureNumber(payload, key, action) {
  if (payload[key] !== undefined && (typeof payload[key] !== 'number' || !Number.isFinite(payload[key]))) {
    throw payloadError(`${action}.${key} must be a number`);
  }
}

function ensureNumberRange(payload, key, action, min, max) {
  ensureNumber(payload, key, action);
  if (payload[key] === undefined) return;
  if (payload[key] < min || payload[key] > max) {
    throw payloadError(`${action}.${key} must be between ${min} and ${max}`);
  }
}

function ensureNonNegativeInteger(payload, key, action) {
  ensureNumber(payload, key, action);
  if (payload[key] === undefined) return;
  if (!Number.isInteger(payload[key]) || payload[key] < 0) {
    throw payloadError(`${action}.${key} must be a non-negative integer`);
  }
}

function ensureArray(payload, key, action) {
  if (payload[key] !== undefined && !Array.isArray(payload[key])) {
    throw payloadError(`${action}.${key} must be an array`);
  }
}

function ensureStringArray(payload, key, action) {
  ensureArray(payload, key, action);
  if (payload[key] !== undefined && payload[key].some((value) => typeof value !== 'string')) {
    throw payloadError(`${action}.${key} must be an array of strings`);
  }
}

function ensureObject(payload, key, action) {
  if (payload[key] !== undefined && (!payload[key] || typeof payload[key] !== 'object' || Array.isArray(payload[key]))) {
    throw payloadError(`${action}.${key} must be an object`);
  }
}

function ensureRecordValues(payload, key, action, allowedTypes) {
  ensureObject(payload, key, action);
  if (payload[key] === undefined) return;
  for (const [recordKey, value] of Object.entries(payload[key])) {
    if (!allowedTypes.includes(typeof value)) {
      throw payloadError(`${action}.${key}.${recordKey} must be one of: ${allowedTypes.join(', ')}`);
    }
  }
}

function ensureEnum(payload, key, action, values) {
  if (payload[key] !== undefined && !values.includes(payload[key])) {
    throw payloadError(`${action}.${key} must be one of: ${values.join(', ')}`);
  }
}

function ensureHttpMethod(payload, action) {
  if (payload.method === undefined) return;
  if (!HTTP_METHOD_SET.has(payload.method)) {
    throw payloadError(`${action}.method must be one of: ${HTTP_METHODS.join(', ')}`);
  }
}

function ensureChoices(payload, action) {
  ensureArray(payload, 'choices', action);
  if (payload.choices === undefined) return;
  if (payload.choices.length > 8) {
    throw payloadError(`${action}.choices must contain at most 8 entries`);
  }
  payload.choices.forEach((choice, index) => {
    if (typeof choice === 'string') return;
    if (!choice || typeof choice !== 'object' || Array.isArray(choice)) {
      throw payloadError(`${action}.choices[${index}] must be a string or { value, label } object`);
    }
    if (typeof choice.value !== 'string' || typeof choice.label !== 'string') {
      throw payloadError(`${action}.choices[${index}] value and label must be strings`);
    }
  });
}

function ensureUrlProtocol(payload, key, action, allowedProtocols) {
  if (payload[key] === undefined) return;
  let parsed;
  try {
    parsed = new URL(payload[key]);
  } catch {
    throw payloadError(`${action}.${key} must be a valid URL`);
  }
  if (!allowedProtocols.includes(parsed.protocol)) {
    throw payloadError(`${action}.${key} URL protocol must be one of: ${allowedProtocols.join(', ')}`);
  }
  if (parsed.protocol === 'about:' && parsed.href !== 'about:blank') {
    throw payloadError(`${action}.${key} only supports about:blank for about: URLs`);
  }
}

function ensureSelectTarget(payload, action) {
  if (action !== 'select') return;
  if (payload.value === undefined && payload.label === undefined && payload.index === undefined) {
    throw payloadError('select requires value, label, or index');
  }
}

function requiresConfirmed(action, payload) {
  if (['windows', 'tabs'].includes(action)) return payload.includeAll === true;
  if (action === 'fillForm') return payload.dryRun === false;
  return Boolean(COMMAND_METADATA[action]?.requiresConfirmation);
}

function requiresSensitiveConfirmed(action, payload) {
  if (action === 'cookiesList') {
    return Boolean(payload.includeValues || (!payload.url && !payload.domain && !payload.name));
  }
  if (action === 'storageSnapshot') return Boolean(payload.includeValues);
  if (action === 'fetchUrl') return payload.credentials === 'include';
  return false;
}

export function validateCommandPayload(action, payload = {}) {
  const allowed = COMMAND_PAYLOAD_SCHEMAS[action];
  if (!allowed) {
    const error = new Error(`Unsupported action: ${action}`);
    error.code = 'UNSUPPORTED_ACTION';
    throw error;
  }

  const normalizedPayload = payload === undefined ? {} : payload;
  rejectUnknownKeys(normalizedPayload, allowed, action);

  for (const key of ['tabId', 'timeoutMs', 'limit', 'maxChars', 'maxTextChars', 'maxItems', 'maxValueChars', 'maxPixels', 'requestTimeoutMs', 'x', 'y', 'index', 'scale', 'startTime', 'endTime', 'maxEvents', 'scrollStepPx', 'maxScrollSteps', 'scrollDelayMs']) {
    ensureNumber(normalizedPayload, key, action);
  }
  ensureNonNegativeInteger(normalizedPayload, 'tabId', action);
  ensureNonNegativeInteger(normalizedPayload, 'index', action);
  for (const key of ['includeAll', 'includeTabs', 'active', 'newTab', 'allowExternal', 'focusWindow', 'confirmed', 'confirmSensitive', 'bypassCache', 'visible', 'outer', 'fullPage', 'landscape', 'printBackground', 'preferCssPageSize', 'trusted', 'ctrlKey', 'metaKey', 'altKey', 'shiftKey', 'network', 'console', 'includeExtensionEvents', 'includeValues', 'allowText', 'closeOnAnswer', 'dryRun', 'accept']) {
    ensureBoolean(normalizedPayload, key, action);
  }
  for (const key of ['url', 'selector', 'role', 'text', 'nearText', 'placeholder', 'href', 'actionKind', 'risk', 'kind', 'fallback', 'pageRanges', 'button', 'key', 'code', 'value', 'label', 'file', 'query', 'domain', 'name', 'method', 'credentials', 'question', 'groupTitle', 'groupColor', 'promptText', 'policyMode', 'waitForText', 'waitForPattern']) {
    ensureString(normalizedPayload, key, action);
  }
  ensureStringArray(normalizedPayload, 'files', action);
  ensureChoices(normalizedPayload, action);
  ensureRecordValues(normalizedPayload, 'fields', action, ['string', 'number', 'boolean']);
  ensureRecordValues(normalizedPayload, 'headers', action, ['string']);
  ensureEnum(normalizedPayload, 'groupColor', action, TAB_GROUP_COLORS);
  ensureEnum(normalizedPayload, 'policyMode', action, ['scoped', 'strict']);
  ensureEnum(normalizedPayload, 'kind', action, ['all', 'tables', 'forms', 'lists', 'keyValues']);
  ensureEnum(normalizedPayload, 'fallback', action, ['viewport', 'error']);
  ensureEnum(normalizedPayload, 'credentials', action, ['omit', 'include']);
  if (action === 'fetchUrl') {
    ensureHttpMethod(normalizedPayload, action);
  }
  if (['ensureTab', 'open'].includes(action)) {
    ensureUrlProtocol(normalizedPayload, 'url', action, ['http:', 'https:', 'about:']);
  }
  if (['cookiesList', 'fetchUrl'].includes(action)) {
    ensureUrlProtocol(normalizedPayload, 'url', action, ['http:', 'https:']);
  }

  if (['goBack', 'goForward', 'reloadTab', 'waitForSelector'].includes(action)) {
    ensureNumberRange(normalizedPayload, 'timeoutMs', action, PAYLOAD_TIMEOUT_MIN_MS, PAYLOAD_TIMEOUT_MAX_MS);
  }
  if (['observe', 'findElements'].includes(action)) {
    ensureNumberRange(normalizedPayload, 'limit', action, 1, 300);
    ensureNumberRange(normalizedPayload, 'maxTextChars', action, 20, 1_000);
  }
  if (action === 'extractPage') {
    ensureNumberRange(normalizedPayload, 'maxItems', action, 1, 500);
    ensureNumberRange(normalizedPayload, 'maxTextChars', action, 50, 2_000);
  }
  if (['snapshot', 'text'].includes(action)) {
    ensureNumberRange(normalizedPayload, 'maxChars', action, 1_000, 200_000);
    ensureNumberRange(normalizedPayload, 'scrollStepPx', action, 100, 5_000);
    ensureNumberRange(normalizedPayload, 'maxScrollSteps', action, 1, 200);
    ensureNumberRange(normalizedPayload, 'scrollDelayMs', action, 0, 2_000);
  }
  if (action === 'html') {
    ensureNumberRange(normalizedPayload, 'maxChars', action, 1_000, 500_000);
  }
  if (action === 'screenshot') {
    ensureNumberRange(normalizedPayload, 'maxPixels', action, 1, 1_000_000_000);
  }
  if (action === 'printPdf') {
    ensureNumberRange(normalizedPayload, 'scale', action, 0.1, 2);
  }
  if (action === 'traceStart') {
    ensureNumberRange(normalizedPayload, 'maxEvents', action, 50, 2_000);
  }
  if (['traceEvents', 'traceStop'].includes(action)) {
    ensureNumberRange(normalizedPayload, 'limit', action, 1, 2_000);
  }
  if (['historySearch', 'bookmarksSearch'].includes(action)) {
    ensureNumberRange(normalizedPayload, 'limit', action, 1, 200);
  }
  if (action === 'historySearch') {
    ensureNumberRange(normalizedPayload, 'startTime', action, 0, Number.MAX_SAFE_INTEGER);
    ensureNumberRange(normalizedPayload, 'endTime', action, 0, Number.MAX_SAFE_INTEGER);
  }
  if (action === 'cookiesList') {
    ensureNumberRange(normalizedPayload, 'limit', action, 1, 500);
  }
  if (action === 'storageSnapshot') {
    ensureNumberRange(normalizedPayload, 'maxValueChars', action, 50, 5_000);
  }
  if (action === 'fetchUrl') {
    ensureNumberRange(normalizedPayload, 'maxChars', action, 100, 200_000);
    ensureNumberRange(normalizedPayload, 'requestTimeoutMs', action, 1_000, 60_000);
  }
  if (action === 'askUser') {
    ensureNumberRange(normalizedPayload, 'timeoutMs', action, 5_000, 1_800_000);
  }

  if (action === 'open') {
    ensureNonEmptyString(normalizedPayload, 'url', action);
  }
  if (['waitForSelector', 'click', 'select', 'listSelectOptions', 'uploadFile'].includes(action)) {
    ensureNonEmptyString(normalizedPayload, 'selector', action);
  }
  ensureSelectTarget(normalizedPayload, action);
  if (action === 'clickAt') {
    ensureRequired(normalizedPayload, 'x', action);
    ensureRequired(normalizedPayload, 'y', action);
  }
  if (action === 'type') {
    ensureNonEmptyString(normalizedPayload, 'selector', action);
    ensureRequired(normalizedPayload, 'text', action);
  }
  if (action === 'press') {
    ensureNonEmptyString(normalizedPayload, 'key', action);
  }
  if (action === 'fillForm') {
    ensureRequired(normalizedPayload, 'fields', action);
  }
  if (action === 'uploadFile' && !normalizedPayload.file && !(Array.isArray(normalizedPayload.files) && normalizedPayload.files.length)) {
    throw payloadError('uploadFile requires file or files');
  }
  if (action === 'fetchUrl') {
    ensureNonEmptyString(normalizedPayload, 'url', action);
  }
  if (action === 'askUser') {
    ensureNonEmptyString(normalizedPayload, 'question', action);
  }

  if (requiresConfirmed(action, normalizedPayload) && normalizedPayload.confirmed !== true) {
    throw confirmationError(action);
  }
  if (requiresSensitiveConfirmed(action, normalizedPayload) && normalizedPayload.confirmSensitive !== true) {
    throw sensitiveConfirmationError(action);
  }
}
