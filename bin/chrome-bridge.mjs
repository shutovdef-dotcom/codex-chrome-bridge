#!/usr/bin/env node
import fs from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { startBridgeServer } from '../server/bridge-server.mjs';
import {
  BRIDGE_VERSION,
  CLI_COMMANDS,
  CLI_USAGE_GROUPS,
  CLI_USAGE_LINES,
  COMMAND_CATALOG,
  COMMAND_METADATA,
  DEBUGGER_SERIALIZED_ACTIONS,
  EXTENSION_ACTIONS,
  HTTP_METHODS,
  MANIFEST_PERMISSIONS,
  MCP_TOOLS,
  commandCatalog,
  commandCatalogMarkdown,
  commandDefaultTimeoutMs,
} from '../shared/command-registry.mjs';

const DEFAULT_ENDPOINT = process.env.CHROME_BRIDGE_URL || 'http://127.0.0.1:17376';
const EXPECTED_EXTENSION_VERSION = BRIDGE_VERSION;

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const execFileAsync = promisify(execFile);

function usage() {
  return [
    'Usage:',
    ...CLI_USAGE_LINES.map((line) => `  ${line}`),
  ].join('\n');
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
    const error = new Error(json.error || `Bridge returned HTTP ${response.status}`);
    error.code = json.code;
    error.details = json.details;
    throw error;
  }
  return json;
}

async function command(action, payload = {}, timeoutMs) {
  const effectiveTimeoutMs = timeoutMs ?? commandDefaultTimeoutMs(action);
  const json = await bridgeFetch('/command', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, payload, timeoutMs: effectiveTimeoutMs }),
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
  const payload = {
    confirmed: Boolean(args.confirm),
  };
  if (args['confirm-sensitive']) payload.confirmSensitive = true;
  return payload;
}

