#!/usr/bin/env node
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { startBridgeServer } from '../server/bridge-server.mjs';

const DEFAULT_ENDPOINT = process.env.CHROME_BRIDGE_URL || 'http://127.0.0.1:17376';
const EXPECTED_EXTENSION_VERSION = '0.3.0';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const execFileAsync = promisify(execFile);

function usage() {
  return `Usage:
  chrome-bridge server [--port 17376]
  chrome-bridge health
  chrome-bridge group [--tabs]
  chrome-bridge tabs [--all]
  chrome-bridge ensure-tab [url] [--active]
  chrome-bridge open <url> [--tab <id>] [--active] [--new]
  chrome-bridge activate [--tab <id>] [--focus-window] [--allow-external]
  chrome-bridge close-tab [--tab <id>] --confirm [--allow-external]
  chrome-bridge close-group --confirm
  chrome-bridge back [--tab <id>] [--allow-external]
  chrome-bridge forward [--tab <id>] [--allow-external]
  chrome-bridge reload [--tab <id>] [--bypass-cache] [--allow-external]
  chrome-bridge wait --selector <css> [--timeout-ms 10000] [--hidden-ok] [--tab <id>] [--allow-external]
  chrome-bridge snapshot [--tab <id>] [--max-chars 50000] [--allow-external]
  chrome-bridge text [--tab <id>] [--max-chars 50000] [--allow-external]
  chrome-bridge html [--tab <id>] [--selector <css>] [--max-chars 100000] [--inner] [--allow-external]
  chrome-bridge screenshot [--tab <id>] --out <file> [--full-page] [--selector <css>] [--allow-external]
  chrome-bridge scroll --tab <id> --y <pixels> [--allow-external]
  chrome-bridge click --tab <id> --selector <css> --confirm [--allow-external]
  chrome-bridge click-at --x <px> --y <px> --confirm [--trusted] [--tab <id>] [--allow-external]
  chrome-bridge hover [--selector <css>] [--x <px> --y <px>] [--trusted] [--tab <id>] [--allow-external]
  chrome-bridge type --tab <id> --selector <css> --text <text> --confirm [--trusted] [--allow-external]
  chrome-bridge press --key <key> --confirm [--selector <css>] [--trusted] [--tab <id>] [--allow-external]
  chrome-bridge select --selector <css> --confirm [--value <value> | --label <label> | --index <n>] [--tab <id>] [--allow-external]
  chrome-bridge trace-start --confirm [--tab <id>] [--max-events 500] [--no-network] [--no-console] [--include-extension-events] [--allow-external]
  chrome-bridge trace-events [--tab <id>] [--limit 100] [--allow-external]
  chrome-bridge trace-stop [--tab <id>] [--limit 100] [--allow-external]
  chrome-bridge history [--query <text>] --confirm [--limit 25]
  chrome-bridge bookmarks [--query <text>] --confirm [--limit 50]
  chrome-bridge cookies [--url <url> | --domain <domain>] --confirm [--include-values --confirm-sensitive] [--limit 50]
  chrome-bridge storage [--tab <id>] --confirm [--include-values --confirm-sensitive] [--allow-external]
  chrome-bridge request <url> --confirm [--method GET] [--headers-json <json>] [--body <text>] [--credentials include --confirm-sensitive] [--max-chars 20000]
  chrome-bridge reload-extension
  chrome-bridge self-test
  chrome-bridge runtime-smoke [--keep-tab]
  chrome-bridge doctor [--copy-path] [--open-extensions]
  chrome-bridge extension-path
  chrome-bridge codex-config`;
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (!value.startsWith('--')) {
      args._.push(value);
      continue;
    }

    const key = value.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

async function bridgeFetch(pathname, options = {}) {
  const response = await fetch(`${DEFAULT_ENDPOINT}${pathname}`, options);
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

async function command(action, payload = {}, timeoutMs) {
  const json = await bridgeFetch('/command', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, payload, timeoutMs }),
  });
  return json.result;
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function targetPayload(args) {
  return {
    tabId: args.tab ? Number(args.tab) : undefined,
    allowExternal: Boolean(args['allow-external']),
  };
}

function confirmationPayload(args) {
  return {
    confirmed: Boolean(args.confirm),
    confirmSensitive: Boolean(args['confirm-sensitive']),
  };
}

