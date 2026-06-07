#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BRIDGE_URL = process.env.CHROME_BRIDGE_URL || 'http://127.0.0.1:17376';
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const execFileAsync = promisify(execFile);

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
    throw new Error(json.error || `Bridge returned HTTP ${response.status}`);
  }
  return json;
}

async function bridgeCommand(action, payload = {}, timeoutMs = 20_000) {
  const json = await bridgeFetch('/command', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, payload, timeoutMs }),
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

async function localSelfTest() {
  try {
    const result = await execFileAsync(process.execPath, [
      path.join(rootDir, 'bin/chrome-bridge.mjs'),
      'self-test',
    ], { timeout: 10_000 });
    return JSON.parse(result.stdout || '{}');
  } catch (error) {
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
    const result = await execFileAsync(process.execPath, cliArgs, { timeout: 180_000 });
    return JSON.parse(result.stdout || '{}');
  } catch (error) {
    return {
      ok: false,
      error: String(error?.message || error),
      stdout: error?.stdout || '',
      stderr: error?.stderr || '',
    };
  }
}

const server = new McpServer({
  name: 'codex-chrome-bridge',
  version: '0.3.0',
});

server.tool(
  'chrome_bridge_health',
  'Check whether the local Chrome bridge server and extension are connected.',
  {},
  async () => textResult(await bridgeFetch('/health')),
);

server.tool(
  'chrome_bridge_reload_extension',
  'Ask the loaded Codex Chrome Bridge extension to reload itself after local extension file edits.',
  {},
  async () => textResult(await bridgeCommand('reloadExtension', {}, 5_000)),
);

server.tool(
  'chrome_bridge_self_test',
  'Run local Chrome Bridge file/surface parity checks: syntax, manifest permissions, versions, extension actions, CLI commands, MCP tools, and safety gates.',
  {},
  async () => textResult(await localSelfTest()),
);

server.tool(
  'chrome_bridge_runtime_smoke',
  'Run a safe local runtime smoke test in real Chrome after extension v0.3.0 is loaded. Opens a temporary 127.0.0.1 fixture tab in the Codex Bridge group and verifies read/actions/screenshots/trace/browser-data safety gates.',
  {
    keepTab: z.boolean().optional(),
  },
  async (args) => textResult(await localRuntimeSmoke(args)),
);

server.tool(
  'chrome_bridge_tabs',
  'List Chrome tabs. By default this is scoped to the Codex Bridge tab group; pass includeAll only for explicitly approved diagnostics.',
  {
    includeAll: z.boolean().optional(),
  },
  async (args) => textResult(await bridgeCommand('tabs', args)),
);

server.tool(
  'chrome_bridge_group',
  'Show the Codex Bridge Chrome tab group and tabs currently scoped to it.',
  {},
  async () => textResult(await bridgeCommand('group')),
);

server.tool(
  'chrome_bridge_ensure_tab',
  'Create or return the dedicated non-focused Codex Chrome tab, optionally navigating it to a URL.',
  {
    url: z.string().url().optional(),
    active: z.boolean().optional(),
  },
  async (args) => textResult(await bridgeCommand('ensureTab', args, 30_000)),
);

server.tool(
  'chrome_bridge_open',
  'Open a URL in the Codex Bridge Chrome tab group. By default this reuses the dedicated tab; pass newTab to create another grouped tab.',
  {
    url: z.string().url(),
    tabId: z.number().optional(),
    active: z.boolean().optional(),
    newTab: z.boolean().optional(),
    allowExternal: z.boolean().optional(),
  },
  async (args) => textResult(await bridgeCommand('open', args, 30_000)),
);

server.tool(
  'chrome_bridge_activate_tab',
  'Activate a tab in the Codex Bridge group. Pass allowExternal only for explicitly approved outside tabs.',
  {
    tabId: z.number().optional(),
    focusWindow: z.boolean().optional(),
    allowExternal: z.boolean().optional(),
  },
  async (args) => textResult(await bridgeCommand('activateTab', args, 10_000)),
);

server.tool(
  'chrome_bridge_close_tab',
  'Close a tab in the Codex Bridge group. Requires confirmed=true.',
  {
    tabId: z.number().optional(),
    confirmed: z.boolean(),
    allowExternal: z.boolean().optional(),
  },
  async (args) => textResult(await bridgeCommand('closeTab', args, 10_000)),
);

