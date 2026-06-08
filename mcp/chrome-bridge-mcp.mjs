#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  BRIDGE_VERSION,
  HTTP_METHODS,
  TAB_GROUP_COLORS,
  commandCatalog,
  commandDefaultTimeoutMs,
} from '../shared/command-registry.mjs';

const BRIDGE_URL = process.env.CHROME_BRIDGE_URL || 'http://127.0.0.1:17376';
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const execFileAsync = promisify(execFile);

function hasAllowedUrlProtocol(value, allowedProtocols) {
  try {
    const parsed = new URL(value);
    return allowedProtocols.includes(parsed.protocol)
      && (parsed.protocol !== 'about:' || parsed.href === 'about:blank');
  } catch {
    return false;
  }
}

const navigationUrlSchema = z.string().refine(
  (value) => hasAllowedUrlProtocol(value, ['http:', 'https:', 'about:']),
  'URL must use http:, https:, or about:blank',
);

const webUrlSchema = z.string().refine(
  (value) => hasAllowedUrlProtocol(value, ['http:', 'https:']),
  'URL must use http: or https:',
);

const chromeIdSchema = z.number().int().nonnegative();
const selectIndexSchema = z.number().int().nonnegative();

async function bridgeFetch(pathname, options = {}) {
  const response = await fetch(`${BRIDGE_URL}${pathname}`, options);
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Bridge returned non-JSON ${response.status}: ${text.slice(0, 500)}`);
  }
  if (!response.ok || json.ok === false) {
    const error = new Error(json.error || `Bridge returned HTTP ${response.status}`);
    error.code = json.code;
    error.details = json.details;
    throw error;
  }
  return json;
}

async function bridgeCommand(action, payload = {}, timeoutMs) {
  const effectiveTimeoutMs = timeoutMs ?? commandDefaultTimeoutMs(action);
  const json = await bridgeFetch('/command', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, payload, timeoutMs: effectiveTimeoutMs }),
  });
  return json.result;
}

function textResult(value) {
  return {
    content: [
      {
        type: 'text',
        text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function parseLocalCliJson(stdout) {
  if (!stdout) return null;
  try {
    const parsed = JSON.parse(stdout);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function localCliText(command) {
  const result = await execFileAsync(process.execPath, [
    path.join(rootDir, 'bin/chrome-bridge.mjs'),
    command,
  ], { timeout: 5_000 });
  return result.stdout.trimEnd();
}

async function localSelfTest() {
  try {
    const result = await execFileAsync(process.execPath, [
      path.join(rootDir, 'bin/chrome-bridge.mjs'),
      'self-test',
    ], { timeout: 10_000 });
    return parseLocalCliJson(result.stdout) || {};
  } catch (error) {
    const parsed = parseLocalCliJson(error?.stdout);
    if (parsed) {
      return {
        ...parsed,
        cliExitError: String(error?.message || error),
        stderr: error?.stderr || '',
      };
    }

    return {
      ok: false,
      error: String(error?.message || error),
      stdout: error?.stdout || '',
      stderr: error?.stderr || '',
    };
  }
}

async function localDoctor(args = {}) {
  try {
    const cliArgs = [
      path.join(rootDir, 'bin/chrome-bridge.mjs'),
      'doctor',
    ];
    if (args.liveChecks) cliArgs.push('--live-checks');
    const result = await execFileAsync(process.execPath, cliArgs, { timeout: 10_000 });
    return parseLocalCliJson(result.stdout) || {};
  } catch (error) {
    const parsed = parseLocalCliJson(error?.stdout);
    if (parsed) {
      return {
        ...parsed,
        cliExitError: String(error?.message || error),
        stderr: error?.stderr || '',
      };
    }

    return {
      ok: false,
      error: String(error?.message || error),
      stdout: error?.stdout || '',
      stderr: error?.stderr || '',
    };
  }
}

async function localRuntimeSmoke(args = {}) {
  try {
    const cliArgs = [
      path.join(rootDir, 'bin/chrome-bridge.mjs'),
      'runtime-smoke',
    ];
    if (args.keepTab) cliArgs.push('--keep-tab');
    if (args.coveragePlan) cliArgs.push('--coverage-plan');
    const result = await execFileAsync(process.execPath, cliArgs, { timeout: 180_000 });
    return parseLocalCliJson(result.stdout) || {};
  } catch (error) {
    const parsed = parseLocalCliJson(error?.stdout);
    if (parsed) {
      return {
        ...parsed,
        cliExitError: String(error?.message || error),
        stderr: error?.stderr || '',
      };
    }

    return {
      ok: false,
      error: String(error?.message || error),
      stdout: error?.stdout || '',
      stderr: error?.stderr || '',
    };
  }
}

async function sessionSummary() {
  const health = await bridgeFetch('/health').catch((error) => ({
    ok: false,
    code: error.code || null,
    error: String(error?.message || error),
  }));
  const group = await bridgeCommand('group', {}, 10_000).catch((error) => ({
    ok: false,
    code: error.code || null,
    error: String(error?.message || error),
  }));
  const workspace = await bridgeCommand('workspace', { includeTabs: true }, 10_000).catch((error) => ({
    ok: false,
    code: error.code || null,
    error: String(error?.message || error),
  }));
  return {
    generatedAt: new Date().toISOString(),
    bridgeUrl: BRIDGE_URL,
    health,
    workspace,
    group,
    recommendations: summaryRecommendations(health, group, workspace),
  };
}

function summaryRecommendations(health, group, workspace) {
  const recommendations = [];
  const bridgeVersion = health?.bridge?.version;
  const extensionVersion = health?.extension?.info?.version;
  const policyMode = workspace?.policy?.mode || workspace?.workspace?.policyMode;
  if (bridgeVersion && bridgeVersion !== BRIDGE_VERSION) {
    recommendations.push(`Restart the local Chrome Bridge server; expected ${BRIDGE_VERSION}, got ${bridgeVersion}.`);
  }
  if (extensionVersion && extensionVersion !== BRIDGE_VERSION) {
    recommendations.push(`Reload the unpacked extension; expected ${BRIDGE_VERSION}, got ${extensionVersion}.`);
  }
  if (!health?.extension?.connected) {
    recommendations.push('Load or reload the unpacked Chrome extension.');
  }
  if ((workspace?.counts?.tabs === 0) || (group?.tabs && !group.tabs.length)) {
    recommendations.push('Run ensure-tab, open, or adopt-tab before browser work.');
  }
  if (policyMode === 'strict') {
    recommendations.push('Strict workspace policy is active; outside tabs are blocked even with allowExternal.');
  }
  return recommendations;
}

async function writeDataUrlFile(filePath, dataUrl, expectedPrefix) {
  const match = new RegExp(`^${expectedPrefix},(.+)$`).exec(dataUrl || '');
  if (!match) throw new Error(`Invalid data URL for ${filePath}`);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, Buffer.from(match[1], 'base64'));
}

async function writeJsonFile(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

const DEBUG_BUNDLE_REDACTED_KEYS = new Set([
  'url',
  'href',
  'title',
  'text',
  'label',
  'value',
  'values',
  'dataUrl',
  'favIconUrl',
]);

function redactDebugBundleValue(value) {
  if (Array.isArray(value)) return value.map((item) => redactDebugBundleValue(item));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    DEBUG_BUNDLE_REDACTED_KEYS.has(key) ? '[redacted]' : redactDebugBundleValue(entry),
  ]));
}

async function debugBundle(args = {}) {
  const outputDir = path.resolve(args.out);
  const target = {
    tabId: args.tabId,
    allowExternal: args.allowExternal,
  };
  const createdAt = new Date().toISOString();
  const includeSnapshot = Boolean(args.includeSnapshot);
  const includeObserve = Boolean(args.includeObserve);
  const includeScreenshot = Boolean(args.includeScreenshot);
  const includeTraceEvents = Boolean(args.includeTraceEvents);
  const manifest = {
    createdAt,
    bridgeUrl: BRIDGE_URL,
    files: [],
    privacy: {
      mode: 'redacted',
      note: 'Bundle redacts URL/title/text/value fields and excludes cookie values, storage values, request bodies, credentialed requests, page artifacts, and full trace events unless explicitly requested.',
      pageArtifacts: {
        snapshot: includeSnapshot ? 'included' : 'omitted-by-default',
        observe: includeObserve ? 'included' : 'omitted-by-default',
        screenshot: includeScreenshot ? 'included' : 'omitted-by-default',
      },
      traceEvents: includeTraceEvents ? 'included' : 'summarized-by-default',
    },
  };

  const addJson = async (name, value, options = {}) => {
    const output = options.redact === false ? value : redactDebugBundleValue(value);
    await writeJsonFile(path.join(outputDir, name), output);
    manifest.files.push(name);
    return output;
  };

  const summary = await sessionSummary();
  await addJson('session-summary.json', redactDebugBundleValue(summary));
  await addJson('health.json', redactDebugBundleValue(summary.health));
  if (includeSnapshot) {
    await addJson('snapshot.json', await bridgeCommand('snapshot', { ...target, maxChars: 50_000 }, 30_000).catch((error) => ({
      ok: false,
      code: error.code || null,
      error: String(error?.message || error),
    })), { redact: false });
  }
  if (includeObserve) {
    await addJson('observe.json', await bridgeCommand('observe', { ...target, limit: 100 }, 30_000).catch((error) => ({
      ok: false,
      code: error.code || null,
      error: String(error?.message || error),
    })), { redact: false });
  }
  const trace = await bridgeCommand('traceSummary', target, 30_000).catch((error) => ({
    ok: false,
    code: error.code || null,
    error: String(error?.message || error),
  }));
  await addJson('trace-summary.json', trace);
  if (includeTraceEvents) {
    const traceEvents = await bridgeCommand('traceEvents', { ...target, limit: 200 }, 30_000).catch((error) => ({
      ok: false,
      code: error.code || null,
      error: String(error?.message || error),
    }));
    await addJson('trace-events.json', traceEvents, { redact: false });
  }

  if (includeScreenshot) {
    const screenshot = await bridgeCommand('screenshot', target, 30_000).catch((error) => ({
      ok: false,
      code: error.code || null,
      error: String(error?.message || error),
    }));
    if (screenshot?.dataUrl) {
      await writeDataUrlFile(path.join(outputDir, 'screenshot.png'), screenshot.dataUrl, 'data:image\\/png;base64');
      manifest.files.push('screenshot.png');
      await addJson('screenshot.json', { ...screenshot, dataUrl: undefined });
    } else {
      await addJson('screenshot.json', screenshot);
    }
  }

  await addJson('manifest.json', manifest);
  return {
    ok: true,
    out: outputDir,
    files: manifest.files,
    createdAt,
  };
}

const server = new McpServer({
  name: 'codex-chrome-bridge',
  version: BRIDGE_VERSION,
});

server.tool(
  'chrome_bridge_health',
  'Check whether the local Chrome bridge server and extension are connected.',
  {},
  async () => textResult(await bridgeFetch('/health')),
);

server.tool(
  'chrome_bridge_reload_extension',
  'Ask the loaded Codex Chrome Bridge extension to reload itself after local extension file edits. Requires confirmed=true because it interrupts active bridge sessions.',
  {
    confirmed: z.boolean(),
  },
  async (args) => textResult(await bridgeCommand('reloadExtension', args, 5_000)),
);

server.tool(
  'chrome_bridge_self_test',
  'Run local Chrome Bridge file/surface parity checks: syntax, manifest permissions, versions, extension actions, CLI commands, MCP tools, and safety gates.',
  {},
  async () => textResult(await localSelfTest()),
);

server.tool(
  'chrome_bridge_runtime_smoke',
  `Run a safe local runtime smoke test in real Chrome after extension v${BRIDGE_VERSION} is loaded. Pass coveragePlan=true to print the offline checklist with verification.status="not-run"; live success requires ok=true, coverage.ok=true, and verification.status="passed".`,
  {
    keepTab: z.boolean().optional(),
    coveragePlan: z.boolean().optional(),
  },
  async (args) => textResult(await localRuntimeSmoke(args)),
);

server.tool(
  'chrome_bridge_doctor',
  'Inspect local Chrome Bridge installation paths and setup hints. Offline by default; pass liveChecks=true only when no other session is using the bridge because it probes /health and Chrome Apple Events.',
  {
    liveChecks: z.boolean().optional(),
  },
  async (args) => textResult(await localDoctor(args)),
);

server.tool(
  'chrome_bridge_extension_path',
  'Return the local unpacked Chrome extension directory path. This is offline and does not contact Chrome or the bridge.',
  {},
  async () => textResult(await localCliText('extension-path')),
);

server.tool(
  'chrome_bridge_codex_config',
  'Return a Codex MCP configuration snippet for this local Chrome Bridge server using the current Node executable. This is offline and does not contact Chrome or the bridge.',
  {},
  async () => textResult(await localCliText('codex-config')),
);

server.tool(
  'chrome_bridge_windows',
  'List Chrome windows with grouped tabs. By default this is scoped to windows containing the Codex Bridge tab group; includeAll requires confirmed=true for explicitly approved diagnostics.',
  {
    includeAll: z.boolean().optional(),
    groupTitle: z.string().optional(),
    groupColor: z.enum(TAB_GROUP_COLORS).optional(),
    confirmed: z.boolean().optional(),
  },
  async (args) => textResult(await bridgeCommand('windows', args)),
);

server.tool(
  'chrome_bridge_tabs',
  'List Chrome tabs. By default this is scoped to the Codex Bridge tab group; includeAll requires confirmed=true for explicitly approved diagnostics.',
  {
    includeAll: z.boolean().optional(),
    groupTitle: z.string().optional(),
    groupColor: z.enum(TAB_GROUP_COLORS).optional(),
    confirmed: z.boolean().optional(),
  },
  async (args) => textResult(await bridgeCommand('tabs', args)),
);

server.tool(
  'chrome_bridge_group',
  'Show the Codex Bridge Chrome tab group and tabs currently scoped to it.',
  {
    includeTabs: z.boolean().optional(),
    groupTitle: z.string().optional(),
    groupColor: z.enum(TAB_GROUP_COLORS).optional(),
  },
  async (args) => textResult(await bridgeCommand('group', args)),
);

server.tool(
  'chrome_bridge_workspace',
  'Show the active Chrome Bridge workspace defaults, policy mode, scoped group counts, and optionally scoped tabs.',
  {
    includeTabs: z.boolean().optional(),
  },
  async (args) => textResult(await bridgeCommand('workspace', args, 10_000)),
);

server.tool(
  'chrome_bridge_set_workspace',
  'Set local workspace defaults for group title/color and policy mode. Requires confirmed=true; policyMode supports scoped or strict.',
  {
    name: z.string().optional(),
    groupTitle: z.string().optional(),
    groupColor: z.enum(TAB_GROUP_COLORS).optional(),
    policyMode: z.enum(['scoped', 'strict']).optional(),
    confirmed: z.boolean(),
  },
  async (args) => textResult(await bridgeCommand('setWorkspace', args, 10_000)),
);

server.tool(
  'chrome_bridge_clear_workspace',
  'Clear local workspace defaults and return to the default Codex Bridge group settings. Requires confirmed=true.',
  {
    confirmed: z.boolean(),
  },
  async (args) => textResult(await bridgeCommand('clearWorkspace', args, 10_000)),
);

server.tool(
  'chrome_bridge_ensure_tab',
  'Create or return the dedicated non-focused Codex Chrome tab, optionally navigating it to a URL.',
  {
    url: navigationUrlSchema.optional(),
    active: z.boolean().optional(),
    groupTitle: z.string().optional(),
    groupColor: z.enum(TAB_GROUP_COLORS).optional(),
  },
  async (args) => textResult(await bridgeCommand('ensureTab', args, 30_000)),
);

server.tool(
  'chrome_bridge_adopt_tab',
  'Adopt the current active tab, or a specified tabId, into the Codex Bridge group. Requires confirmed=true because it changes tab grouping in the user browser.',
  {
    tabId: chromeIdSchema.optional(),
    groupTitle: z.string().optional(),
    groupColor: z.enum(TAB_GROUP_COLORS).optional(),
    confirmed: z.boolean(),
  },
  async (args) => textResult(await bridgeCommand('adoptTab', args, 30_000)),
);

server.tool(
  'chrome_bridge_open',
  'Open a URL in the Codex Bridge Chrome tab group. By default this reuses the dedicated tab; pass newTab to create another grouped tab.',
  {
    url: navigationUrlSchema,
    tabId: chromeIdSchema.optional(),
    active: z.boolean().optional(),
    newTab: z.boolean().optional(),
    groupTitle: z.string().optional(),
    groupColor: z.enum(TAB_GROUP_COLORS).optional(),
    allowExternal: z.boolean().optional(),
  },
  async (args) => textResult(await bridgeCommand('open', args, 30_000)),
);

server.tool(
  'chrome_bridge_activate_tab',
  'Activate a tab in the Codex Bridge group. Pass allowExternal only for explicitly approved outside tabs.',
  {
    tabId: chromeIdSchema.optional(),
    focusWindow: z.boolean().optional(),
    allowExternal: z.boolean().optional(),
  },
  async (args) => textResult(await bridgeCommand('activateTab', args, 10_000)),
);

server.tool(
  'chrome_bridge_close_tab',
  'Close a tab in the Codex Bridge group. Requires confirmed=true.',
  {
    tabId: chromeIdSchema.optional(),
    confirmed: z.boolean(),
    allowExternal: z.boolean().optional(),
  },
  async (args) => textResult(await bridgeCommand('closeTab', args, 10_000)),
);

server.tool(
  'chrome_bridge_close_group',
  'Close every tab in the Codex Bridge group. Requires confirmed=true.',
  {
    groupTitle: z.string().optional(),
    groupColor: z.enum(TAB_GROUP_COLORS).optional(),
    confirmed: z.boolean(),
  },
  async (args) => textResult(await bridgeCommand('closeGroup', args, 10_000)),
);

server.tool(
  'chrome_bridge_back',
  'Navigate the current Codex Bridge tab backward.',
  {
    tabId: chromeIdSchema.optional(),
    allowExternal: z.boolean().optional(),
    timeoutMs: z.number().optional(),
  },
  async (args) => textResult(await bridgeCommand('goBack', args, 30_000)),
);

server.tool(
  'chrome_bridge_forward',
  'Navigate the current Codex Bridge tab forward.',
  {
    tabId: chromeIdSchema.optional(),
    allowExternal: z.boolean().optional(),
    timeoutMs: z.number().optional(),
  },
  async (args) => textResult(await bridgeCommand('goForward', args, 30_000)),
);

server.tool(
  'chrome_bridge_reload_tab',
  'Reload the current Codex Bridge tab.',
  {
    tabId: chromeIdSchema.optional(),
    bypassCache: z.boolean().optional(),
    allowExternal: z.boolean().optional(),
    timeoutMs: z.number().optional(),
  },
  async (args) => textResult(await bridgeCommand('reloadTab', args, 30_000)),
);

server.tool(
  'chrome_bridge_wait_for_selector',
  'Wait for a selector to appear in the selected tab.',
  {
    selector: z.string(),
    tabId: chromeIdSchema.optional(),
    timeoutMs: z.number().optional(),
    visible: z.boolean().optional(),
    allowExternal: z.boolean().optional(),
  },
  async (args) => textResult(await bridgeCommand('waitForSelector', args, 30_000)),
);

server.tool(
  'chrome_bridge_observe',
  'Read a ranked, bounded list of actionable elements from the selected tab without clicking or mutating page state.',
  {
    tabId: chromeIdSchema.optional(),
    limit: z.number().min(1).max(300).optional(),
    maxTextChars: z.number().min(20).max(1000).optional(),
    allowExternal: z.boolean().optional(),
  },
  async (args) => textResult(await bridgeCommand('observe', args, 30_000)),
);

server.tool(
  'chrome_bridge_find_elements',
  'Read ranked actionable elements filtered by role, text, nearby text, placeholder, href, action kind, or risk hint.',
  {
    tabId: chromeIdSchema.optional(),
    role: z.string().optional(),
    text: z.string().optional(),
    nearText: z.string().optional(),
    placeholder: z.string().optional(),
    href: z.string().optional(),
    actionKind: z.string().optional(),
    risk: z.string().optional(),
    limit: z.number().min(1).max(300).optional(),
    maxTextChars: z.number().min(20).max(1000).optional(),
    allowExternal: z.boolean().optional(),
  },
  async (args) => textResult(await bridgeCommand('findElements', args, 30_000)),
);

server.tool(
  'chrome_bridge_extract',
  'Extract structured JSON from the selected tab: tables, forms, lists, and key-value blocks.',
  {
    tabId: chromeIdSchema.optional(),
    kind: z.enum(['all', 'tables', 'forms', 'lists', 'keyValues']).optional(),
    maxItems: z.number().min(1).max(500).optional(),
    maxTextChars: z.number().min(50).max(2000).optional(),
    allowExternal: z.boolean().optional(),
  },
  async (args) => textResult(await bridgeCommand('extractPage', args, 30_000)),
);

server.tool(
  'chrome_bridge_snapshot',
  'Read a structured snapshot from a Chrome tab: title, URL, headings, visible controls, tables, JSON-LD, and bounded visible text.',
  {
    tabId: chromeIdSchema.optional(),
    maxChars: z.number().min(1000).max(200000).optional(),
    allowExternal: z.boolean().optional(),
  },
  async (args) => textResult(await bridgeCommand('snapshot', args, 30_000)),
);

server.tool(
  'chrome_bridge_text',
  'Read bounded visible text from a Chrome tab.',
  {
    tabId: chromeIdSchema.optional(),
    maxChars: z.number().min(1000).max(200000).optional(),
    allowExternal: z.boolean().optional(),
  },
  async (args) => textResult(await bridgeCommand('text', args, 30_000)),
);

server.tool(
  'chrome_bridge_html',
  'Read bounded HTML from the selected tab or selector.',
  {
    tabId: chromeIdSchema.optional(),
    selector: z.string().optional(),
    maxChars: z.number().min(1000).max(500000).optional(),
    outer: z.boolean().optional(),
    allowExternal: z.boolean().optional(),
  },
  async (args) => textResult(await bridgeCommand('html', args, 30_000)),
);

server.tool(
  'chrome_bridge_screenshot',
  'Capture a PNG screenshot of the dedicated or selected Chrome tab and save it to a local path. Supports viewport, fullPage, or selector screenshots.',
  {
    out: z.string(),
    tabId: chromeIdSchema.optional(),
    fullPage: z.boolean().optional(),
    selector: z.string().optional(),
    allowExternal: z.boolean().optional(),
  },
  async (args) => {
    const result = await bridgeCommand('screenshot', {
      tabId: args.tabId,
      fullPage: args.fullPage,
      selector: args.selector,
      allowExternal: args.allowExternal,
    }, args.fullPage || args.selector ? 60_000 : 30_000);
    const match = /^data:image\/png;base64,(.+)$/.exec(result.dataUrl || '');
    if (!match) throw new Error('Extension returned an invalid PNG data URL');
    const outputPath = path.resolve(args.out);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, Buffer.from(match[1], 'base64'));
    return textResult({ ...result, dataUrl: undefined, out: outputPath });
  },
);

server.tool(
  'chrome_bridge_pdf',
  'Export the selected Chrome tab as a PDF and save it to a local path.',
  {
    out: z.string(),
    tabId: chromeIdSchema.optional(),
    landscape: z.boolean().optional(),
    printBackground: z.boolean().optional(),
    pageRanges: z.string().optional(),
    scale: z.number().min(0.1).max(2).optional(),
    allowExternal: z.boolean().optional(),
  },
  async (args) => {
    const result = await bridgeCommand('printPdf', {
      tabId: args.tabId,
      landscape: args.landscape,
      printBackground: args.printBackground,
      pageRanges: args.pageRanges,
      scale: args.scale,
      allowExternal: args.allowExternal,
    }, 60_000);
    const match = /^data:application\/pdf;base64,(.+)$/.exec(result.dataUrl || '');
    if (!match) throw new Error('Extension returned an invalid PDF data URL');
    const outputPath = path.resolve(args.out);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, Buffer.from(match[1], 'base64'));
    return textResult({ ...result, dataUrl: undefined, out: outputPath });
  },
);

server.tool(
  'chrome_bridge_click_at',
  'Click viewport coordinates in the selected tab. Requires confirmed=true; trusted=true uses Chrome Debugger input.',
  {
    x: z.number(),
    y: z.number(),
    tabId: chromeIdSchema.optional(),
    button: z.string().optional(),
    trusted: z.boolean().optional(),
    confirmed: z.boolean(),
    allowExternal: z.boolean().optional(),
  },
  async (args) => textResult(await bridgeCommand('clickAt', args, 30_000)),
);

server.tool(
  'chrome_bridge_hover',
  'Hover an element or coordinates in the selected tab.',
  {
    selector: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    tabId: chromeIdSchema.optional(),
    trusted: z.boolean().optional(),
    allowExternal: z.boolean().optional(),
  },
  async (args) => textResult(await bridgeCommand('hover', args, 30_000)),
);

server.tool(
  'chrome_bridge_click',
  'Click a selector in the selected tab. Requires confirmed=true.',
  {
    selector: z.string(),
    tabId: chromeIdSchema.optional(),
    confirmed: z.boolean(),
    allowExternal: z.boolean().optional(),
  },
  async (args) => textResult(await bridgeCommand('click', args, 30_000)),
);

server.tool(
  'chrome_bridge_type',
  'Type text into a selector in the selected tab. Requires confirmed=true; trusted=true uses Chrome Debugger insertText.',
  {
    selector: z.string(),
    text: z.string(),
    tabId: chromeIdSchema.optional(),
    trusted: z.boolean().optional(),
    confirmed: z.boolean(),
    allowExternal: z.boolean().optional(),
  },
  async (args) => textResult(await bridgeCommand('type', args, 30_000)),
);

server.tool(
  'chrome_bridge_press',
  'Press a keyboard key in the selected tab. Requires confirmed=true; trusted=true uses Chrome Debugger input.',
  {
    key: z.string(),
    code: z.string().optional(),
    selector: z.string().optional(),
    tabId: chromeIdSchema.optional(),
    trusted: z.boolean().optional(),
    ctrlKey: z.boolean().optional(),
    metaKey: z.boolean().optional(),
    altKey: z.boolean().optional(),
    shiftKey: z.boolean().optional(),
    confirmed: z.boolean(),
    allowExternal: z.boolean().optional(),
  },
  async (args) => textResult(await bridgeCommand('press', args, 30_000)),
);

server.tool(
  'chrome_bridge_select',
  'Select an option in a select element. Requires confirmed=true.',
  {
    selector: z.string(),
    value: z.string().optional(),
    label: z.string().optional(),
    index: selectIndexSchema.optional(),
    tabId: chromeIdSchema.optional(),
    confirmed: z.boolean(),
    allowExternal: z.boolean().optional(),
  },
  async (args) => textResult(await bridgeCommand('select', args, 30_000)),
);

server.tool(
  'chrome_bridge_select_options',
  'Read options from a select element without changing page state.',
  {
    selector: z.string(),
    tabId: chromeIdSchema.optional(),
    allowExternal: z.boolean().optional(),
  },
  async (args) => textResult(await bridgeCommand('listSelectOptions', args, 30_000)),
);

server.tool(
  'chrome_bridge_fill_form',
  'Preview or apply field values to form controls. Defaults to dryRun; applying values requires confirmed=true.',
  {
    fields: z.record(z.union([z.string(), z.number(), z.boolean()])),
    dryRun: z.boolean().optional(),
    tabId: chromeIdSchema.optional(),
    confirmed: z.boolean().optional(),
    allowExternal: z.boolean().optional(),
  },
  async (args) => textResult(await bridgeCommand('fillForm', {
    ...args,
    dryRun: args.dryRun !== false,
  }, 30_000)),
);

server.tool(
  'chrome_bridge_handle_dialog',
  'Accept or dismiss the currently open JavaScript dialog in the selected tab. Requires confirmed=true.',
  {
    tabId: chromeIdSchema.optional(),
    accept: z.boolean().optional(),
    promptText: z.string().optional(),
    confirmed: z.boolean(),
    allowExternal: z.boolean().optional(),
  },
  async (args) => textResult(await bridgeCommand('handleDialog', args, 30_000)),
);

server.tool(
  'chrome_bridge_upload_file',
  'Set local file paths on a file input element via Chrome Debugger. Requires confirmed=true.',
  {
    selector: z.string(),
    file: z.string().optional(),
    files: z.array(z.string()).optional(),
    tabId: chromeIdSchema.optional(),
    confirmed: z.boolean(),
    allowExternal: z.boolean().optional(),
  },
  async (args) => textResult(await bridgeCommand('uploadFile', args, 60_000)),
);

server.tool(
  'chrome_bridge_scroll',
  'Scroll a Chrome tab. This is a local navigation action and should be used only on the selected work tab.',
  {
    tabId: chromeIdSchema.optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    allowExternal: z.boolean().optional(),
  },
  async (args) => textResult(await bridgeCommand('scroll', args, 10_000)),
);

server.tool(
  'chrome_bridge_trace_start',
  'Start bounded console/network tracing for the selected tab. Requires confirmed=true; headers and bodies are not captured.',
  {
    tabId: chromeIdSchema.optional(),
    maxEvents: z.number().min(50).max(2000).optional(),
    network: z.boolean().optional(),
    console: z.boolean().optional(),
    includeExtensionEvents: z.boolean().optional(),
    confirmed: z.boolean(),
    allowExternal: z.boolean().optional(),
  },
  async (args) => textResult(await bridgeCommand('traceStart', args, 30_000)),
);

server.tool(
  'chrome_bridge_trace_summary',
  'Read trace session metadata without returning console or network event logs.',
  {
    tabId: chromeIdSchema.optional(),
    allowExternal: z.boolean().optional(),
  },
  async (args) => textResult(await bridgeCommand('traceSummary', args, 30_000)),
);

server.tool(
  'chrome_bridge_trace_events',
  'Read recent bounded console/network trace events for the selected tab.',
  {
    tabId: chromeIdSchema.optional(),
    limit: z.number().min(1).max(2000).optional(),
    allowExternal: z.boolean().optional(),
  },
  async (args) => textResult(await bridgeCommand('traceEvents', args, 30_000)),
);

server.tool(
  'chrome_bridge_trace_stop',
  'Stop console/network tracing for the selected tab and return recent events.',
  {
    tabId: chromeIdSchema.optional(),
    limit: z.number().min(1).max(2000).optional(),
    allowExternal: z.boolean().optional(),
  },
  async (args) => textResult(await bridgeCommand('traceStop', args, 30_000)),
);

server.tool(
  'chrome_bridge_history_search',
  'Search Chrome history. Requires confirmed=true because history is private browser data.',
  {
    query: z.string().optional(),
    limit: z.number().min(1).max(200).optional(),
    startTime: z.number().optional(),
    endTime: z.number().optional(),
    confirmed: z.boolean(),
  },
  async (args) => textResult(await bridgeCommand('historySearch', args, 30_000)),
);

server.tool(
  'chrome_bridge_bookmarks_search',
  'Search Chrome bookmarks. Requires confirmed=true because bookmarks are private browser data.',
  {
    query: z.string().optional(),
    limit: z.number().min(1).max(200).optional(),
    confirmed: z.boolean(),
  },
  async (args) => textResult(await bridgeCommand('bookmarksSearch', args, 30_000)),
);

server.tool(
  'chrome_bridge_cookies_list',
  'List Chrome cookies metadata for a URL/domain. Requires confirmed=true; cookie values require includeValues and confirmSensitive.',
  {
    url: webUrlSchema.optional(),
    domain: z.string().optional(),
    name: z.string().optional(),
    limit: z.number().min(1).max(500).optional(),
    includeValues: z.boolean().optional(),
    confirmed: z.boolean(),
    confirmSensitive: z.boolean().optional(),
  },
  async (args) => textResult(await bridgeCommand('cookiesList', args, 30_000)),
);

server.tool(
  'chrome_bridge_storage_snapshot',
  'Read localStorage/sessionStorage keys for the selected page. Requires confirmed=true; values require includeValues and confirmSensitive.',
  {
    tabId: chromeIdSchema.optional(),
    includeValues: z.boolean().optional(),
    maxValueChars: z.number().min(50).max(5000).optional(),
    confirmed: z.boolean(),
    confirmSensitive: z.boolean().optional(),
    allowExternal: z.boolean().optional(),
  },
  async (args) => textResult(await bridgeCommand('storageSnapshot', args, 30_000)),
);

server.tool(
  'chrome_bridge_request',
  'Run a bounded fetch from the extension context. Requires confirmed=true; credentials=include requires confirmSensitive.',
  {
    url: webUrlSchema,
    method: z.enum(HTTP_METHODS).optional(),
    headers: z.record(z.string()).optional(),
    body: z.string().optional(),
    credentials: z.enum(['omit', 'include']).optional(),
    maxChars: z.number().min(100).max(200000).optional(),
    confirmed: z.boolean(),
    confirmSensitive: z.boolean().optional(),
  },
  async (args) => textResult(await bridgeCommand('fetchUrl', args, 60_000)),
);

server.tool(
  'chrome_bridge_ask_user',
  'Open a local Codex Bridge prompt tab and wait for the user to answer. Use when the agent needs human-in-the-loop confirmation, clarification, or CAPTCHA/manual-step coordination.',
  {
    question: z.string(),
    choices: z.array(z.union([
      z.string(),
      z.object({
        value: z.string(),
        label: z.string(),
      }),
    ])).max(8).optional(),
    allowText: z.boolean().optional(),
    closeOnAnswer: z.boolean().optional(),
    timeoutMs: z.number().min(5000).max(1800000).optional(),
  },
  async (args) => textResult(await bridgeCommand('askUser', args, args.timeoutMs ? args.timeoutMs + 5_000 : 305_000)),
);

server.tool(
  'chrome_bridge_session_summary',
  'Return a safe local session summary: bridge health, extension state, scoped group status, and version mismatch signals.',
  {},
  async () => textResult(await sessionSummary()),
);

server.tool(
  'chrome_bridge_debug_bundle',
  'Write a redacted local debug bundle with health, session summary, and trace summary metadata. Page artifacts and full trace events require explicit opt-in flags.',
  {
    out: z.string(),
    tabId: chromeIdSchema.optional(),
    allowExternal: z.boolean().optional(),
    includeSnapshot: z.boolean().optional(),
    includeObserve: z.boolean().optional(),
    includeScreenshot: z.boolean().optional(),
    includeTraceEvents: z.boolean().optional(),
  },
  async (args) => textResult(await debugBundle(args)),
);

server.tool(
  'chrome_bridge_command_catalog',
  'Return local Chrome Bridge command metadata from the shared registry, including actions, risk tiers, default timeouts, CLI aliases, MCP tools, and confirmation requirements.',
  {},
  async () => textResult(commandCatalog()),
);

await server.connect(new StdioServerTransport());