function parseJsonOption(value, name) {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${name} must be valid JSON: ${String(error?.message || error)}`);
  }
}

const EXPECTED_MANIFEST_PERMISSIONS = [
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

const EXPECTED_EXTENSION_ACTIONS = [
  'tabs',
  'group',
  'ensureTab',
  'open',
  'activateTab',
  'closeTab',
  'closeGroup',
  'goBack',
  'goForward',
  'reloadTab',
  'waitForSelector',
  'snapshot',
  'text',
  'html',
  'screenshot',
  'scroll',
  'click',
  'clickAt',
  'hover',
  'type',
  'press',
  'select',
  'traceStart',
  'traceEvents',
  'traceStop',
  'historySearch',
  'bookmarksSearch',
  'cookiesList',
  'storageSnapshot',
  'fetchUrl',
  'reloadExtension',
];

const EXPECTED_CLI_COMMANDS = [
  'health',
  'group',
  'tabs',
  'ensure-tab',
  'open',
  'activate',
  'close-tab',
  'close-group',
  'back',
  'forward',
  'reload',
  'wait',
  'snapshot',
  'text',
  'html',
  'screenshot',
  'scroll',
  'click',
  'click-at',
  'hover',
  'type',
  'press',
  'select',
  'trace-start',
  'trace-events',
  'trace-stop',
  'history',
  'bookmarks',
  'cookies',
  'storage',
  'request',
  'reload-extension',
  'self-test',
  'runtime-smoke',
  'doctor',
];

const EXPECTED_MCP_TOOLS = [
  'chrome_bridge_health',
  'chrome_bridge_reload_extension',
  'chrome_bridge_self_test',
  'chrome_bridge_runtime_smoke',
  'chrome_bridge_tabs',
  'chrome_bridge_group',
  'chrome_bridge_ensure_tab',
  'chrome_bridge_open',
  'chrome_bridge_activate_tab',
  'chrome_bridge_close_tab',
  'chrome_bridge_close_group',
  'chrome_bridge_back',
  'chrome_bridge_forward',
  'chrome_bridge_reload_tab',
  'chrome_bridge_wait_for_selector',
  'chrome_bridge_snapshot',
  'chrome_bridge_text',
  'chrome_bridge_html',
  'chrome_bridge_screenshot',
  'chrome_bridge_click_at',
  'chrome_bridge_hover',
  'chrome_bridge_click',
  'chrome_bridge_type',
  'chrome_bridge_press',
  'chrome_bridge_select',
  'chrome_bridge_scroll',
  'chrome_bridge_trace_start',
  'chrome_bridge_trace_events',
  'chrome_bridge_trace_stop',
  'chrome_bridge_history_search',
  'chrome_bridge_bookmarks_search',
  'chrome_bridge_cookies_list',
  'chrome_bridge_storage_snapshot',
  'chrome_bridge_request',
];

async function tryExec(commandName, args, options = {}) {
  if (typeof options.input === 'string') {
    return trySpawnWithInput(commandName, args, options);
  }

  try {
    const result = await execFileAsync(commandName, args, {
      timeout: options.timeout || 5_000,
    });
    return {
      ok: true,
      stdout: result.stdout?.trim() || '',
      stderr: result.stderr?.trim() || '',
    };
  } catch (error) {
    return {
      ok: false,
      error: String(error?.message || error),
      stdout: error?.stdout?.trim?.() || '',
      stderr: error?.stderr?.trim?.() || '',
    };
  }
}

function trySpawnWithInput(commandName, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(commandName, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
    }, options.timeout || 5_000);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      resolve({
        ok: code === 0,
        code,
        signal,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        error: code === 0 ? null : `${commandName} exited with code ${code ?? signal}`,
      });
    });
    child.stdin.end(options.input);
  });
}

async function doctor(args) {
  const extensionPath = path.join(rootDir, 'extension');
  const health = await bridgeFetch('/health').catch((error) => ({
    ok: false,
    error: String(error?.message || error),
  }));

  const appleEvents = await tryExec('osascript', [
    '-e',
    'tell application "Google Chrome" to execute active tab of front window javascript "document.title"',
  ], { timeout: 3_000 });

  const actions = [];
  if (args['copy-path']) {
    actions.push({
      action: 'copy-path',
      result: await tryExec('pbcopy', [], { input: extensionPath }),
    });
  }

  if (args['open-extensions']) {
    actions.push({
      action: 'open-extensions',
      result: await tryExec('open', ['-a', 'Google Chrome', 'chrome://extensions/']),
    });
  }

  const extensionConnected = Boolean(health?.extension?.connected);
  const extensionVersion = health?.extension?.info?.version || null;
  const extensionCurrent = extensionVersion === EXPECTED_EXTENSION_VERSION;
  const appleEventsJsEnabled = appleEvents.ok;

  return {
    bridgeUrl: DEFAULT_ENDPOINT,
    extensionPath,
    health,
    checks: {
      extensionConnected,
      expectedExtensionVersion: EXPECTED_EXTENSION_VERSION,
      extensionVersion,
      extensionCurrent,
      appleEventsJsEnabled,
      appleEventsError: appleEvents.ok ? null : appleEvents.error,
    },
    actions,
    nextActions: extensionConnected && extensionCurrent ? [
      'Run chrome-bridge runtime-smoke for full local runtime verification.',
      'Run ensure-tab/open/snapshot/screenshot commands for task-specific work.',
      'For future extension file edits, run chrome-bridge reload-extension.',
    ] : extensionConnected ? [
      'Reload the unpacked Codex Chrome Bridge extension in chrome://extensions/.',
      `Confirm chrome-bridge health reports extension.info.version ${EXPECTED_EXTENSION_VERSION}.`,
    ] : [
      'Open chrome://extensions/ in the real Google Chrome profile.',
      'Enable Developer mode.',
      `Load unpacked extension from ${extensionPath}.`,
      'Run chrome-bridge health and confirm extension.connected is true.',
    ],
  };
}

function checkIncludes(text, needles, label) {
  return needles.map((needle) => ({
    label,
    item: needle,
    ok: text.includes(needle),
  }));
}

async function selfTest() {
  const paths = {
    manifest: path.join(rootDir, 'extension/manifest.json'),
    background: path.join(rootDir, 'extension/background.js'),
    offscreen: path.join(rootDir, 'extension/offscreen.js'),
    server: path.join(rootDir, 'server/bridge-server.mjs'),
    cli: path.join(rootDir, 'bin/chrome-bridge.mjs'),
    mcp: path.join(rootDir, 'mcp/chrome-bridge-mcp.mjs'),
    packageJson: path.join(rootDir, 'package.json'),
    packageLock: path.join(rootDir, 'package-lock.json'),
  };

  const [
    manifestText,
    background,
    offscreen,
    server,
    cli,
    mcp,
    packageJsonText,
    packageLockText,
  ] = await Promise.all([
    fs.readFile(paths.manifest, 'utf8'),
    fs.readFile(paths.background, 'utf8'),
    fs.readFile(paths.offscreen, 'utf8'),
    fs.readFile(paths.server, 'utf8'),
    fs.readFile(paths.cli, 'utf8'),
    fs.readFile(paths.mcp, 'utf8'),
    fs.readFile(paths.packageJson, 'utf8'),
    fs.readFile(paths.packageLock, 'utf8'),
  ]);

  const manifest = JSON.parse(manifestText);
  const packageJson = JSON.parse(packageJsonText);
  const packageLock = JSON.parse(packageLockText);

  const syntaxChecks = await Promise.all([
    tryExec(process.execPath, ['--check', paths.background]),
    tryExec(process.execPath, ['--check', paths.offscreen]),
    tryExec(process.execPath, ['--check', paths.server]),
    tryExec(process.execPath, ['--check', paths.cli]),
    tryExec(process.execPath, ['--check', paths.mcp]),
  ]);

  const permissionChecks = EXPECTED_MANIFEST_PERMISSIONS.map((permission) => ({
    label: 'manifest permission',
    item: permission,
    ok: manifest.permissions?.includes(permission),
  }));

  const versionChecks = [
    { label: 'manifest version', item: EXPECTED_EXTENSION_VERSION, ok: manifest.version === EXPECTED_EXTENSION_VERSION },
    { label: 'offscreen version', item: EXPECTED_EXTENSION_VERSION, ok: offscreen.includes(`EXTENSION_VERSION = '${EXPECTED_EXTENSION_VERSION}'`) },
    { label: 'server version', item: EXPECTED_EXTENSION_VERSION, ok: server.includes(`EXTENSION_VERSION = '${EXPECTED_EXTENSION_VERSION}'`) },
    { label: 'cli expected version', item: EXPECTED_EXTENSION_VERSION, ok: cli.includes(`EXPECTED_EXTENSION_VERSION = '${EXPECTED_EXTENSION_VERSION}'`) },
    { label: 'mcp version', item: EXPECTED_EXTENSION_VERSION, ok: mcp.includes(`version: '${EXPECTED_EXTENSION_VERSION}'`) },
    { label: 'package version', item: EXPECTED_EXTENSION_VERSION, ok: packageJson.version === EXPECTED_EXTENSION_VERSION },
    { label: 'package-lock root version', item: EXPECTED_EXTENSION_VERSION, ok: packageLock.version === EXPECTED_EXTENSION_VERSION && packageLock.packages?.['']?.version === EXPECTED_EXTENSION_VERSION },
  ];

  const actionChecks = EXPECTED_EXTENSION_ACTIONS.flatMap((action) => [
    { label: 'background dispatch', item: action, ok: background.includes(`case '${action}':`) },
  ]);

  const cliChecks = checkIncludes(usage(), EXPECTED_CLI_COMMANDS, 'cli usage');
  const mcpChecks = checkIncludes(mcp, EXPECTED_MCP_TOOLS, 'mcp tool');

  const safetyChecks = [
    { label: 'safety gate', item: 'requireConfirmed', ok: background.includes('function requireConfirmed') },
    { label: 'safety gate', item: 'requireSensitiveConfirmed', ok: background.includes('function requireSensitiveConfirmed') },
    { label: 'safety gate', item: 'whole cookie jar confirmSensitive', ok: background.includes("cookiesList without url/domain/name") },
    { label: 'safety gate', item: 'credentialed request confirmSensitive', ok: background.includes("credentials === 'include'") },
  ];

  const checks = [
    ...syntaxChecks.map((result, index) => ({
      label: 'syntax',
      item: [paths.background, paths.offscreen, paths.server, paths.cli, paths.mcp][index],
      ok: result.ok,
      error: result.ok ? undefined : result.error || result.stderr,
    })),
    ...permissionChecks,
    ...versionChecks,
    ...actionChecks,
    ...cliChecks,
    ...mcpChecks,
    ...safetyChecks,
  ];

  const failures = checks.filter((check) => !check.ok);
  return {
    ok: failures.length === 0,
    expectedVersion: EXPECTED_EXTENSION_VERSION,
    counts: {
      checks: checks.length,
      failures: failures.length,
      extensionActions: EXPECTED_EXTENSION_ACTIONS.length,
      cliCommands: EXPECTED_CLI_COMMANDS.length,
      mcpTools: EXPECTED_MCP_TOOLS.length,
    },
    failures,
  };
}

function smokeHtml() {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Codex Bridge Smoke</title>
    <style>
      body { font-family: system-ui, sans-serif; min-height: 1800px; padding: 24px; }
      main { max-width: 720px; }
      button, input, select { display: block; margin: 12px 0; padding: 8px; }
      #spacer { height: 1200px; }
    </style>
  </head>
  <body>
    <main id="fixture">
      <h1>Codex Bridge Smoke</h1>
      <p id="ready">Ready</p>
      <input id="smoke-input" value="">
      <p id="typed"></p>
      <p id="pressed"></p>
      <select id="smoke-select">
        <option value="a">Alpha</option>
        <option value="b">Beta</option>
      </select>
      <p id="selected"></p>
      <button id="action" type="button">Action</button>
      <p id="clicked"></p>
      <button id="coord" type="button">Coordinate Target</button>
      <p id="coord-clicked"></p>
      <button id="hover-target" type="button">Hover Target</button>
      <p id="hovered"></p>
      <div id="spacer">Full page capture area</div>
    </main>
    <script>
      localStorage.setItem('codexBridgeSmokeLocal', 'local-ok');
      sessionStorage.setItem('codexBridgeSmokeSession', 'session-ok');
      const typed = document.querySelector('#typed');
      const pressed = document.querySelector('#pressed');
      const selected = document.querySelector('#selected');
      const clicked = document.querySelector('#clicked');
      const coordClicked = document.querySelector('#coord-clicked');
      const hovered = document.querySelector('#hovered');
      document.querySelector('#smoke-input').addEventListener('input', (event) => {
        typed.textContent = event.target.value;
        typed.dataset.value = event.target.value;
      });
      document.querySelector('#smoke-input').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          pressed.textContent = 'Enter';
          pressed.dataset.key = 'Enter';
          console.log('smoke press enter');
        }
      });
      document.querySelector('#smoke-select').addEventListener('change', (event) => {
        selected.textContent = event.target.value;
        selected.dataset.value = event.target.value;
      });
      document.querySelector('#action').addEventListener('click', () => {
        clicked.textContent = 'clicked';
        clicked.dataset.value = 'clicked';
        console.log('smoke action clicked');
        fetch('/ping?source=action').catch(() => {});
      });
      document.querySelector('#coord').addEventListener('click', () => {
        coordClicked.textContent = 'coord';
        coordClicked.dataset.value = 'coord';
      });
      document.querySelector('#hover-target').addEventListener('mouseover', () => {
        hovered.textContent = 'hovered';
        hovered.dataset.value = 'hovered';
      });
    </script>
  </body>
</html>`;
}

function startSmokeServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      if (url.pathname === '/ping') {
        res.writeHead(200, {
          'content-type': 'application/json',
          'cache-control': 'no-store',
        });
        res.end(JSON.stringify({ ok: true, source: url.searchParams.get('source') || 'direct' }));
        return;
      }

      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'set-cookie': 'codex_bridge_smoke=ok; SameSite=Lax; Path=/',
      });
      res.end(smokeHtml());
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to bind smoke server'));
        return;
      }
      resolve({
        server,
        url: `http://127.0.0.1:${address.port}/`,
        pingUrl: `http://127.0.0.1:${address.port}/ping?source=request`,
      });
    });
  });
}

async function closeServer(server) {
  if (!server) return;
  await new Promise((resolve) => server.close(resolve));
}

function summarizeStepResult(value) {
  if (!value || typeof value !== 'object') return value;
  if (value.dataUrl) {
    return {
      ...value,
      dataUrl: `data:image/png;base64,<${value.dataUrl.length} chars>`,
    };
  }
  if (typeof value.text === 'string' && value.text.length > 500) {
    return {
      ...value,
      text: `${value.text.slice(0, 500)}...`,
    };
  }
  if (typeof value.html === 'string' && value.html.length > 500) {
    return {
      ...value,
      html: `${value.html.slice(0, 500)}...`,
    };
  }
  return value;
}