function parseJsonOption(value, name) {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${name} must be valid JSON: ${String(error?.message || error)}`);
  }
}

function normalizeHttpMethod(value) {
  if (value === undefined) return undefined;
  const method = String(value).toUpperCase();
  if (!HTTP_METHODS.includes(method)) {
    throw new Error(`--method must be one of: ${HTTP_METHODS.join(', ')}`);
  }
  return method;
}

function tomlString(value) {
  return JSON.stringify(String(value));
}

const EXPECTED_MANIFEST_PERMISSIONS = MANIFEST_PERMISSIONS;
const EXPECTED_EXTENSION_ACTIONS = EXTENSION_ACTIONS;
const EXPECTED_CLI_COMMANDS = CLI_COMMANDS;
const EXPECTED_MCP_TOOLS = MCP_TOOLS;

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
  const includeLiveChecks = Boolean(args['live-checks']);
  const health = includeLiveChecks
    ? await bridgeFetch('/health').catch((error) => ({
      ok: false,
      error: String(error?.message || error),
    }))
    : {
      ok: null,
      skipped: true,
      reason: 'Pass --live-checks when no other session is using the bridge.',
    };

  const appleEvents = includeLiveChecks
    ? await tryExec('osascript', [
      '-e',
      'tell application "Google Chrome" to execute active tab of front window javascript "document.title"',
    ], { timeout: 3_000 })
    : {
      ok: null,
      skipped: true,
      reason: 'Pass --live-checks to probe real Chrome Apple Events settings.',
    };

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

  const extensionConnected = includeLiveChecks ? Boolean(health?.extension?.connected) : null;
  const extensionVersion = health?.extension?.info?.version || null;
  const extensionCurrent = includeLiveChecks ? extensionVersion === EXPECTED_EXTENSION_VERSION : null;
  const appleEventsJsEnabled = includeLiveChecks ? appleEvents.ok : null;

  return {
    bridgeUrl: DEFAULT_ENDPOINT,
    extensionPath,
    liveChecks: includeLiveChecks,
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
    nextActions: !includeLiveChecks ? [
      'Run chrome-bridge self-test for offline project verification.',
      'Run chrome-bridge runtime-smoke --coverage-plan for the offline live-smoke checklist.',
      'Pass --live-checks only when no other Codex session is actively using the bridge.',
      'Run chrome-bridge health and runtime-smoke later for final live verification.',
    ] : extensionConnected && extensionCurrent ? [
      'Run chrome-bridge runtime-smoke for full local runtime verification.',
      'Run ensure-tab/open/snapshot/screenshot commands for task-specific work.',
      'For future extension file edits, run chrome-bridge reload-extension --confirm.',
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
    browserData: path.join(rootDir, 'extension/browser-data.js'),
    debuggerSession: path.join(rootDir, 'extension/debugger-session.js'),
    extensionErrors: path.join(rootDir, 'extension/extension-errors.js'),
    keyboardEvents: path.join(rootDir, 'extension/keyboard-events.js'),
    navigationActions: path.join(rootDir, 'extension/navigation-actions.js'),
    offscreenLifecycle: path.join(rootDir, 'extension/offscreen-lifecycle.js'),
    pageExecution: path.join(rootDir, 'extension/page-execution.js'),
    pageArtifacts: path.join(rootDir, 'extension/page-artifacts.js'),
    pageReadActions: path.join(rootDir, 'extension/page-read-actions.js'),
    pageInteractions: path.join(rootDir, 'extension/page-interactions.js'),
    pageScripts: path.join(rootDir, 'extension/page-scripts.js'),
    runtimeActions: path.join(rootDir, 'extension/runtime-actions.js'),
    safetyGates: path.join(rootDir, 'extension/safety-gates.js'),
    tabCleanup: path.join(rootDir, 'extension/tab-cleanup.js'),
    tabGroupPersistence: path.join(rootDir, 'extension/tab-group-persistence.js'),
    tabInfo: path.join(rootDir, 'extension/tab-info.js'),
    tabLoading: path.join(rootDir, 'extension/tab-loading.js'),
    traceActions: path.join(rootDir, 'extension/trace-actions.js'),
    userPrompts: path.join(rootDir, 'extension/user-prompts.js'),
    workspacePolicy: path.join(rootDir, 'extension/workspace-policy.js'),
    workspaceTabs: path.join(rootDir, 'extension/workspace-tabs.js'),
    offscreen: path.join(rootDir, 'extension/offscreen.js'),
    ask: path.join(rootDir, 'extension/ask.js'),
    server: path.join(rootDir, 'server/bridge-server.mjs'),
    cli: path.join(rootDir, 'bin/chrome-bridge.mjs'),
    mcp: path.join(rootDir, 'mcp/chrome-bridge-mcp.mjs'),
    registry: path.join(rootDir, 'shared/command-registry.mjs'),
    commandCatalogDoc: path.join(rootDir, 'docs/COMMAND-CATALOG.md'),
    commandCatalogGenerator: path.join(rootDir, 'scripts/generate-command-catalog.mjs'),
    bridgeContractChecker: path.join(rootDir, 'scripts/check-bridge-contract.mjs'),
    docsCoverageChecker: path.join(rootDir, 'scripts/check-docs-coverage.mjs'),
    packageContentsChecker: path.join(rootDir, 'scripts/check-package-contents.mjs'),
    privacyScanner: path.join(rootDir, 'scripts/check-privacy-scan.mjs'),
    packageJson: path.join(rootDir, 'package.json'),
    packageLock: path.join(rootDir, 'package-lock.json'),
  };

  const [
    manifestText,
    background,
    browserData,
    debuggerSession,
    extensionErrors,
    keyboardEvents,
    navigationActions,
    offscreenLifecycle,
    pageExecution,
    pageArtifacts,
    pageReadActions,
    pageInteractions,
    pageScripts,
    runtimeActions,
    safetyGates,
    tabCleanup,
    tabGroupPersistence,
    tabInfo,
    tabLoading,
    traceActions,
    userPrompts,
    workspacePolicy,
    workspaceTabs,
    offscreen,
    ask,
    server,
    cli,
    mcp,
    registry,
    commandCatalogDoc,
    bridgeContractChecker,
    packageJsonText,
    packageLockText,
  ] = await Promise.all([
    fs.readFile(paths.manifest, 'utf8'),
    fs.readFile(paths.background, 'utf8'),
    fs.readFile(paths.browserData, 'utf8'),
    fs.readFile(paths.debuggerSession, 'utf8'),
    fs.readFile(paths.extensionErrors, 'utf8'),
    fs.readFile(paths.keyboardEvents, 'utf8'),
    fs.readFile(paths.navigationActions, 'utf8'),
    fs.readFile(paths.offscreenLifecycle, 'utf8'),
    fs.readFile(paths.pageExecution, 'utf8'),
    fs.readFile(paths.pageArtifacts, 'utf8'),
    fs.readFile(paths.pageReadActions, 'utf8'),
    fs.readFile(paths.pageInteractions, 'utf8'),
    fs.readFile(paths.pageScripts, 'utf8'),
    fs.readFile(paths.runtimeActions, 'utf8'),
    fs.readFile(paths.safetyGates, 'utf8'),
    fs.readFile(paths.tabCleanup, 'utf8'),
    fs.readFile(paths.tabGroupPersistence, 'utf8'),
    fs.readFile(paths.tabInfo, 'utf8'),
    fs.readFile(paths.tabLoading, 'utf8'),
    fs.readFile(paths.traceActions, 'utf8'),
    fs.readFile(paths.userPrompts, 'utf8'),
    fs.readFile(paths.workspacePolicy, 'utf8'),
    fs.readFile(paths.workspaceTabs, 'utf8'),
    fs.readFile(paths.offscreen, 'utf8'),
    fs.readFile(paths.ask, 'utf8'),
    fs.readFile(paths.server, 'utf8'),
    fs.readFile(paths.cli, 'utf8'),
    fs.readFile(paths.mcp, 'utf8'),
    fs.readFile(paths.registry, 'utf8'),
    fs.readFile(paths.commandCatalogDoc, 'utf8'),
    fs.readFile(paths.bridgeContractChecker, 'utf8'),
    fs.readFile(paths.packageJson, 'utf8'),
    fs.readFile(paths.packageLock, 'utf8'),
  ]);

  const manifest = JSON.parse(manifestText);
  const packageJson = JSON.parse(packageJsonText);
  const packageLock = JSON.parse(packageLockText);

  const syntaxChecks = await Promise.all([
    tryExec(process.execPath, ['--check', paths.background]),
    tryExec(process.execPath, ['--check', paths.browserData]),
    tryExec(process.execPath, ['--check', paths.debuggerSession]),
    tryExec(process.execPath, ['--check', paths.extensionErrors]),
    tryExec(process.execPath, ['--check', paths.keyboardEvents]),
    tryExec(process.execPath, ['--check', paths.navigationActions]),
    tryExec(process.execPath, ['--check', paths.offscreenLifecycle]),
    tryExec(process.execPath, ['--check', paths.pageExecution]),
    tryExec(process.execPath, ['--check', paths.pageArtifacts]),
    tryExec(process.execPath, ['--check', paths.pageReadActions]),
    tryExec(process.execPath, ['--check', paths.pageInteractions]),
    tryExec(process.execPath, ['--check', paths.pageScripts]),
    tryExec(process.execPath, ['--check', paths.runtimeActions]),
    tryExec(process.execPath, ['--check', paths.safetyGates]),
    tryExec(process.execPath, ['--check', paths.tabCleanup]),
    tryExec(process.execPath, ['--check', paths.tabGroupPersistence]),
    tryExec(process.execPath, ['--check', paths.tabInfo]),
    tryExec(process.execPath, ['--check', paths.tabLoading]),
    tryExec(process.execPath, ['--check', paths.traceActions]),
    tryExec(process.execPath, ['--check', paths.userPrompts]),
    tryExec(process.execPath, ['--check', paths.workspacePolicy]),
    tryExec(process.execPath, ['--check', paths.workspaceTabs]),
    tryExec(process.execPath, ['--check', paths.offscreen]),
    tryExec(process.execPath, ['--check', paths.ask]),
    tryExec(process.execPath, ['--check', paths.server]),
    tryExec(process.execPath, ['--check', paths.cli]),
    tryExec(process.execPath, ['--check', paths.mcp]),
    tryExec(process.execPath, ['--check', paths.registry]),
    tryExec(process.execPath, ['--check', paths.commandCatalogGenerator]),
    tryExec(process.execPath, ['--check', paths.bridgeContractChecker]),
    tryExec(process.execPath, ['--check', paths.docsCoverageChecker]),
    tryExec(process.execPath, ['--check', paths.packageContentsChecker]),
    tryExec(process.execPath, ['--check', paths.privacyScanner]),
  ]);

  const permissionChecks = EXPECTED_MANIFEST_PERMISSIONS.map((permission) => ({
    label: 'manifest permission',
    item: permission,
    ok: manifest.permissions?.includes(permission),
  }));

  const versionChecks = [
    { label: 'manifest version', item: EXPECTED_EXTENSION_VERSION, ok: manifest.version === EXPECTED_EXTENSION_VERSION },
    { label: 'offscreen version', item: EXPECTED_EXTENSION_VERSION, ok: offscreen.includes(`EXTENSION_VERSION = '${EXPECTED_EXTENSION_VERSION}'`) },
    { label: 'ask page script', item: 'codex-bridge-user-answer', ok: ask.includes('codex-bridge-user-answer') },
    { label: 'extension module', item: 'browser data imports', ok: background.includes("from './browser-data.js'") },
    { label: 'extension module', item: 'browser data exports', ok: browserData.includes('export async function historySearch') && browserData.includes('export async function cookiesList') },
    { label: 'extension module', item: 'debugger session imports', ok: background.includes("from './debugger-session.js'") },
    { label: 'extension module', item: 'debugger session exports', ok: debuggerSession.includes('export async function withDebugger') && debuggerSession.includes('export function recordDebuggerEvent') },
    { label: 'extension module', item: 'extension error imports', ok: background.includes("from './extension-errors.js'") },
    { label: 'extension module', item: 'extension error exports', ok: extensionErrors.includes('export function extensionErrorCode') },
    { label: 'extension module', item: 'keyboard events imports', ok: pageInteractions.includes("from './keyboard-events.js'") },
    { label: 'extension module', item: 'keyboard events exports', ok: keyboardEvents.includes('export function keyEventPayload') },
    { label: 'extension module', item: 'navigation action imports', ok: background.includes("from './navigation-actions.js'") },
    { label: 'extension module', item: 'navigation action exports', ok: navigationActions.includes('export async function openTab') && navigationActions.includes('export async function closeGroup') },
    { label: 'extension module', item: 'offscreen lifecycle imports', ok: background.includes("from './offscreen-lifecycle.js'") },
    { label: 'extension module', item: 'offscreen lifecycle exports', ok: offscreenLifecycle.includes('export async function startBridge') },
    { label: 'extension module', item: 'page execution imports', ok: pageInteractions.includes("from './page-execution.js'") },
    { label: 'extension module', item: 'page execution exports', ok: pageExecution.includes('export async function execute') },
    { label: 'extension module', item: 'page artifact imports', ok: background.includes("from './page-artifacts.js'") },
    { label: 'extension module', item: 'page artifact exports', ok: pageArtifacts.includes('export async function screenshot') && pageArtifacts.includes('export async function printPdf') },
    { label: 'extension module', item: 'page read action imports', ok: background.includes("from './page-read-actions.js'") },
    { label: 'extension module', item: 'page read action exports', ok: pageReadActions.includes('export async function observe') && pageReadActions.includes('export async function storageSnapshot') },
    { label: 'extension module', item: 'page interaction imports', ok: background.includes("from './page-interactions.js'") },
    { label: 'extension module', item: 'page interaction exports', ok: pageInteractions.includes('export async function click') && pageInteractions.includes('export async function uploadFile') },
    { label: 'extension module', item: 'page script imports', ok: pageReadActions.includes("from './page-scripts.js'") && pageInteractions.includes("from './page-scripts.js'") },
    { label: 'extension module', item: 'page script exports', ok: pageScripts.includes('export function collectSnapshot') },
    { label: 'extension module', item: 'runtime action imports', ok: background.includes("from './runtime-actions.js'") },
    { label: 'extension module', item: 'runtime action exports', ok: runtimeActions.includes('export function reloadExtension') },
    { label: 'extension module', item: 'safety gates imports', ok: runtimeActions.includes("from './safety-gates.js'") },
    { label: 'extension module', item: 'safety gates exports', ok: safetyGates.includes('export function requireConfirmed') },
    { label: 'extension module', item: 'tab cleanup imports', ok: navigationActions.includes("from './tab-cleanup.js'") },
    { label: 'extension module', item: 'tab cleanup exports', ok: tabCleanup.includes('export async function closeTabsWithGroupPersistenceMitigation') },
    { label: 'extension module', item: 'tab cleanup fail closed', ok: tabCleanup.includes('throw new Error') && tabCleanup.includes('before close') },
    { label: 'extension module', item: 'tab group persistence imports', ok: tabCleanup.includes("from './tab-group-persistence.js'") && workspaceTabs.includes("from './tab-group-persistence.js'") },
    { label: 'extension module', item: 'tab group persistence exports', ok: tabGroupPersistence.includes('export async function disableSavedTabGroupIfSupported') && tabGroupPersistence.includes('export async function disableSavedTabGroupsForTabs') },
    { label: 'extension module', item: 'tab info imports', ok: pageInteractions.includes("from './tab-info.js'") && navigationActions.includes("from './tab-info.js'") },
    { label: 'extension module', item: 'tab info exports', ok: tabInfo.includes('export function tabInfo') && tabInfo.includes('export function groupInfo') },
    { label: 'extension module', item: 'tab loading imports', ok: navigationActions.includes("from './tab-loading.js'") },
    { label: 'extension module', item: 'tab loading exports', ok: tabLoading.includes('export async function waitForTabComplete') },
    { label: 'extension module', item: 'trace action imports', ok: background.includes("from './trace-actions.js'") },
    { label: 'extension module', item: 'trace action exports', ok: traceActions.includes('export async function traceStart') && traceActions.includes('export async function traceStop') },
    { label: 'extension module', item: 'user prompt imports', ok: background.includes("from './user-prompts.js'") },
    { label: 'extension module', item: 'user prompt exports', ok: userPrompts.includes('export async function askUser') && userPrompts.includes('export function completeUserPrompt') },
    { label: 'extension module', item: 'workspace policy imports', ok: navigationActions.includes("from './workspace-policy.js'") },
    { label: 'extension module', item: 'workspace policy exports', ok: workspacePolicy.includes('export async function groupOptions') },
    { label: 'extension module', item: 'workspace tabs imports', ok: navigationActions.includes("from './workspace-tabs.js'") && pageInteractions.includes("from './workspace-tabs.js'") && traceActions.includes("from './workspace-tabs.js'") },
    { label: 'extension module', item: 'workspace tabs exports', ok: workspaceTabs.includes('export async function getTargetTab') && workspaceTabs.includes('export async function ensureCodexGroupForTab') },
    { label: 'registry version', item: EXPECTED_EXTENSION_VERSION, ok: registry.includes(`BRIDGE_VERSION = '${EXPECTED_EXTENSION_VERSION}'`) },
    { label: 'server registry version', item: EXPECTED_EXTENSION_VERSION, ok: server.includes('BRIDGE_VERSION') },
    { label: 'cli registry version', item: EXPECTED_EXTENSION_VERSION, ok: cli.includes('EXPECTED_EXTENSION_VERSION = BRIDGE_VERSION') },
    { label: 'mcp registry version', item: EXPECTED_EXTENSION_VERSION, ok: mcp.includes('version: BRIDGE_VERSION') },
    { label: 'package version', item: EXPECTED_EXTENSION_VERSION, ok: packageJson.version === EXPECTED_EXTENSION_VERSION },
    { label: 'package-lock root version', item: EXPECTED_EXTENSION_VERSION, ok: packageLock.version === EXPECTED_EXTENSION_VERSION && packageLock.packages?.['']?.version === EXPECTED_EXTENSION_VERSION },
  ];

  const actionChecks = EXPECTED_EXTENSION_ACTIONS.flatMap((action) => [
    { label: 'background dispatch', item: action, ok: background.includes(`case '${action}':`) },
  ]);

  const cliChecks = checkIncludes(usage(), EXPECTED_CLI_COMMANDS, 'cli usage');
  const mcpChecks = checkIncludes(mcp, EXPECTED_MCP_TOOLS, 'mcp tool');
  const registryChecks = [
    {
      label: 'registry',
      item: 'command metadata parity',
      ok: Object.keys(COMMAND_METADATA).length === EXPECTED_EXTENSION_ACTIONS.length,
    },
    {
      label: 'registry',
      item: 'command risk tiers',
      ok: EXPECTED_EXTENSION_ACTIONS.every((action) => typeof COMMAND_METADATA[action]?.riskTier === 'string'),
    },
    {
      label: 'registry',
      item: 'command default timeouts',
      ok: EXPECTED_EXTENSION_ACTIONS.every((action) => Number.isFinite(COMMAND_METADATA[action]?.defaultTimeoutMs)),
    },
    {
      label: 'registry',
      item: 'command catalog metadata',
      ok: COMMAND_CATALOG.length === EXPECTED_EXTENSION_ACTIONS.length
        && COMMAND_CATALOG.every((entry) => entry.summary && Array.isArray(entry.cli) && Array.isArray(entry.mcp)),
    },
    {
      label: 'registry',
      item: 'generated command catalog doc',
      ok: commandCatalogDoc === commandCatalogMarkdown(),
    },
    {
      label: 'registry',
      item: 'find-elements nearText contract',
      ok: COMMAND_METADATA.findElements?.allowedKeys?.includes('nearText')
        && usage().includes('--near-text <text>')
        && mcp.includes('nearText: z.string().optional()')
        && pageScripts.includes('nearTextNeedle'),
    },
    {
      label: 'registry',
      item: 'strict workspace policy mode',
      ok: workspacePolicy.includes("['scoped', 'strict']")
        && usage().includes('--policy-mode scoped|strict')
        && mcp.includes("z.enum(['scoped', 'strict'])")
        && workspaceTabs.includes("policyMode === 'strict'"),
    },
    {
      label: 'registry',
      item: 'upload-file files contract',
      ok: registry.includes('function ensureStringArray')
        && registry.includes("ensureStringArray(normalizedPayload, 'files', action)")
        && mcp.includes('files: z.array(z.string()).optional()')
        && usage().includes('--files-json <json>'),
    },
    {
      label: 'registry',
      item: 'docs coverage checker',
      ok: packageJson.scripts?.['check:docs'] === 'node ./scripts/check-docs-coverage.mjs'
        && packageJson.scripts?.check?.includes('npm run check:docs')
        && cli.includes('docsCoverageChecker'),
    },
    {
      label: 'registry',
      item: 'package contents checker',
      ok: packageJson.scripts?.['check:pack'] === 'node ./scripts/check-package-contents.mjs'
        && packageJson.scripts?.check?.includes('check-package-contents.mjs')
        && cli.includes('packageContentsChecker'),
    },
    {
      label: 'registry',
      item: 'privacy scanner',
      ok: packageJson.scripts?.['check:privacy'] === 'node ./scripts/check-privacy-scan.mjs'
        && packageJson.scripts?.check?.includes('npm run check:privacy')
        && cli.includes('privacyScanner'),
    },
    {
      label: 'registry',
      item: 'runtime timeout defaults',
      ok: server.includes('commandDefaultTimeoutMs')
        && server.includes('return commandDefaultTimeoutMs(action)')
        && server.includes('commandTimeoutMs(action, timeoutMs)')
        && cli.includes('timeoutMs ?? commandDefaultTimeoutMs(action)')
        && mcp.includes('timeoutMs ?? commandDefaultTimeoutMs(action)'),
    },
    {
      label: 'registry',
      item: 'CLI usage signatures',
      ok: registry.includes('CLI_USAGE_LINES')
        && registry.includes('CLI_USAGE_GROUPS')
        && CLI_USAGE_LINES.length === EXPECTED_CLI_COMMANDS.length
        && CLI_USAGE_GROUPS.reduce((sum, group) => sum + group.commands.length, 0) === EXPECTED_CLI_COMMANDS.length
        && CLI_USAGE_LINES.every((line) => usage().includes(line))
        && commandCatalogMarkdown().includes('## CLI Usage Signatures'),
    },
  ];

  const pressBlock = /if \(cmd === 'press'\) \{[\s\S]*?\n  \}/.exec(cli)?.[0] || '';

  const safetyChecks = [
    { label: 'safety gate', item: 'requireConfirmed', ok: safetyGates.includes('function requireConfirmed') },
    { label: 'safety gate', item: 'requireSensitiveConfirmed', ok: safetyGates.includes('function requireSensitiveConfirmed') },
    { label: 'safety gate', item: 'whole cookie jar confirmSensitive', ok: browserData.includes("cookiesList without url/domain/name") },
    { label: 'safety gate', item: 'credentialed request confirmSensitive', ok: browserData.includes("credentials === 'include'") },
    { label: 'bridge guard', item: 'unsupported action rejection', ok: server.includes('Unsupported action:') },
    { label: 'bridge guard', item: 'extension version mismatch rejection', ok: server.includes('Extension version mismatch:') },
    { label: 'bridge guard', item: 'unknown extension version rejection', ok: server.includes('VERSION_UNKNOWN') && server.includes('extensionVersionStatusError') },
    { label: 'bridge guard', item: 'long poll disabled by default', ok: server.includes('CHROME_BRIDGE_ENABLE_LONG_POLL') },
    { label: 'bridge guard', item: 'server payload validation', ok: server.includes('validateCommandPayload') && registry.includes('COMMAND_PAYLOAD_SCHEMAS') },
    { label: 'bridge guard', item: 'direct command origin rejection', ok: server.includes('requireCommandOrigin') && server.includes('INVALID_COMMAND_ORIGIN') },
    { label: 'bridge guard', item: 'JSON POST content-type rejection', ok: server.includes('requireJsonContentType') && server.includes('UNSUPPORTED_MEDIA_TYPE') },
    { label: 'bridge guard', item: 'extension origin/id parity', ok: server.includes('requireExtensionIdentity') && server.includes('EXTENSION_ID_MISMATCH') },
    { label: 'bridge guard', item: 'unsafe host guard', ok: server.includes('CHROME_BRIDGE_UNSAFE_HOST') },
    { label: 'safety gate', item: 'extension request method allowlist', ok: registry.includes('HTTP_METHODS') && cli.includes('normalizeHttpMethod') && mcp.includes('z.enum(HTTP_METHODS)') },
    {
      label: 'bridge guard',
      item: 'shutdown cleanup',
      ok: server.includes('BRIDGE_SHUTTING_DOWN')
        && server.includes('rejectPendingCommands')
        && server.includes('closeWebSocketServer')
        && bridgeContractChecker.includes('rejects pending commands during shutdown')
        && bridgeContractChecker.includes('closes websocket extension sockets during shutdown'),
    },
    {
      label: 'bridge guard',
      item: 'structured oversized body rejection',
      ok: server.includes('REQUEST_TOO_LARGE')
        && server.includes('let settled = false')
        && bridgeContractChecker.includes('rejects oversized JSON request bodies with structured 413'),
    },
    {
      label: 'bridge guard',
      item: 'debugger actions serialized per tab',
      ok: registry.includes('DEBUGGER_SERIALIZED_ACTIONS')
        && DEBUGGER_SERIALIZED_ACTIONS.length >= 10
        && debuggerSession.includes('const debuggerLocks = new Map()')
        && debuggerSession.includes('async function withTabLock')
        && debuggerSession.includes('export async function withDebugger')
        && debuggerSession.includes('return withTabLock(tabId')
        && traceActions.includes('startTraceForTab')
        && traceActions.includes('stopTraceForTab'),
    },
    { label: 'trace privacy', item: 'no response body capture', ok: !background.includes('Network.getResponseBody') },
    {
      label: 'safety gate',
      item: 'press trusted input is opt-in',
      ok: pressBlock.includes('trusted: Boolean(args.trusted)')
        && pageInteractions.includes('if (payload.trusted === true)')
        && usage().includes('press --key <key> --confirm [--selector <css>] [--trusted]'),
    },
    {
      label: 'observability',
      item: 'session summary includes workspace policy state',
      ok: cli.includes("command('workspace', { includeTabs: true }, 10_000)")
        && cli.includes('summaryRecommendations(health, group, workspace)')
        && mcp.includes("bridgeCommand('workspace', { includeTabs: true }, 10_000)")
        && mcp.includes('summaryRecommendations(health, group, workspace)'),
    },
    {
      label: 'observability',
      item: 'debug bundle page artifacts are opt-in',
      ok: cli.includes("args['include-snapshot']")
        && cli.includes("args['include-observe']")
        && cli.includes("args['include-screenshot']")
        && cli.includes("args['include-trace-events']")
        && mcp.includes('includeSnapshot: z.boolean().optional()')
        && mcp.includes('includeObserve: z.boolean().optional()')
        && mcp.includes('includeScreenshot: z.boolean().optional()')
        && mcp.includes('includeTraceEvents: z.boolean().optional()')
        && cli.includes('trace-summary.json'),
    },
    {
      label: 'observability',
      item: 'extension error codes propagate through bridge',
      ok: extensionErrors.includes('function extensionErrorCode')
        && offscreen.includes('code: response?.code')
        && server.includes('body.code ||')
        && cli.includes('error.details = json.details')
        && mcp.includes('error.details = json.details'),
    },
  ];

  const checks = [
    ...syntaxChecks.map((result, index) => ({
      label: 'syntax',
      item: [
        paths.background,
        paths.extensionErrors,
        paths.offscreenLifecycle,
        paths.pageScripts,
        paths.safetyGates,
        paths.tabCleanup,
        paths.workspacePolicy,
        paths.offscreen,
        paths.ask,
        paths.server,
        paths.cli,
        paths.mcp,
        paths.registry,
        paths.commandCatalogGenerator,
        paths.bridgeContractChecker,
        paths.docsCoverageChecker,
        paths.packageContentsChecker,
        paths.privacyScanner,
      ][index],
      ok: result.ok,
      error: result.ok ? undefined : result.error || result.stderr,
    })),
    ...permissionChecks,
    ...versionChecks,
    ...actionChecks,
    ...cliChecks,
    ...mcpChecks,
    ...registryChecks,
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
    const mediaType = /^data:([^;,]+);base64,/.exec(value.dataUrl)?.[1] || 'unknown';
    return {
      ...value,
      dataUrl: `data:${mediaType};base64,<${value.dataUrl.length} chars>`,
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

async function sessionSummary() {
  const health = await bridgeFetch('/health').catch((error) => ({
    ok: false,
    code: error.code || null,
    error: String(error?.message || error),
  }));
  const group = await command('group', {}, 10_000).catch((error) => ({
    ok: false,
    code: error.code || null,
    error: String(error?.message || error),
  }));
  const workspace = await command('workspace', { includeTabs: true }, 10_000).catch((error) => ({
    ok: false,
    code: error.code || null,
    error: String(error?.message || error),
  }));
  return {
    generatedAt: new Date().toISOString(),
    bridgeUrl: DEFAULT_ENDPOINT,
    health,
    workspace,
    group,
    recommendations: summaryRecommendations(health, group, workspace),
  };
}

function summaryRecommendations(health, group, workspace) {
  const recommendations = [];
  const extensionVersion = health?.extension?.info?.version;
  const policyMode = workspace?.policy?.mode || workspace?.workspace?.policyMode;
  if (extensionVersion && extensionVersion !== EXPECTED_EXTENSION_VERSION) {
    recommendations.push(`Reload the unpacked extension; expected ${EXPECTED_EXTENSION_VERSION}, got ${extensionVersion}.`);
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

async function writeJsonFile(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function readJsonFile(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function writeDataUrlFile(filePath, dataUrl, expectedPrefix) {
  const match = new RegExp(`^${expectedPrefix},(.+)$`).exec(dataUrl || '');
  if (!match) throw new Error(`Invalid data URL for ${filePath}`);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, Buffer.from(match[1], 'base64'));
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

const RUNTIME_SMOKE_REQUIRED_COVERAGE = Object.freeze([
  'adopt existing smoke tab',
  'set strict smoke workspace',
  'workspace includes smoke tab',
  'session summary covers strict policy',
  'debug bundle default redaction',
  'tabs scoped includes smoke tab',
  'observe actionable elements',
  'find-elements filtered',
  'find-elements near text filtered',
  'extract forms',
  'viewport screenshot',
  'selector screenshot',
  'pdf export',
  'wait for type side-effect',
  'wait for press side-effect',
  'wait for select side-effect',
  'wait for click side-effect',
  'wait for coordinate click side-effect',
  'trace events',
  'storage keys',
  'cookies metadata by url',
  'extension-context request',
  'history search scoped to fixture url',
  'safety: cookies whole jar requires confirmSensitive',
  'safety: storage values require confirmSensitive',
  'safety: credentialed request requires confirmSensitive',
  'strict policy rejects outside tab even with allowExternal',
  'cleanup close outside smoke group',
  'cleanup close smoke tab',
]);

function redactDebugBundleValue(value) {
  if (Array.isArray(value)) return value.map((item) => redactDebugBundleValue(item));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    DEBUG_BUNDLE_REDACTED_KEYS.has(key) ? '[redacted]' : redactDebugBundleValue(entry),
  ]));
}

function runtimeSmokeCoverage(steps) {
  const successfulSteps = new Set(steps
    .filter((step) => step.ok)
    .map((step) => step.name));
  const covered = RUNTIME_SMOKE_REQUIRED_COVERAGE.filter((name) => successfulSteps.has(name));
  const missing = RUNTIME_SMOKE_REQUIRED_COVERAGE.filter((name) => !successfulSteps.has(name));
  return {
    ok: missing.length === 0,
    requiredCount: RUNTIME_SMOKE_REQUIRED_COVERAGE.length,
    coveredCount: covered.length,
    missingCount: missing.length,
    required: RUNTIME_SMOKE_REQUIRED_COVERAGE,
    covered,
    missing,
  };
}

function runtimeSmokeCoveragePlan(startedAt) {
  return {
    ok: true,
    mode: 'coverage-plan',
    liveBridge: false,
    skipped: true,
    startedAt,
    finishedAt: new Date().toISOString(),
    expectedVersion: EXPECTED_EXTENSION_VERSION,
    reason: 'Coverage plan only; no bridge or Chrome checks were run.',
    nextCommand: 'chrome-bridge runtime-smoke',
    verification: {
      status: 'not-run',
      liveVerificationRequired: true,
      finalCommands: [
        'chrome-bridge health',
        'chrome-bridge runtime-smoke',
      ],
      successCriteria: {
        ok: true,
        coverageOk: true,
        extensionVersion: EXPECTED_EXTENSION_VERSION,
        requiredCoverageCount: RUNTIME_SMOKE_REQUIRED_COVERAGE.length,
      },
    },
    coverage: runtimeSmokeCoverage([]),
  };
}

function runtimeSmokeLiveVerification({ status, extensionVersion = null, failures = [], coverage = null } = {}) {
  const effectiveStatus = status || (failures.length === 0 && coverage?.ok ? 'passed' : 'failed');
  return {
    status: effectiveStatus,
    liveVerificationRequired: effectiveStatus !== 'passed',
    successCriteria: {
      ok: true,
      coverageOk: true,
      extensionVersion: EXPECTED_EXTENSION_VERSION,
      requiredCoverageCount: RUNTIME_SMOKE_REQUIRED_COVERAGE.length,
    },
    observed: {
      extensionVersion,
      failures: failures.length,
      coverageOk: coverage?.ok ?? false,
      coveredCount: coverage?.coveredCount ?? 0,
      missingCount: coverage?.missingCount ?? RUNTIME_SMOKE_REQUIRED_COVERAGE.length,
    },
  };
}

async function debugBundle(args = {}) {
  if (!args.out) throw new Error('debug-bundle requires --out <dir>');
  const outputDir = path.resolve(args.out);
  const target = targetPayload(args);
  const createdAt = new Date().toISOString();
  const includeSnapshot = Boolean(args['include-snapshot']);
  const includeObserve = Boolean(args['include-observe']);
  const includeScreenshot = Boolean(args['include-screenshot']);
  const includeTraceEvents = Boolean(args['include-trace-events']);
  const manifest = {
    createdAt,
    bridgeUrl: DEFAULT_ENDPOINT,
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
    const filePath = path.join(outputDir, name);
    const output = options.redact === false ? value : redactDebugBundleValue(value);
    await writeJsonFile(filePath, output);
    manifest.files.push(name);
    return output;
  };

  const summary = await sessionSummary();
  await addJson('session-summary.json', redactDebugBundleValue(summary));
  await addJson('health.json', redactDebugBundleValue(summary.health));

  if (includeSnapshot) {
    const snapshot = await command('snapshot', { ...target, maxChars: 50_000 }, 30_000).catch((error) => ({
      ok: false,
      code: error.code || null,
      error: String(error?.message || error),
    }));
    await addJson('snapshot.json', snapshot, { redact: false });
  }

  if (includeObserve) {
    const observe = await command('observe', { ...target, limit: 100 }, 30_000).catch((error) => ({
      ok: false,
      code: error.code || null,
      error: String(error?.message || error),
    }));
    await addJson('observe.json', observe, { redact: false });
  }

  const trace = await command('traceSummary', target, 30_000).catch((error) => ({
    ok: false,
    code: error.code || null,
    error: String(error?.message || error),
  }));
  await addJson('trace-summary.json', trace);
  if (includeTraceEvents) {
    const traceEvents = await command('traceEvents', { ...target, limit: 200 }, 30_000).catch((error) => ({
      ok: false,
      code: error.code || null,
      error: String(error?.message || error),
    }));
    await addJson('trace-events.json', traceEvents, { redact: false });
  }

  if (includeScreenshot) {
    const screenshot = await command('screenshot', target, 30_000).catch((error) => ({
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

async function runtimeSmoke(args = {}) {
  const startedAt = new Date().toISOString();
  if (!RUNTIME_SMOKE_REQUIRED_COVERAGE.length) {
    throw new Error('runtime-smoke required coverage list must not be empty');
  }
  if (args['coverage-plan']) {
    return runtimeSmokeCoveragePlan(startedAt);
  }
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
      verification: runtimeSmokeLiveVerification({ status: 'skipped', extensionVersion }),
    };
  }

  const fixture = await startSmokeServer();
  const steps = [];
  let tabId = null;
  let outsideTabId = null;
  let strictWorkspaceSet = false;
  let debugBundleDir = null;
  const smokeId = String(Date.now());
  const adoptSourceGroupTitle = `Codex Bridge Smoke Adopt Source ${smokeId}`;
  const strictGroupTitle = `Codex Bridge Smoke Strict ${smokeId}`;
  const outsideGroupTitle = `Codex Bridge Smoke Outside ${smokeId}`;

  const run = async (name, fn, options = {}) => {
    try {
      const result = await fn();
      if (options.assert) await options.assert(result);
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

  const assertTabCleanupMitigation = (result) => {
    const cleanup = result?.tabGroupPersistenceMitigation;
    if (!cleanup) throw new Error('cleanup result did not include tabGroupPersistenceMitigation metadata');
    if (!Array.isArray(cleanup.savedGroupPersistence)) throw new Error('cleanup metadata did not include savedGroupPersistence results');
    if (!cleanup.ungroupedBeforeClose) throw new Error('cleanup did not ungroup grouped tabs before close');
    if (!Array.isArray(cleanup.ungroupedTabIds) || !cleanup.ungroupedTabIds.length) {
      throw new Error('cleanup did not report ungrouped grouped tab ids');
    }
  };

  try {
    const opened = await run('open adoption source smoke tab', () => command('open', {
      url: fixture.url,
      newTab: true,
      groupTitle: adoptSourceGroupTitle,
      groupColor: 'grey',
    }, 30_000), {
      assert: (result) => {
        if (!result?.id) throw new Error('open did not return a tab id');
        if (result.group?.title !== adoptSourceGroupTitle) throw new Error('adoption source tab was not placed in the source group');
      },
    });
    tabId = opened.id;

    const adopted = await run('adopt existing smoke tab', () => command('adoptTab', {
      tabId,
      confirmed: true,
      groupTitle: 'Codex Bridge',
      groupColor: 'purple',
    }, 30_000), {
      assert: (result) => {
        if (!result?.adopted) throw new Error('adoptTab did not report adoption');
        if (result.tab?.id !== tabId) throw new Error('adoptTab changed the adopted tab id');
        if (result.tab?.group?.title !== 'Codex Bridge') throw new Error('adopted tab was not placed in Codex Bridge group');
      },
    });
    tabId = adopted.tab.id;

    await run('set strict smoke workspace', () => command('setWorkspace', {
      name: `smoke-${smokeId}`,
      groupTitle: strictGroupTitle,
      groupColor: 'cyan',
      policyMode: 'strict',
      confirmed: true,
    }, 10_000), {
      assert: (result) => {
        if (result.workspace?.title !== strictGroupTitle) throw new Error('strict workspace title was not applied');
        if (result.policy?.mode !== 'strict') throw new Error('strict workspace policy was not applied');
      },
    });
    strictWorkspaceSet = true;

    await run('workspace includes smoke tab', () => command('workspace', { includeTabs: true }, 10_000), {
      assert: (result) => {
        if (result.workspace?.title !== strictGroupTitle) throw new Error('workspace did not report strict smoke group title');
        if (result.policy?.mode !== 'strict') throw new Error('workspace did not report strict policy');
        if (!result.tabs?.some((tab) => tab.id === tabId)) throw new Error('workspace tabs did not include smoke tab');
      },
    });

    await run('session summary covers strict policy', () => sessionSummary(), {
      assert: (result) => {
        if (result.workspace?.policy?.mode !== 'strict') throw new Error('session summary did not report strict policy');
        if (!result.workspace?.tabs?.some((tab) => tab.id === tabId)) throw new Error('session summary did not include smoke tab');
        if (!result.recommendations?.some((item) => item.includes('Strict workspace policy is active'))) {
          throw new Error('session summary did not recommend strict-policy awareness');
        }
      },
    });

    debugBundleDir = await fs.mkdtemp(path.join(tmpdir(), 'chrome-bridge-smoke-bundle-'));
    await run('debug bundle default redaction', () => debugBundle({ out: debugBundleDir }), {
      assert: async (result) => {
        const expectedFiles = ['session-summary.json', 'health.json', 'trace-summary.json', 'manifest.json'];
        for (const expectedFile of expectedFiles) {
          if (!result.files?.includes(expectedFile)) throw new Error(`debug bundle omitted ${expectedFile}`);
        }
        for (const omittedFile of ['snapshot.json', 'observe.json', 'screenshot.json', 'screenshot.png', 'trace-events.json']) {
          if (result.files?.includes(omittedFile)) throw new Error(`debug bundle included ${omittedFile} by default`);
        }

        const manifest = await readJsonFile(path.join(debugBundleDir, 'manifest.json'));
        if (manifest.privacy?.pageArtifacts?.snapshot !== 'omitted-by-default') throw new Error('debug bundle snapshot artifact was not omitted by default');
        if (manifest.privacy?.pageArtifacts?.observe !== 'omitted-by-default') throw new Error('debug bundle observe artifact was not omitted by default');
        if (manifest.privacy?.pageArtifacts?.screenshot !== 'omitted-by-default') throw new Error('debug bundle screenshot artifact was not omitted by default');
        if (manifest.privacy?.traceEvents !== 'summarized-by-default') throw new Error('debug bundle trace events were not summarized by default');

        const summaryJson = await readJsonFile(path.join(debugBundleDir, 'session-summary.json'));
        const serializedSummary = JSON.stringify(summaryJson);
        if (serializedSummary.includes(fixture.url)) throw new Error('debug bundle leaked the fixture URL in redacted summary');
        if (!serializedSummary.includes('[redacted]')) throw new Error('debug bundle summary did not redact page metadata');
      },
    });

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
    await run('observe actionable elements', () => command('observe', {
      tabId,
      limit: 20,
    }, 30_000), {
      assert: (result) => {
        if (!result.elements?.some((element) => element.selector === '#action' && element.action === 'click')) {
          throw new Error('observe did not include action button');
        }
      },
    });
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
    await run('find-elements filtered', () => command('findElements', {
      tabId,
      text: 'Action',
      limit: 20,
    }, 30_000), {
      assert: (result) => {
        if (!result.elements?.some((element) => element.selector === '#action')) throw new Error('find-elements did not include action button');
      },
    });
    await run('find-elements near text filtered', () => command('findElements', {
      tabId,
      nearText: 'Codex Bridge Smoke',
      text: 'Action',
      limit: 20,
    }, 30_000), {
      assert: (result) => {
        if (!result.elements?.some((element) => element.selector === '#action')) {
          throw new Error('find-elements nearText did not include action button');
        }
      },
    });
    await run('extract forms', () => command('extractPage', {
      tabId,
      kind: 'forms',
      maxItems: 10,
    }, 30_000), {
      assert: (result) => {
        if (!Array.isArray(result.forms)) throw new Error('extract did not return forms array');
      },
    });
    await run('select options read', () => command('listSelectOptions', {
      tabId,
      selector: '#smoke-select',
    }, 30_000), {
      assert: (result) => {
        if (!result.options?.some((option) => option.value === 'b')) throw new Error('select options did not include Beta');
      },
    });
    await run('fill form dry run', () => command('fillForm', {
      tabId,
      fields: { '#smoke-input': 'preview' },
      dryRun: true,
    }, 30_000), {
      assert: (result) => {
        if (!result.dryRun || result.applied) throw new Error('fill form dry run unexpectedly applied changes');
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
    await run('pdf export', () => command('printPdf', { tabId }, 60_000), {
      assert: (result) => {
        if (!String(result.dataUrl || '').startsWith('data:application/pdf;base64,')) throw new Error('pdf export was not a PDF data URL');
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

    const outsideOpened = await run('open outside smoke group tab', () => command('open', {
      url: `${fixture.url}?outside=1`,
      newTab: true,
      groupTitle: outsideGroupTitle,
      groupColor: 'grey',
    }, 30_000), {
      assert: (result) => {
        if (!result?.id) throw new Error('outside smoke open did not return a tab id');
        if (result.group?.title !== outsideGroupTitle) throw new Error('outside smoke tab was not placed in the alternate group');
      },
    });
    outsideTabId = outsideOpened.id;

    await expectReject('strict policy rejects outside tab even with allowExternal', () => command('text', {
      tabId: outsideTabId,
      allowExternal: true,
      maxChars: 1_000,
    }, 30_000));
  } finally {
    if (outsideTabId) {
      await run('cleanup close outside smoke group', () => command('closeGroup', {
        groupTitle: outsideGroupTitle,
        confirmed: true,
      }, 30_000), {
        assert: assertTabCleanupMitigation,
        required: false,
      });
    }
    if (strictWorkspaceSet) {
      await run('clear strict smoke workspace', () => command('clearWorkspace', {
        confirmed: true,
      }, 10_000), { required: false });
    }
    if (tabId && !args['keep-tab']) {
      await run('cleanup close smoke tab', () => command('closeTab', {
        tabId,
        confirmed: true,
        allowExternal: true,
      }, 30_000), {
        assert: assertTabCleanupMitigation,
        required: false,
      });
    }
    if (debugBundleDir) {
      await fs.rm(debugBundleDir, { recursive: true, force: true }).catch(() => {});
    }
    await closeServer(fixture.server);
  }

  const failures = steps.filter((step) => !step.ok);
  const coverage = runtimeSmokeCoverage(steps);
  const ok = failures.length === 0 && coverage.ok;
  return {
    ok,
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
    coverage,
    verification: runtimeSmokeLiveVerification({
      status: ok ? 'passed' : 'failed',
      extensionVersion,
      failures,
      coverage,
    }),
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
command = ${tomlString(process.execPath)}
args = [${tomlString(path.join(rootDir, 'mcp/chrome-bridge-mcp.mjs'))}]
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
    if (!args.confirm) throw new Error('reload-extension requires --confirm');
    printJson(await command('reloadExtension', confirmationPayload(args), 5_000));
    return;
  }

  if (cmd === 'tabs') {
    if (args.all && !args.confirm) throw new Error('tabs --all requires --confirm');
    printJson(await command('tabs', {
      includeAll: Boolean(args.all),
      ...confirmationPayload(args),
    }));
    return;
  }

  if (cmd === 'windows') {
    if (args.all && !args.confirm) throw new Error('windows --all requires --confirm');
    printJson(await command('windows', {
      includeAll: Boolean(args.all),
      ...confirmationPayload(args),
    }));
    return;
  }

  if (cmd === 'group') {
    printJson(await command('group', {
      includeTabs: Boolean(args.tabs),
    }));
    return;
  }

  if (cmd === 'workspace') {
    printJson(await command('workspace', {
      includeTabs: Boolean(args.tabs),
    }));
    return;
  }

  if (cmd === 'set-workspace') {
    if (!args.confirm) throw new Error('set-workspace requires --confirm');
    printJson(await command('setWorkspace', {
      name: args.name,
      groupTitle: args['group-title'],
      groupColor: args['group-color'],
      policyMode: args['policy-mode'],
      ...confirmationPayload(args),
    }));
    return;
  }

  if (cmd === 'clear-workspace') {
    if (!args.confirm) throw new Error('clear-workspace requires --confirm');
    printJson(await command('clearWorkspace', confirmationPayload(args)));
    return;
  }

  if (cmd === 'ensure-tab') {
    printJson(await command('ensureTab', {
      url: first,
      active: Boolean(args.active),
    }, 30_000));
    return;
  }

  if (cmd === 'adopt-tab') {
    if (!args.confirm) throw new Error('adopt-tab requires --confirm');
    printJson(await command('adoptTab', {
      tabId: args.tab ? Number(args.tab) : undefined,
      ...confirmationPayload(args),
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

  if (cmd === 'observe') {
    printJson(await command('observe', {
      ...targetPayload(args),
      limit: args.limit ? Number(args.limit) : undefined,
      maxTextChars: args['max-text-chars'] ? Number(args['max-text-chars']) : undefined,
    }, 30_000));
    return;
  }

  if (cmd === 'find-elements') {
    printJson(await command('findElements', {
      ...targetPayload(args),
      role: args.role,
      text: args.text,
      nearText: args['near-text'],
      placeholder: args.placeholder,
      href: args.href,
      actionKind: args.action,
      risk: args.risk,
      limit: args.limit ? Number(args.limit) : undefined,
      maxTextChars: args['max-text-chars'] ? Number(args['max-text-chars']) : undefined,
    }, 30_000));
    return;
  }

  if (cmd === 'extract') {
    printJson(await command('extractPage', {
      ...targetPayload(args),
      kind: args.kind,
      maxItems: args['max-items'] ? Number(args['max-items']) : undefined,
      maxTextChars: args['max-text-chars'] ? Number(args['max-text-chars']) : undefined,
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

  if (cmd === 'pdf') {
    if (!args.out) throw new Error('pdf requires --out <file>');
    const result = await command('printPdf', {
      ...targetPayload(args),
      landscape: Boolean(args.landscape),
      printBackground: !args['omit-background'],
      pageRanges: args['page-ranges'],
      scale: args.scale === undefined ? undefined : Number(args.scale),
    }, 60_000);
    const match = /^data:application\/pdf;base64,(.+)$/.exec(result.dataUrl || '');
    if (!match) throw new Error('Extension returned an invalid PDF data URL');
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
      trusted: Boolean(args.trusted),
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

  if (cmd === 'select-options') {
    if (!args.selector) throw new Error('select-options requires --selector <css>');
    printJson(await command('listSelectOptions', {
      ...targetPayload(args),
      selector: args.selector,
    }, 30_000));
    return;
  }

  if (cmd === 'fill-form') {
    const fields = parseJsonOption(args['fields-json'], '--fields-json');
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) throw new Error('fill-form requires --fields-json <object>');
    if (!args['dry-run'] && !args.confirm) throw new Error('fill-form apply requires --confirm; pass --dry-run to preview');
    printJson(await command('fillForm', {
      ...targetPayload(args),
      ...confirmationPayload(args),
      fields,
      dryRun: Boolean(args['dry-run']),
    }, 30_000));
    return;
  }

  if (cmd === 'handle-dialog') {
    if (!args.confirm) throw new Error('handle-dialog requires --confirm');
    printJson(await command('handleDialog', {
      ...targetPayload(args),
      ...confirmationPayload(args),
      accept: !args.dismiss,
      promptText: args['prompt-text'],
    }, 30_000));
    return;
  }

  if (cmd === 'upload-file') {
    if (!args.confirm) throw new Error('upload-file requires --confirm');
    if (!args.selector) throw new Error('upload-file requires --selector <css>');
    if (!args.file && !args['files-json']) throw new Error('upload-file requires --file <path> or --files-json <json>');
    printJson(await command('uploadFile', {
      ...targetPayload(args),
      ...confirmationPayload(args),
      selector: args.selector,
      file: args.file,
      files: parseJsonOption(args['files-json'], '--files-json'),
    }, 60_000));
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

  if (cmd === 'trace-summary' || cmd === 'trace-events' || cmd === 'trace-stop') {
    const action = {
      'trace-summary': 'traceSummary',
      'trace-events': 'traceEvents',
      'trace-stop': 'traceStop',
    }[cmd];
    printJson(await command(action, {
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
      method: normalizeHttpMethod(args.method),
      headers: parseJsonOption(args['headers-json'], '--headers-json'),
      body: args.body,
      credentials: args.credentials,
      maxChars: args['max-chars'] ? Number(args['max-chars']) : undefined,
    }, 60_000));
    return;
  }

  if (cmd === 'ask') {
    const question = args.question || first;
    if (!question) throw new Error('ask requires --question <text>');
    printJson(await command('askUser', {
      question,
      choices: parseJsonOption(args['choices-json'], '--choices-json'),
      allowText: !args['no-text'],
      closeOnAnswer: !args['keep-tab'],
      timeoutMs: args['timeout-ms'] ? Number(args['timeout-ms']) : undefined,
    }, args['timeout-ms'] ? Number(args['timeout-ms']) + 5_000 : 305_000));
    return;
  }

  if (cmd === 'session-summary') {
    printJson(await sessionSummary());
    return;
  }

  if (cmd === 'debug-bundle') {
    printJson(await debugBundle(args));
    return;
  }

  if (cmd === 'command-catalog') {
    if (args.markdown) {
      process.stdout.write(commandCatalogMarkdown());
      return;
    }
    printJson(commandCatalog());
    return;
  }

  throw new Error(`Unknown command: ${cmd}`);
}

main().catch((error) => {
  process.stderr.write(`${String(error?.stack || error)}\n`);
  process.exit(1);
});