server.tool(
  'chrome_bridge_close_group',
  'Close every tab in the Codex Bridge group. Requires confirmed=true.',
  {
    confirmed: z.boolean(),
  },
  async (args) => textResult(await bridgeCommand('closeGroup', args, 10_000)),
);

server.tool(
  'chrome_bridge_back',
  'Navigate the current Codex Bridge tab backward.',
  {
    tabId: z.number().optional(),
    allowExternal: z.boolean().optional(),
    timeoutMs: z.number().optional(),
  },
  async (args) => textResult(await bridgeCommand('goBack', args, 30_000)),
);

server.tool(
  'chrome_bridge_forward',
  'Navigate the current Codex Bridge tab forward.',
  {
    tabId: z.number().optional(),
    allowExternal: z.boolean().optional(),
    timeoutMs: z.number().optional(),
  },
  async (args) => textResult(await bridgeCommand('goForward', args, 30_000)),
);

server.tool(
  'chrome_bridge_reload_tab',
  'Reload the current Codex Bridge tab.',
  {
    tabId: z.number().optional(),
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
    tabId: z.number().optional(),
    timeoutMs: z.number().optional(),
    visible: z.boolean().optional(),
    allowExternal: z.boolean().optional(),
  },
  async (args) => textResult(await bridgeCommand('waitForSelector', args, 30_000)),
);

server.tool(
  'chrome_bridge_snapshot',
  'Read a structured snapshot from a Chrome tab: title, URL, headings, visible controls, tables, JSON-LD, and bounded visible text.',
  {
    tabId: z.number().optional(),
    maxChars: z.number().min(1000).max(200000).optional(),
    allowExternal: z.boolean().optional(),
  },
  async (args) => textResult(await bridgeCommand('snapshot', args, 30_000)),
);

server.tool(
  'chrome_bridge_text',
  'Read bounded visible text from a Chrome tab.',
  {
    tabId: z.number().optional(),
    maxChars: z.number().min(1000).max(200000).optional(),
    allowExternal: z.boolean().optional(),
  },
  async (args) => textResult(await bridgeCommand('text', args, 30_000)),
);

server.tool(
  'chrome_bridge_html',
  'Read bounded HTML from the selected tab or selector.',
  {
    tabId: z.number().optional(),
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
    tabId: z.number().optional(),
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
  'chrome_bridge_click_at',
  'Click viewport coordinates in the selected tab. Requires confirmed=true; trusted=true uses Chrome Debugger input.',
  {
    x: z.number(),
    y: z.number(),
    tabId: z.number().optional(),
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
    tabId: z.number().optional(),
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
    tabId: z.number().optional(),
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
    tabId: z.number().optional(),
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
    tabId: z.number().optional(),
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
    index: z.number().optional(),
    tabId: z.number().optional(),
    confirmed: z.boolean(),
    allowExternal: z.boolean().optional(),
  },
  async (args) => textResult(await bridgeCommand('select', args, 30_000)),
);

server.tool(
  'chrome_bridge_scroll',
  'Scroll a Chrome tab. This is a local navigation action and should be used only on the selected work tab.',
  {
    tabId: z.number().optional(),
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
    tabId: z.number().optional(),
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
  'chrome_bridge_trace_events',
  'Read recent bounded console/network trace events for the selected tab.',
  {
    tabId: z.number().optional(),
    limit: z.number().min(1).max(2000).optional(),
    allowExternal: z.boolean().optional(),
  },
  async (args) => textResult(await bridgeCommand('traceEvents', args, 30_000)),
);

server.tool(
  'chrome_bridge_trace_stop',
  'Stop console/network tracing for the selected tab and return recent events.',
  {
    tabId: z.number().optional(),
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
    url: z.string().url().optional(),
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
    tabId: z.number().optional(),
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
    url: z.string().url(),
    method: z.string().optional(),
    headers: z.record(z.string()).optional(),
    body: z.string().optional(),
    credentials: z.enum(['omit', 'include']).optional(),
    maxChars: z.number().min(100).max(200000).optional(),
    confirmed: z.boolean(),
    confirmSensitive: z.boolean().optional(),
  },
  async (args) => textResult(await bridgeCommand('fetchUrl', args, 60_000)),
);

await server.connect(new StdioServerTransport());