async function runtimeSmoke(args = {}) {
  const startedAt = new Date().toISOString();
  const health = await bridgeFetch('/health');
  const extensionVersion = health?.extension?.info?.version || null;
  if (extensionVersion !== EXPECTED_EXTENSION_VERSION) {
    return {
      ok: false,
      startedAt,
      expectedVersion: EXPECTED_EXTENSION_VERSION,
      extensionVersion,
      skipped: true,
      reason: `Reload the unpacked extension first; live extension version is ${extensionVersion || 'unknown'}`,
    };
  }

  const fixture = await startSmokeServer();
  const steps = [];
  let tabId = null;

  const run = async (name, fn, options = {}) => {
    try {
      const result = await fn();
      if (options.assert) options.assert(result);
      steps.push({ name, ok: true, result: summarizeStepResult(result) });
      return result;
    } catch (error) {
      steps.push({ name, ok: false, error: String(error?.message || error) });
      if (options.required !== false) throw error;
      return null;
    }
  };

  const expectReject = async (name, fn) => {
    try {
      const result = await fn();
      steps.push({ name, ok: false, error: 'Expected command to fail but it succeeded', result: summarizeStepResult(result) });
    } catch (error) {
      steps.push({ name, ok: true, expectedFailure: String(error?.message || error) });
    }
  };

  try {
    const opened = await run('open grouped smoke tab', () => command('open', {
      url: fixture.url,
      newTab: true,
    }, 30_000), {
      assert: (result) => {
        if (!result?.id) throw new Error('open did not return a tab id');
        if (result.group?.title !== 'Codex Bridge') throw new Error('smoke tab was not placed in Codex Bridge group');
      },
    });
    tabId = opened.id;

    await run('group includes smoke tab', () => command('group', {}, 10_000), {
      assert: (result) => {
        if (!result.tabs?.some((tab) => tab.id === tabId)) throw new Error('group does not include smoke tab');
      },
    });
    await run('tabs scoped includes smoke tab', () => command('tabs', {}, 10_000), {
      assert: (result) => {
        if (result.scope !== 'codex-group') throw new Error('tabs is not scoped to codex-group');
        if (!result.tabs?.some((tab) => tab.id === tabId)) throw new Error('scoped tabs does not include smoke tab');
      },
    });
    await run('wait for ready selector', () => command('waitForSelector', {
      tabId,
      selector: '#ready',
    }, 30_000));
    await run('text extraction', () => command('text', { tabId, maxChars: 5_000 }, 30_000), {
      assert: (result) => {
        if (!result.text?.includes('Codex Bridge Smoke')) throw new Error('text did not include fixture title');
      },
    });
    await run('html extraction', () => command('html', { tabId, selector: '#fixture', maxChars: 20_000 }, 30_000), {
      assert: (result) => {
        if (!result.html?.includes('smoke-input')) throw new Error('html did not include fixture input');
      },
    });
    await run('snapshot extraction', () => command('snapshot', { tabId, maxChars: 10_000 }, 30_000), {
      assert: (result) => {
        if (!result.elements?.some((element) => element.selector === '#action')) throw new Error('snapshot did not include action button');
      },
    });
    await run('viewport screenshot', () => command('screenshot', { tabId }, 30_000), {
      assert: (result) => {
        if (!String(result.dataUrl || '').startsWith('data:image/png;base64,')) throw new Error('viewport screenshot was not a PNG data URL');
      },
    });
    await run('full page screenshot', () => command('screenshot', { tabId, fullPage: true }, 60_000), {
      assert: (result) => {
        if (!String(result.dataUrl || '').startsWith('data:image/png;base64,')) throw new Error('full-page screenshot was not a PNG data URL');
      },
    });
    await run('selector screenshot', () => command('screenshot', { tabId, selector: '#fixture' }, 60_000), {
      assert: (result) => {
        if (!String(result.dataUrl || '').startsWith('data:image/png;base64,')) throw new Error('selector screenshot was not a PNG data URL');
      },
    });

    await run('hover selector', () => command('hover', { tabId, selector: '#hover-target' }, 30_000));
    await run('wait for hover side-effect', () => command('waitForSelector', {
      tabId,
      selector: '#hovered[data-value="hovered"]',
    }, 30_000));
    await run('type trusted', () => command('type', {
      tabId,
      selector: '#smoke-input',
      text: 'hello',
      trusted: true,
      confirmed: true,
    }, 30_000));
    await run('wait for type side-effect', () => command('waitForSelector', {
      tabId,
      selector: '#typed[data-value="hello"]',
    }, 30_000));
    await run('press trusted', () => command('press', {
      tabId,
      selector: '#smoke-input',
      key: 'Enter',
      trusted: true,
      confirmed: true,
    }, 30_000));
    await run('wait for press side-effect', () => command('waitForSelector', {
      tabId,
      selector: '#pressed[data-key="Enter"]',
    }, 30_000));
    await run('select option', () => command('select', {
      tabId,
      selector: '#smoke-select',
      value: 'b',
      confirmed: true,
    }, 30_000));
    await run('wait for select side-effect', () => command('waitForSelector', {
      tabId,
      selector: '#selected[data-value="b"]',
    }, 30_000));

    await run('trace start', () => command('traceStart', {
      tabId,
      confirmed: true,
      maxEvents: 100,
    }, 30_000));
    await run('click selector', () => command('click', {
      tabId,
      selector: '#action',
      confirmed: true,
    }, 30_000));
    await run('wait for click side-effect', () => command('waitForSelector', {
      tabId,
      selector: '#clicked[data-value="clicked"]',
    }, 30_000));
    const coord = await run('wait for coordinate target', () => command('waitForSelector', {
      tabId,
      selector: '#coord',
    }, 30_000));
    await run('click coordinates', () => command('clickAt', {
      tabId,
      x: Math.round(coord.rect.x + coord.rect.width / 2),
      y: Math.round(coord.rect.y + coord.rect.height / 2),
      confirmed: true,
    }, 30_000));
    await run('wait for coordinate click side-effect', () => command('waitForSelector', {
      tabId,
      selector: '#coord-clicked[data-value="coord"]',
    }, 30_000));
    await run('trace events', () => command('traceEvents', { tabId, limit: 100 }, 30_000), {
      assert: (result) => {
        const events = result.events || [];
        if (!events.some((event) => event.kind === 'console')) throw new Error('trace did not capture console events');
        if (!events.some((event) => String(event.kind).startsWith('network.'))) throw new Error('trace did not capture network events');
      },
    });
    await run('trace stop', () => command('traceStop', { tabId, limit: 100 }, 30_000));

    await run('storage keys', () => command('storageSnapshot', {
      tabId,
      confirmed: true,
    }, 30_000), {
      assert: (result) => {
        if (!result.localStorage?.some((item) => item.key === 'codexBridgeSmokeLocal')) throw new Error('localStorage key missing');
        if (!result.sessionStorage?.some((item) => item.key === 'codexBridgeSmokeSession')) throw new Error('sessionStorage key missing');
      },
    });
    await run('cookies metadata by url', () => command('cookiesList', {
      url: fixture.url,
      name: 'codex_bridge_smoke',
      confirmed: true,
      limit: 20,
    }, 30_000), {
      assert: (result) => {
        if (!result.cookies?.some((cookie) => cookie.name === 'codex_bridge_smoke')) throw new Error('smoke cookie metadata missing');
      },
    });
    await run('extension-context request', () => command('fetchUrl', {
      url: fixture.pingUrl,
      confirmed: true,
      maxChars: 5_000,
    }, 30_000), {
      assert: (result) => {
        if (!result.ok || !result.text?.includes('"ok":true')) throw new Error('request did not return smoke JSON');
      },
    });
    await run('history search scoped to fixture url', () => command('historySearch', {
      query: fixture.url,
      confirmed: true,
      limit: 20,
    }, 30_000), {
      assert: (result) => {
        if (!Array.isArray(result.results)) throw new Error('history search did not return a results array');
        if (!result.results.some((item) => item.url === fixture.url)) throw new Error('history search did not include fixture URL');
      },
    });
    await run('bookmarks search unique empty query', () => command('bookmarksSearch', {
      query: `codex-bridge-smoke-${Date.now()}`,
      confirmed: true,
      limit: 5,
    }, 30_000), {
      assert: (result) => {
        if (!Array.isArray(result.results)) throw new Error('bookmarks search did not return a results array');
      },
    });

    await expectReject('safety: cookies whole jar requires confirmSensitive', () => command('cookiesList', {
      confirmed: true,
    }, 30_000));
    await expectReject('safety: storage values require confirmSensitive', () => command('storageSnapshot', {
      tabId,
      confirmed: true,
      includeValues: true,
    }, 30_000));
    await expectReject('safety: credentialed request requires confirmSensitive', () => command('fetchUrl', {
      url: fixture.pingUrl,
      confirmed: true,
      credentials: 'include',
    }, 30_000));
  } finally {
    if (tabId && !args['keep-tab']) {
      await run('cleanup close smoke tab', () => command('closeTab', {
        tabId,
        confirmed: true,
      }, 30_000), { required: false });
    }
    await closeServer(fixture.server);
  }

  const failures = steps.filter((step) => !step.ok);
  return {
    ok: failures.length === 0,
    startedAt,
    finishedAt: new Date().toISOString(),
    expectedVersion: EXPECTED_EXTENSION_VERSION,
    extensionVersion,
    fixtureUrl: fixture.url,
    tabId,
    keptTab: Boolean(args['keep-tab']),
    counts: {
      steps: steps.length,
      failures: failures.length,
    },
    failures,
    steps,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [cmd, first] = args._;

  if (!cmd || cmd === '-h' || cmd === '--help' || cmd === 'help') {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  if (cmd === 'server') {
    const port = Number(args.port || process.env.CHROME_BRIDGE_PORT || 17376);
    const bridge = await startBridgeServer({ port });
    process.stdout.write(`Chrome bridge listening on http://${bridge.host}:${bridge.port}\n`);
    process.stdout.write(`Load this unpacked extension in Chrome: ${path.join(rootDir, 'extension')}\n`);
    process.stdout.write('Waiting for extension connection...\n');
    process.on('SIGINT', async () => {
      await bridge.close().catch(() => {});
      process.exit(0);
    });
    return;
  }

  if (cmd === 'extension-path') {
    process.stdout.write(`${path.join(rootDir, 'extension')}\n`);
    return;
  }

  if (cmd === 'codex-config') {
    process.stdout.write(`[mcp_servers.chrome-bridge]
command = "/opt/homebrew/bin/node"
args = ["${path.join(rootDir, 'mcp/chrome-bridge-mcp.mjs')}"]
startup_timeout_sec = 20
tool_timeout_sec = 60
`);
    return;
  }

  if (cmd === 'doctor') {
    printJson(await doctor(args));
    return;
  }

  if (cmd === 'self-test') {
    const result = await selfTest();
    printJson(result);
    if (!result.ok) process.exitCode = 1;
    return;
  }

  if (cmd === 'runtime-smoke') {
    const result = await runtimeSmoke(args);
    printJson(result);
    if (!result.ok) process.exitCode = 1;
    return;
  }

  if (cmd === 'health') {
    printJson(await bridgeFetch('/health'));
    return;
  }

  if (cmd === 'reload-extension') {
    printJson(await command('reloadExtension', {}, 5_000));
    return;
  }

  if (cmd === 'tabs') {
    printJson(await command('tabs', {
      includeAll: Boolean(args.all),
    }));
    return;
  }

  if (cmd === 'group') {
    printJson(await command('group', {
      includeTabs: Boolean(args.tabs),
    }));
    return;
  }

  if (cmd === 'ensure-tab') {
    printJson(await command('ensureTab', {
      url: first,
      active: Boolean(args.active),
    }, 30_000));
    return;
  }

  if (cmd === 'open') {
    if (!first) throw new Error('open requires a URL');
    if (args.new && args.tab) throw new Error('open cannot use --new and --tab together');
    printJson(await command('open', {
      url: first,
      ...targetPayload(args),
      active: Boolean(args.active),
      newTab: Boolean(args.new),
    }, 30_000));
    return;
  }

  if (cmd === 'activate') {
    printJson(await command('activateTab', {
      ...targetPayload(args),
      focusWindow: Boolean(args['focus-window']),
    }));
    return;
  }

  if (cmd === 'close-tab') {
    if (!args.confirm) throw new Error('close-tab requires --confirm');
    printJson(await command('closeTab', {
      ...targetPayload(args),
      ...confirmationPayload(args),
    }));
    return;
  }

  if (cmd === 'close-group') {
    if (!args.confirm) throw new Error('close-group requires --confirm');
    printJson(await command('closeGroup', confirmationPayload(args)));
    return;
  }

  if (cmd === 'back' || cmd === 'forward') {
    printJson(await command(cmd === 'back' ? 'goBack' : 'goForward', targetPayload(args), 30_000));
    return;
  }

  if (cmd === 'reload') {
    printJson(await command('reloadTab', {
      ...targetPayload(args),
      bypassCache: Boolean(args['bypass-cache']),
    }, 30_000));
    return;
  }

  if (cmd === 'wait') {
    if (!args.selector) throw new Error('wait requires --selector <css>');
    printJson(await command('waitForSelector', {
      ...targetPayload(args),
      selector: args.selector,
      timeoutMs: args['timeout-ms'] ? Number(args['timeout-ms']) : undefined,
      visible: !args['hidden-ok'],
    }, 30_000));
    return;
  }

  if (cmd === 'snapshot' || cmd === 'text') {
    printJson(await command(cmd, {
      ...targetPayload(args),
      maxChars: args['max-chars'] ? Number(args['max-chars']) : undefined,
    }, 30_000));
    return;
  }

  if (cmd === 'html') {
    printJson(await command('html', {
      ...targetPayload(args),
      selector: args.selector,
      maxChars: args['max-chars'] ? Number(args['max-chars']) : undefined,
      outer: !args.inner,
    }, 30_000));
    return;
  }

  if (cmd === 'screenshot') {
    if (!args.out) throw new Error('screenshot requires --out <file>');
    const result = await command('screenshot', {
      ...targetPayload(args),
      fullPage: Boolean(args['full-page']),
      selector: args.selector,
    }, args['full-page'] || args.selector ? 60_000 : 30_000);
    const match = /^data:image\/png;base64,(.+)$/.exec(result.dataUrl || '');
    if (!match) throw new Error('Extension returned an invalid PNG data URL');
    await fs.mkdir(path.dirname(path.resolve(args.out)), { recursive: true });
    await fs.writeFile(args.out, Buffer.from(match[1], 'base64'));
    printJson({ ...result, dataUrl: undefined, out: path.resolve(args.out) });
    return;
  }

  if (cmd === 'scroll') {
    printJson(await command('scroll', {
      ...targetPayload(args),
      x: args.x ? Number(args.x) : 0,
      y: args.y ? Number(args.y) : 0,
    }));
    return;
  }

  if (cmd === 'click') {
    if (!args.confirm) throw new Error('click requires --confirm');
    if (!args.selector) throw new Error('click requires --selector <css>');
    printJson(await command('click', {
      ...targetPayload(args),
      selector: args.selector,
      ...confirmationPayload(args),
    }));
    return;
  }

  if (cmd === 'click-at') {
    if (!args.confirm) throw new Error('click-at requires --confirm');
    printJson(await command('clickAt', {
      ...targetPayload(args),
      ...confirmationPayload(args),
      x: args.x === undefined ? undefined : Number(args.x),
      y: args.y === undefined ? undefined : Number(args.y),
      button: args.button,
      trusted: Boolean(args.trusted),
    }, 30_000));
    return;
  }

  if (cmd === 'hover') {
    printJson(await command('hover', {
      ...targetPayload(args),
      selector: args.selector,
      x: args.x === undefined ? undefined : Number(args.x),
      y: args.y === undefined ? undefined : Number(args.y),
      trusted: Boolean(args.trusted),
    }, 30_000));
    return;
  }

  if (cmd === 'type') {
    if (!args.confirm) throw new Error('type requires --confirm');
    if (!args.selector || typeof args.text !== 'string') {
      throw new Error('type requires --selector <css> --text <text>');
    }
    printJson(await command('type', {
      ...targetPayload(args),
      selector: args.selector,
      text: args.text,
      trusted: Boolean(args.trusted),
      ...confirmationPayload(args),
    }));
    return;
  }

  if (cmd === 'press') {
    if (!args.confirm) throw new Error('press requires --confirm');
    if (!args.key) throw new Error('press requires --key <key>');
    printJson(await command('press', {
      ...targetPayload(args),
      ...confirmationPayload(args),
      selector: args.selector,
      key: args.key,
      code: args.code,
      ctrlKey: Boolean(args.ctrl),
      metaKey: Boolean(args.meta),
      altKey: Boolean(args.alt),
      shiftKey: Boolean(args.shift),
      trusted: !args.dom,
    }, 30_000));
    return;
  }

  if (cmd === 'select') {
    if (!args.confirm) throw new Error('select requires --confirm');
    if (!args.selector) throw new Error('select requires --selector <css>');
    printJson(await command('select', {
      ...targetPayload(args),
      ...confirmationPayload(args),
      selector: args.selector,
      value: args.value,
      label: args.label,
      index: args.index === undefined ? undefined : Number(args.index),
    }, 30_000));
    return;
  }

  if (cmd === 'trace-start') {
    if (!args.confirm) throw new Error('trace-start requires --confirm');
    printJson(await command('traceStart', {
      ...targetPayload(args),
      ...confirmationPayload(args),
      maxEvents: args['max-events'] ? Number(args['max-events']) : undefined,
      network: !args['no-network'],
      console: !args['no-console'],
      includeExtensionEvents: Boolean(args['include-extension-events']),
    }, 30_000));
    return;
  }

  if (cmd === 'trace-events' || cmd === 'trace-stop') {
    printJson(await command(cmd === 'trace-events' ? 'traceEvents' : 'traceStop', {
      ...targetPayload(args),
      limit: args.limit ? Number(args.limit) : undefined,
    }, 30_000));
    return;
  }

  if (cmd === 'history') {
    if (!args.confirm) throw new Error('history requires --confirm');
    printJson(await command('historySearch', {
      ...confirmationPayload(args),
      query: args.query || '',
      limit: args.limit ? Number(args.limit) : undefined,
    }, 30_000));
    return;
  }

  if (cmd === 'bookmarks') {
    if (!args.confirm) throw new Error('bookmarks requires --confirm');
    printJson(await command('bookmarksSearch', {
      ...confirmationPayload(args),
      query: args.query || '',
      limit: args.limit ? Number(args.limit) : undefined,
    }, 30_000));
    return;
  }

  if (cmd === 'cookies') {
    if (!args.confirm) throw new Error('cookies requires --confirm');
    printJson(await command('cookiesList', {
      ...confirmationPayload(args),
      url: args.url,
      domain: args.domain,
      name: args.name,
      includeValues: Boolean(args['include-values']),
      limit: args.limit ? Number(args.limit) : undefined,
    }, 30_000));
    return;
  }

  if (cmd === 'storage') {
    if (!args.confirm) throw new Error('storage requires --confirm');
    printJson(await command('storageSnapshot', {
      ...targetPayload(args),
      ...confirmationPayload(args),
      includeValues: Boolean(args['include-values']),
      maxValueChars: args['max-value-chars'] ? Number(args['max-value-chars']) : undefined,
    }, 30_000));
    return;
  }

  if (cmd === 'request') {
    if (!first) throw new Error('request requires a URL');
    if (!args.confirm) throw new Error('request requires --confirm');
    printJson(await command('fetchUrl', {
      ...confirmationPayload(args),
      url: first,
      method: args.method,
      headers: parseJsonOption(args['headers-json'], '--headers-json'),
      body: args.body,
      credentials: args.credentials,
      maxChars: args['max-chars'] ? Number(args['max-chars']) : undefined,
    }, 60_000));
    return;
  }

  throw new Error(`Unknown command: ${cmd}`);
}

main().catch((error) => {
  process.stderr.write(`${String(error?.stack || error)}\n`);
  process.exit(1);
});
