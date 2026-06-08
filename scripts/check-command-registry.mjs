#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BRIDGE_VERSION,
  CLI_COMMANDS,
  CLI_USAGE_GROUPS,
  CLI_USAGE_LINES,
  COMMAND_CATALOG,
  COMMAND_METADATA,
  COMMAND_PAYLOAD_SCHEMAS,
  DEBUGGER_SERIALIZED_ACTIONS,
  EXTENSION_ACTIONS,
  LOCAL_COMMAND_CATALOG,
  LOCAL_COMMAND_METADATA,
  MANIFEST_PERMISSIONS,
  MCP_TOOLS,
  commandCatalogMarkdown,
  commandDefaultTimeoutMs,
  commandRiskTier,
  cliUsageLineForCommand,
  validateCommandPayload,
} from '../shared/command-registry.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const [
  manifestText,
  packageText,
  serverText,
  cliText,
  mcpText,
  backgroundText,
  browserDataText,
  debuggerSessionText,
  extensionErrorsText,
  keyboardEventsText,
  navigationActionsText,
  offscreenLifecycleText,
  pageExecutionText,
  pageArtifactsText,
  pageReadActionsText,
  pageInteractionsText,
  pageScriptsText,
  runtimeActionsText,
  safetyGatesText,
  tabCleanupText,
  tabGroupPersistenceText,
  tabInfoText,
  tabLoadingText,
  traceActionsText,
  userPromptsText,
  workspaceTabsText,
  packageContentsCheckerText,
  privacyScannerText,
  checkWorkflowText,
  readmeText,
  publishingText,
  roadmapText,
  pullRequestTemplateText,
  contributingText,
  codexChromeBridgeSkillText,
] = await Promise.all([
  fs.readFile(path.join(rootDir, 'extension/manifest.json'), 'utf8'),
  fs.readFile(path.join(rootDir, 'package.json'), 'utf8'),
  fs.readFile(path.join(rootDir, 'server/bridge-server.mjs'), 'utf8'),
  fs.readFile(path.join(rootDir, 'bin/chrome-bridge.mjs'), 'utf8'),
  fs.readFile(path.join(rootDir, 'mcp/chrome-bridge-mcp.mjs'), 'utf8'),
  fs.readFile(path.join(rootDir, 'extension/background.js'), 'utf8'),
  fs.readFile(path.join(rootDir, 'extension/browser-data.js'), 'utf8').catch(() => ''),
  fs.readFile(path.join(rootDir, 'extension/debugger-session.js'), 'utf8').catch(() => ''),
  fs.readFile(path.join(rootDir, 'extension/extension-errors.js'), 'utf8'),
  fs.readFile(path.join(rootDir, 'extension/keyboard-events.js'), 'utf8').catch(() => ''),
  fs.readFile(path.join(rootDir, 'extension/navigation-actions.js'), 'utf8').catch(() => ''),
  fs.readFile(path.join(rootDir, 'extension/offscreen-lifecycle.js'), 'utf8'),
  fs.readFile(path.join(rootDir, 'extension/page-execution.js'), 'utf8').catch(() => ''),
  fs.readFile(path.join(rootDir, 'extension/page-artifacts.js'), 'utf8').catch(() => ''),
  fs.readFile(path.join(rootDir, 'extension/page-read-actions.js'), 'utf8').catch(() => ''),
  fs.readFile(path.join(rootDir, 'extension/page-interactions.js'), 'utf8').catch(() => ''),
  fs.readFile(path.join(rootDir, 'extension/page-scripts.js'), 'utf8'),
  fs.readFile(path.join(rootDir, 'extension/runtime-actions.js'), 'utf8').catch(() => ''),
  fs.readFile(path.join(rootDir, 'extension/safety-gates.js'), 'utf8'),
  fs.readFile(path.join(rootDir, 'extension/tab-cleanup.js'), 'utf8'),
  fs.readFile(path.join(rootDir, 'extension/tab-group-persistence.js'), 'utf8').catch(() => ''),
  fs.readFile(path.join(rootDir, 'extension/tab-info.js'), 'utf8').catch(() => ''),
  fs.readFile(path.join(rootDir, 'extension/tab-loading.js'), 'utf8').catch(() => ''),
  fs.readFile(path.join(rootDir, 'extension/trace-actions.js'), 'utf8').catch(() => ''),
  fs.readFile(path.join(rootDir, 'extension/user-prompts.js'), 'utf8').catch(() => ''),
  fs.readFile(path.join(rootDir, 'extension/workspace-tabs.js'), 'utf8').catch(() => ''),
  fs.readFile(path.join(rootDir, 'scripts/check-package-contents.mjs'), 'utf8'),
  fs.readFile(path.join(rootDir, 'scripts/check-privacy-scan.mjs'), 'utf8'),
  fs.readFile(path.join(rootDir, '.github/workflows/check.yml'), 'utf8'),
  fs.readFile(path.join(rootDir, 'README.md'), 'utf8'),
  fs.readFile(path.join(rootDir, 'docs/PUBLISHING.md'), 'utf8'),
  fs.readFile(path.join(rootDir, 'docs/COMPETITIVE-ROADMAP.md'), 'utf8'),
  fs.readFile(path.join(rootDir, '.github/PULL_REQUEST_TEMPLATE.md'), 'utf8'),
  fs.readFile(path.join(rootDir, 'CONTRIBUTING.md'), 'utf8'),
  fs.readFile(path.join(rootDir, 'codex/skills/chrome-bridge/SKILL.md'), 'utf8'),
]);
const manifest = JSON.parse(manifestText);
const packageJson = JSON.parse(packageText);
const cliUsageBlock = /function usage\(\) \{\n  return \[\n[\s\S]*?\n  \]\.join\('\\n'\);\n\}/.exec(cliText)?.[0] || '';

function check(condition, message) {
  if (!condition) failures.push(message);
}

function uniqueValues(values, label) {
  const seen = new Set();
  for (const value of values) {
    check(!seen.has(value), `${label} contains duplicate value: ${value}`);
    seen.add(value);
  }
}

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameSet(left, right) {
  return sameArray([...left].sort(), [...right].sort());
}

function expectPayload(action, payload, ok, label) {
  try {
    validateCommandPayload(action, payload);
    check(ok, `${label} unexpectedly passed`);
  } catch (error) {
    check(!ok, `${label} unexpectedly failed: ${String(error?.message || error)}`);
  }
}

function functionBlock(source, name) {
  const marker = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`);
  const match = marker.exec(source);
  if (!match) return '';
  const paramsStart = source.indexOf('(', match.index);
  let paramsDepth = 0;
  let paramsEnd = -1;
  for (let index = paramsStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '(') paramsDepth += 1;
    if (char === ')') {
      paramsDepth -= 1;
      if (paramsDepth === 0) {
        paramsEnd = index;
        break;
      }
    }
  }
  const braceStart = source.indexOf('{', paramsEnd);
  if (braceStart < 0) return '';
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(match.index, index + 1);
    }
  }
  return '';
}

uniqueValues(MANIFEST_PERMISSIONS, 'manifest permissions');
uniqueValues(EXTENSION_ACTIONS, 'extension actions');
uniqueValues(CLI_COMMANDS, 'CLI commands');
uniqueValues(CLI_USAGE_GROUPS.map((group) => group.id), 'CLI usage group ids');
uniqueValues(CLI_USAGE_LINES, 'CLI usage lines');
uniqueValues(DEBUGGER_SERIALIZED_ACTIONS, 'debugger serialized actions');
uniqueValues(MCP_TOOLS, 'MCP tools');

check(BRIDGE_VERSION === '0.4.0', `unexpected bridge version: ${BRIDGE_VERSION}`);
check(packageJson.version === BRIDGE_VERSION, `package.json version ${packageJson.version} does not match registry ${BRIDGE_VERSION}`);
check(manifest.manifest_version === 3, `extension manifest version must be 3, got ${manifest.manifest_version}`);
check(manifest.version === BRIDGE_VERSION, `extension manifest version ${manifest.version} does not match registry ${BRIDGE_VERSION}`);
check(sameSet(manifest.permissions || [], MANIFEST_PERMISSIONS), 'extension manifest permissions do not match registry permissions');
check((manifest.host_permissions || []).includes('<all_urls>'), 'extension manifest must explicitly declare <all_urls> host access');
check((packageJson.files || []).includes('shared/'), 'package.json files must include shared/');
check((packageJson.files || []).includes('docs/'), 'package.json files must include docs/');
check(packageJson.scripts?.['check:pack'] === 'node ./scripts/check-package-contents.mjs', 'check:pack must verify exact package contents');
check(packageJson.scripts?.['check:privacy'] === 'node ./scripts/check-privacy-scan.mjs', 'check:privacy must run the privacy scanner');
check(packageJson.scripts?.check?.includes('npm run check:privacy'), 'npm run check must include check:privacy');
check(packageJson.scripts?.check?.includes('node --check ./extension/tab-cleanup.js'), 'npm run check must syntax-check extension/tab-cleanup.js');
check(packageJson.scripts?.check?.includes('node --check ./extension/tab-group-persistence.js'), 'npm run check must syntax-check extension/tab-group-persistence.js');
check(checkWorkflowText.includes('node-version:'), 'GitHub check workflow must use a Node.js version matrix');
for (const nodeVersion of ['20', '22', '24']) {
  check(new RegExp(`-\\s*${nodeVersion}\\b`).test(checkWorkflowText), `GitHub check workflow must include Node.js ${nodeVersion}`);
}
for (const command of ['npm ci', 'npm run check', 'npm run check:audit', 'npm run check:pack']) {
  check(checkWorkflowText.includes(`run: ${command}`), `GitHub check workflow must run ${command}`);
}
check(!checkWorkflowText.includes('runtime-smoke'), 'GitHub check workflow must not run live runtime-smoke');
check(packageContentsCheckerText.includes('REQUIRED_PACKAGE_FILES'), 'package contents checker must declare required package files');
for (const requiredPackageFile of [
  'shared/command-registry.mjs',
  'extension/extension-errors.js',
  'extension/page-scripts.js',
  'extension/navigation-actions.js',
  'extension/offscreen-lifecycle.js',
  'extension/page-execution.js',
  'extension/page-artifacts.js',
  'extension/page-read-actions.js',
  'extension/tab-cleanup.js',
  'extension/tab-group-persistence.js',
  'extension/safety-gates.js',
  'extension/workspace-policy.js',
  'docs/COMMAND-CATALOG.md',
  'docs/COMPETITIVE-ROADMAP.md',
  'scripts/check-command-registry.mjs',
  'scripts/check-bridge-contract.mjs',
  'scripts/check-docs-coverage.mjs',
  'scripts/check-package-contents.mjs',
  'scripts/check-privacy-scan.mjs',
]) {
  check(packageContentsCheckerText.includes(`'${requiredPackageFile}'`), `package contents checker must require ${requiredPackageFile}`);
}
check(privacyScannerText.includes('LOCAL_HOME_PATTERN'), 'privacy scanner must check local home paths');
check(privacyScannerText.includes('private-key'), 'privacy scanner must check private-key headers');
check(privacyScannerText.includes('secret-assignment'), 'privacy scanner must check obvious secret assignments');
check(!privacyScannerText.includes('package-lock.json'), 'privacy scanner must include package-lock.json in leak checks');
check(CLI_USAGE_LINES.length === CLI_COMMANDS.length, 'CLI usage line count must match CLI command count');
check(
  CLI_USAGE_GROUPS.reduce((sum, group) => sum + group.commands.length, 0) === CLI_COMMANDS.length,
  'CLI usage groups must cover every CLI command exactly once',
);
check(EXTENSION_ACTIONS.length === Object.keys(COMMAND_PAYLOAD_SCHEMAS).length, 'extension actions do not match payload schemas');
check(COMMAND_CATALOG.length === EXTENSION_ACTIONS.length, 'command catalog length does not match extension actions');
check(LOCAL_COMMAND_CATALOG.length === Object.keys(LOCAL_COMMAND_METADATA).length, 'local command catalog length does not match local metadata');

for (const action of DEBUGGER_SERIALIZED_ACTIONS) {
  check(EXTENSION_ACTIONS.includes(action), `debugger serialized action is not an extension action: ${action}`);
}

const dispatchBlock = functionBlock(backgroundText, 'dispatch');
check(dispatchBlock.includes('switch (action)'), 'extension background dispatch must switch on registry actions');
for (const action of EXTENSION_ACTIONS) {
  check(dispatchBlock.includes(`case '${action}':`), `extension background dispatch is missing registry action: ${action}`);
}

const cliMainBlock = functionBlock(cliText, 'main');
for (const command of CLI_COMMANDS) {
  check(cliMainBlock.includes(`cmd === '${command}'`), `CLI main() is missing registry command implementation: ${command}`);
}

for (const tool of MCP_TOOLS) {
  check(mcpText.includes(`'${tool}'`), `MCP server is missing registry tool implementation: ${tool}`);
}

const catalogCliCommands = new Set();
const catalogMcpTools = new Set();

function addCatalogReferences(entry, label) {
  for (const command of entry.cli || []) {
    check(!catalogCliCommands.has(command), `${label} duplicates CLI command reference: ${command}`);
    catalogCliCommands.add(command);
  }
  for (const tool of entry.mcp || []) {
    check(!catalogMcpTools.has(tool), `${label} duplicates MCP tool reference: ${tool}`);
    catalogMcpTools.add(tool);
  }
}

for (const action of EXTENSION_ACTIONS) {
  const schema = COMMAND_PAYLOAD_SCHEMAS[action];
  const metadata = COMMAND_METADATA[action];
  const catalog = COMMAND_CATALOG.find((entry) => entry.action === action);

  check(Array.isArray(schema), `${action} schema is missing`);
  uniqueValues(schema || [], `${action} payload schema`);
  check(metadata, `${action} metadata is missing`);
  check(catalog, `${action} catalog entry is missing`);
  if (!metadata || !catalog) continue;

  check(metadata.action === action, `${action} metadata action mismatch`);
  check(catalog === metadata, `${action} catalog should reference metadata entry`);
  check(sameArray(metadata.allowedKeys, schema), `${action} metadata allowedKeys drift`);
  check(metadata.riskTier === commandRiskTier(action), `${action} risk tier drift`);
  check(metadata.defaultTimeoutMs === commandDefaultTimeoutMs(action), `${action} timeout drift`);
  check(Number.isFinite(metadata.defaultTimeoutMs) && metadata.defaultTimeoutMs >= 5_000, `${action} timeout is too small`);
  check(typeof metadata.summary === 'string' && metadata.summary.length >= 12, `${action} summary is missing or too short`);
  check(typeof metadata.category === 'string' && metadata.category.length > 0, `${action} category is missing`);
  check(Array.isArray(metadata.cli), `${action} cli aliases must be an array`);
  check(Array.isArray(metadata.mcp), `${action} MCP tools must be an array`);

  for (const command of metadata.cli) {
    check(CLI_COMMANDS.includes(command), `${action} references unknown CLI command: ${command}`);
  }
  for (const tool of metadata.mcp) {
    check(MCP_TOOLS.includes(tool), `${action} references unknown MCP tool: ${tool}`);
  }

  if (metadata.requiresSensitiveConfirmation) {
    check(metadata.requiresConfirmation, `${action} sensitive confirmation must also require confirmation`);
    check(metadata.allowedKeys.includes('confirmSensitive'), `${action} sensitive action must allow confirmSensitive`);
  } else {
    check(!metadata.allowedKeys.includes('confirmSensitive'), `${action} non-sensitive action must not allow confirmSensitive`);
  }
  if (metadata.requiresConditionalConfirmation) {
    check(!metadata.requiresConfirmation, `${action} conditional confirmation should not force every scoped read to confirm`);
    check(metadata.allowedKeys.includes('confirmed'), `${action} conditional confirmation action must allow confirmed`);
  }
  if (metadata.riskTier === 'private-read') {
    check(metadata.requiresConfirmation, `${action} private-read action must require confirmation`);
  }

  addCatalogReferences(metadata, action);
}

for (const localCommand of LOCAL_COMMAND_CATALOG) {
  check(localCommand.id && LOCAL_COMMAND_METADATA[localCommand.id] === localCommand, `${localCommand.id || 'local command'} local metadata mismatch`);
  check(typeof localCommand.category === 'string' && localCommand.category.length > 0, `${localCommand.id} local category is missing`);
  check(typeof localCommand.riskTier === 'string' && localCommand.riskTier.length > 0, `${localCommand.id} local risk tier is missing`);
  check(typeof localCommand.summary === 'string' && localCommand.summary.length >= 12, `${localCommand.id} local summary is missing or too short`);
  check(Array.isArray(localCommand.cli), `${localCommand.id} local cli aliases must be an array`);
  check(Array.isArray(localCommand.mcp), `${localCommand.id} local MCP tools must be an array`);
  check(typeof localCommand.usesLiveBridge === 'boolean', `${localCommand.id} local live bridge flag must be boolean`);
  check(['yes', 'no', 'optional'].includes(localCommand.liveBridge), `${localCommand.id} local live bridge metadata must be yes/no/optional`);
  check(
    localCommand.defaultTimeoutMs === null
      || (Number.isFinite(localCommand.defaultTimeoutMs) && localCommand.defaultTimeoutMs >= 5_000),
    `${localCommand.id} local timeout must be null or at least 5000ms`,
  );

  for (const command of localCommand.cli) {
    check(CLI_COMMANDS.includes(command), `${localCommand.id} references unknown local CLI command: ${command}`);
  }
  for (const tool of localCommand.mcp) {
    check(MCP_TOOLS.includes(tool), `${localCommand.id} references unknown local MCP tool: ${tool}`);
  }

  addCatalogReferences(localCommand, localCommand.id);
}

for (const command of CLI_COMMANDS) {
  check(catalogCliCommands.has(command), `CLI command is not represented in any catalog metadata: ${command}`);
  check(
    CLI_USAGE_LINES.some((line) => line === `chrome-bridge ${command}` || line.startsWith(`chrome-bridge ${command} `)),
    `CLI command is missing a registry usage signature: ${command}`,
  );
  const groupMatches = CLI_USAGE_GROUPS.filter((group) => group.commands.includes(command));
  check(groupMatches.length === 1, `CLI command must appear in exactly one usage group: ${command}`);
  check(cliUsageLineForCommand(command).startsWith(`chrome-bridge ${command}`), `CLI command usage helper drift: ${command}`);
}
check(cliUsageBlock.includes('CLI_USAGE_LINES'), 'CLI usage() must be derived from registry CLI_USAGE_LINES');
check(cliUsageLineForCommand('open').includes('--allow-external'), 'CLI open usage must document the supported --allow-external flag');
check(cliUsageLineForCommand('doctor').includes('--live-checks'), 'CLI doctor usage must document explicit live checks');
for (const tool of MCP_TOOLS) {
  check(catalogMcpTools.has(tool), `MCP tool is not represented in any catalog metadata: ${tool}`);
}

for (const id of ['session-summary', 'debug-bundle', 'command-catalog', 'runtime-smoke']) {
  check(Boolean(LOCAL_COMMAND_METADATA[id]), `local command metadata is missing ${id}`);
}

expectPayload('findElements', { nearText: 'Billing address', limit: 5 }, true, 'findElements nearText payload');
expectPayload('findElements', { nearText: 42 }, false, 'findElements invalid nearText payload');
expectPayload('tabs', { includeAll: true }, false, 'tabs includeAll missing confirmation payload');
expectPayload('tabs', { includeAll: true, confirmed: true }, true, 'tabs includeAll confirmed payload');
expectPayload('windows', { includeAll: true }, false, 'windows includeAll missing confirmation payload');
expectPayload('windows', { includeAll: true, confirmed: true }, true, 'windows includeAll confirmed payload');
expectPayload('observe', { limit: 300, maxTextChars: 1_000 }, true, 'observe numeric bounds payload');
expectPayload('observe', { limit: 0 }, false, 'observe invalid limit payload');
expectPayload('findElements', { maxTextChars: 10 }, false, 'findElements invalid maxTextChars payload');
expectPayload('setWorkspace', { policyMode: 'strict', confirmed: true }, true, 'setWorkspace strict payload');
expectPayload('setWorkspace', { policyMode: 'permissive', confirmed: true }, false, 'setWorkspace invalid policy payload');
expectPayload('reloadExtension', {}, false, 'reloadExtension missing confirmation payload');
expectPayload('reloadExtension', { confirmed: true }, true, 'reloadExtension confirmed payload');
expectPayload('adoptTab', { tabId: 123, confirmed: true }, true, 'adoptTab tab payload');
expectPayload('adoptTab', { tabId: 123, confirmed: true, allowExternal: true }, false, 'adoptTab allowExternal rejection');
expectPayload('open', {}, false, 'open missing url payload');
expectPayload('waitForSelector', {}, false, 'waitForSelector missing selector payload');
expectPayload('extractPage', { kind: 'tables', maxItems: 5 }, true, 'extractPage kind payload');
expectPayload('extractPage', { kind: 'everything' }, false, 'extractPage invalid kind payload');
expectPayload('extractPage', { maxItems: 501 }, false, 'extractPage invalid maxItems payload');
expectPayload('snapshot', { maxChars: 200_000 }, true, 'snapshot maxChars payload');
expectPayload('text', { maxChars: 999 }, false, 'text invalid maxChars payload');
expectPayload('html', { maxChars: 500_000 }, true, 'html maxChars payload');
expectPayload('html', { maxChars: 500_001 }, false, 'html invalid maxChars payload');
expectPayload('printPdf', { scale: 2 }, true, 'printPdf scale payload');
expectPayload('printPdf', { scale: 99 }, false, 'printPdf invalid scale payload');
expectPayload('open', { url: 'https://example.com' }, true, 'open https payload');
expectPayload('ensureTab', { url: 'about:blank' }, true, 'ensureTab about:blank payload');
expectPayload('open', { url: 'javascript:alert(1)' }, false, 'open javascript URL rejection');
expectPayload('ensureTab', { url: 'data:text/html,<script>alert(1)</script>' }, false, 'ensureTab data URL rejection');
expectPayload('fetchUrl', { url: 'file:///etc/passwd', confirmed: true }, false, 'fetchUrl file URL rejection');
expectPayload('cookiesList', { url: 'chrome://settings', confirmed: true }, false, 'cookiesList chrome URL rejection');
expectPayload('click', { selector: 'button' }, false, 'click missing confirmation payload');
expectPayload('click', { selector: 'button', confirmed: true }, true, 'click confirmed payload');
expectPayload('uploadFile', { selector: 'input[type=file]', files: ['/tmp/a.txt'], confirmed: true }, true, 'uploadFile files payload');
expectPayload('uploadFile', { selector: 'input[type=file]', files: [123], confirmed: true }, false, 'uploadFile invalid files payload');
expectPayload('uploadFile', { selector: 'input[type=file]', confirmed: true }, false, 'uploadFile missing files payload');
expectPayload('fillForm', { fields: { '#name': 'Ada', '#count': 1, '#enabled': true }, dryRun: true }, true, 'fillForm primitive fields payload');
expectPayload('fillForm', { fields: { '#name': 'Ada' }, dryRun: true }, true, 'fillForm dry-run without confirmation payload');
expectPayload('fillForm', { fields: { '#name': 'Ada' }, dryRun: false }, false, 'fillForm apply missing confirmation payload');
expectPayload('fillForm', { fields: { '#name': 'Ada' }, dryRun: false, confirmed: true }, true, 'fillForm apply confirmed payload');
expectPayload('fillForm', { fields: { '#name': { nested: true } }, dryRun: true }, false, 'fillForm invalid nested fields payload');
expectPayload('fillForm', { dryRun: true }, false, 'fillForm missing fields payload');
expectPayload('fetchUrl', { url: 'https://example.com' }, false, 'fetchUrl missing confirmation payload');
expectPayload('fetchUrl', { url: 'https://example.com', headers: { 'x-test': 'ok' }, confirmed: true }, true, 'fetchUrl string headers payload');
expectPayload('fetchUrl', { url: 'https://example.com', headers: { 'x-test': 123 }, confirmed: true }, false, 'fetchUrl invalid headers payload');
expectPayload('fetchUrl', { url: 'https://example.com', method: 'POST', confirmed: true }, true, 'fetchUrl allowed method payload');
expectPayload('fetchUrl', { url: 'https://example.com', method: 'TRACE', confirmed: true }, false, 'fetchUrl invalid method payload');
expectPayload('fetchUrl', { url: 'https://example.com', credentials: 'omit', confirmed: true }, true, 'fetchUrl credentials payload');
expectPayload('fetchUrl', { url: 'https://example.com', credentials: 'same-origin', confirmed: true }, false, 'fetchUrl invalid credentials payload');
expectPayload('fetchUrl', { url: 'https://example.com', credentials: 'include', confirmed: true }, false, 'fetchUrl missing sensitive confirmation payload');
expectPayload('fetchUrl', { url: 'https://example.com', credentials: 'include', confirmed: true, confirmSensitive: true }, true, 'fetchUrl sensitive confirmed payload');
expectPayload('fetchUrl', { url: 'https://example.com', maxChars: 1, confirmed: true }, false, 'fetchUrl invalid maxChars payload');
expectPayload('traceStart', { maxEvents: 50, confirmed: true }, true, 'traceStart maxEvents payload');
expectPayload('traceStart', { maxEvents: 1, confirmed: true }, false, 'traceStart invalid maxEvents payload');
expectPayload('traceSummary', {}, true, 'traceSummary read payload');
expectPayload('traceSummary', { allowExternal: true }, true, 'traceSummary allowExternal payload');
expectPayload('traceEvents', { limit: 2_000 }, true, 'traceEvents limit payload');
expectPayload('traceStop', { limit: 2_001 }, false, 'traceStop invalid limit payload');
expectPayload('historySearch', { limit: 200, confirmed: true }, true, 'historySearch limit payload');
expectPayload('bookmarksSearch', { limit: 201, confirmed: true }, false, 'bookmarksSearch invalid limit payload');
expectPayload('cookiesList', { url: 'https://example.com', limit: 500, confirmed: true }, true, 'cookiesList limit payload');
expectPayload('cookiesList', { url: 'https://example.com', limit: 501, confirmed: true }, false, 'cookiesList invalid limit payload');
expectPayload('cookiesList', { confirmed: true }, false, 'cookiesList whole jar missing sensitive confirmation payload');
expectPayload('cookiesList', { confirmed: true, confirmSensitive: true }, true, 'cookiesList whole jar sensitive confirmed payload');
expectPayload('storageSnapshot', { maxValueChars: 50, confirmed: true }, true, 'storageSnapshot maxValueChars payload');
expectPayload('storageSnapshot', { maxValueChars: 49, confirmed: true }, false, 'storageSnapshot invalid maxValueChars payload');
expectPayload('storageSnapshot', { includeValues: true, confirmed: true }, false, 'storageSnapshot missing sensitive confirmation payload');
expectPayload('storageSnapshot', { includeValues: true, confirmed: true, confirmSensitive: true }, true, 'storageSnapshot sensitive confirmed payload');
expectPayload('askUser', { question: 'Continue?', choices: ['Yes', { value: 'no', label: 'No' }] }, true, 'askUser choices payload');
expectPayload('askUser', { question: 'Continue?', choices: [123] }, false, 'askUser invalid choice payload');
expectPayload('askUser', { question: 'Continue?', choices: Array.from({ length: 9 }, (_, index) => `Choice ${index}`) }, false, 'askUser too many choices payload');
expectPayload('askUser', { question: 'Continue?', timeoutMs: 5_000 }, true, 'askUser timeoutMs payload');
expectPayload('askUser', { question: 'Continue?', timeoutMs: 4_999 }, false, 'askUser invalid timeoutMs payload');
expectPayload('askUser', {}, false, 'askUser missing question payload');
expectPayload('clickAt', { x: 0, y: 0, confirmed: true }, true, 'clickAt zero coordinates payload');
expectPayload('clickAt', { y: 5, confirmed: true }, false, 'clickAt missing x payload');
expectPayload('click', { confirmed: true }, false, 'click missing selector payload');
expectPayload('type', { selector: '#name', text: '', confirmed: true }, true, 'type empty text payload');
expectPayload('type', { selector: '#name', confirmed: true }, false, 'type missing text payload');
expectPayload('press', { confirmed: true }, false, 'press missing key payload');
expectPayload('select', { confirmed: true }, false, 'select missing selector payload');
expectPayload('listSelectOptions', {}, false, 'select-options missing selector payload');
expectPayload('click', { selector: 'button', confirmed: true, unknown: true }, false, 'unknown payload key rejection');

const catalogPath = path.join(rootDir, 'docs/COMMAND-CATALOG.md');
const catalogText = await fs.readFile(catalogPath, 'utf8');
check(catalogText === commandCatalogMarkdown(), 'docs/COMMAND-CATALOG.md is not generated from the current registry');
check(
  commandCatalogMarkdown().includes('| Action | Category | Risk | Default Timeout | CLI | MCP | Confirm | Direct Payload Keys | Summary |'),
  'generated command catalog action table must include default timeout and direct payload keys',
);
check(
  commandCatalogMarkdown().includes('| ID | Category | Risk | Default Timeout | CLI | MCP | Live Bridge | Summary |'),
  'generated command catalog local table must include default timeout',
);
check(
  commandCatalogMarkdown().includes('## CLI Usage Signatures'),
  'generated command catalog must include registry-owned CLI usage signatures',
);
check(
  commandCatalogMarkdown().includes('## Debugger-Serialized Actions'),
  'generated command catalog must include debugger-serialized action metadata',
);
check(
  commandCatalogMarkdown().includes('tabId, allowExternal'),
  'generated command catalog must expose direct payload key metadata',
);
check(
  commandCatalogMarkdown().includes('| windows | scope | read | 10000 ms | windows | chrome_bridge_windows | conditional |'),
  'generated command catalog must expose conditional confirmation metadata',
);
check(
  commandCatalogMarkdown().includes('| doctor | diagnostic | read | 10000 ms | doctor | - | optional |'),
  'generated command catalog must expose optional live bridge metadata for doctor',
);
check(serverText.includes('commandDefaultTimeoutMs'), 'server must import/use commandDefaultTimeoutMs');
check(serverText.includes('return commandDefaultTimeoutMs(action)'), 'server command timeout default must derive from registry action metadata');
check(serverText.includes('commandTimeoutMs(action, timeoutMs)'), 'server /command path must pass action to timeout resolver');
check(serverText.includes('VERSION_UNKNOWN'), 'server must fail closed when a connected extension has not reported its version');
check(serverText.includes('state.extensionInfo = null'), 'server websocket reconnect must not inherit a previously verified extension version');
check(serverText.includes('function requireExtensionOrigin(req)'), 'server must centralize extension-origin ingress checks');
check(serverText.includes('INVALID_EXTENSION_ORIGIN'), 'server extension ingress must return a stable invalid-origin error code');
check(serverText.includes('function requireExtensionIdentity(req, info = {})'), 'server must verify extension origin/id parity when the extension reports an id');
check(serverText.includes('EXTENSION_ID_MISMATCH'), 'server extension ingress must return a stable extension-id mismatch code');
check(serverText.includes('function requireKnownExtensionOrigin(req)'), 'server long-poll fallback must verify known extension id on poll requests');
check(serverText.includes('!isExtensionOrigin(req)'), 'server websocket ingress must require a chrome-extension origin');
check(serverText.includes('function requireCommandOrigin(req)'), 'server must reject web origins on direct command ingress');
check(serverText.includes('INVALID_COMMAND_ORIGIN'), 'server command ingress must return a stable invalid-origin error code');
check(serverText.includes('Direct command ingress rejects browser and extension origins'), 'server direct command ingress must be originless-only for local CLI/MCP clients');
check(serverText.includes('function isExtensionIngressPath(req)'), 'server CORS must be scoped to extension ingress paths');
check(serverText.includes('isExtensionIngressPath(req) && origin.startsWith'), 'server CORS must not expose direct /command to extension origins');
check(serverText.includes('function validateCommandEnvelope(body)'), 'server must validate the direct /command envelope before dispatch');
check(serverText.includes("const COMMAND_BODY_KEYS = new Set(['action', 'payload', 'timeoutMs'])"), 'server command envelope keys must stay explicit');
check(serverText.includes('function requireJsonContentType(req)'), 'server must require application/json for POST JSON endpoints');
check(serverText.includes('UNSUPPORTED_MEDIA_TYPE'), 'server must return a stable media-type error code');
check(serverText.includes('function drainRequestBody(req)'), 'server oversized request handling must drain remaining request bytes');
check(serverText.includes('EXTENSION_NOT_CONNECTED'), 'server must return a stable code when the extension is disconnected');
check(cliText.includes('timeoutMs ?? commandDefaultTimeoutMs(action)'), 'CLI command wrapper must default to registry action timeout');
check(cliText.includes('function normalizeHttpMethod(value)'), 'CLI must normalize and validate request --method');
check(functionBlock(cliText, 'doctor').includes("Boolean(args['live-checks'])"), 'CLI doctor must keep live checks behind --live-checks');
check(functionBlock(cliText, 'doctor').includes('Pass --live-checks'), 'CLI doctor offline mode must explain how to opt into live checks');
check(functionBlock(cliText, 'doctor').includes('runtime-smoke --coverage-plan'), 'CLI doctor offline mode must recommend the offline runtime smoke coverage plan');
check(cliText.includes('function tomlString(value)'), 'CLI codex-config must escape TOML strings');
check(cliText.includes('command = ${tomlString(process.execPath)}'), 'CLI codex-config must use the current Node executable');
check(!cliText.includes('/opt/homebrew/bin/node'), 'CLI codex-config must not hardcode a Homebrew Node path');
check(cliText.includes("if (!args.confirm) throw new Error('reload-extension requires --confirm')"), 'CLI reload-extension must require --confirm');
check(CLI_USAGE_LINES.includes('chrome-bridge runtime-smoke [--keep-tab] [--coverage-plan]'), 'runtime-smoke CLI usage must expose offline coverage-plan mode');
check(packageJson.scripts?.['runtime-smoke:plan'] === 'node ./bin/chrome-bridge.mjs runtime-smoke --coverage-plan', 'package scripts must expose offline runtime smoke coverage plan');
check(packageJson.scripts?.['check:runtime-smoke-plan'] === 'node ./scripts/check-runtime-smoke-plan.mjs', 'package scripts must expose runtime smoke plan contract check');
check(packageJson.scripts?.check?.includes('npm run check:runtime-smoke-plan'), 'npm run check must include runtime smoke plan contract check');
check(readmeText.includes('npm run runtime-smoke:plan') && readmeText.includes('runtime-smoke --coverage-plan'), 'README must document offline runtime smoke coverage plan');
check(publishingText.includes('npm run runtime-smoke:plan'), 'publishing checklist must use the canonical offline runtime smoke plan script');
check(roadmapText.includes('npm run runtime-smoke:plan'), 'deferred runtime roadmap must use the canonical offline runtime smoke plan script');
check(packageContentsCheckerText.includes("'scripts/check-runtime-smoke-plan.mjs'"), 'package contents must include runtime smoke plan checker');
check(pullRequestTemplateText.includes('npm run check:runtime-smoke-plan'), 'pull request template must include offline runtime smoke plan check');
check(pullRequestTemplateText.includes('verification.status: "passed"'), 'pull request template must document live runtime smoke success criteria');
check(contributingText.includes('npm run check:runtime-smoke-plan'), 'contributing guide must include offline runtime smoke plan check');
check(contributingText.includes('verification.status: "passed"'), 'contributing guide must document live runtime smoke success criteria');
check(codexChromeBridgeSkillText.includes('runtime-smoke --coverage-plan'), 'bundled Codex chrome-bridge skill must recommend offline runtime smoke plan before live smoke');
check(codexChromeBridgeSkillText.includes('verification.status: "passed"'), 'bundled Codex chrome-bridge skill must document live runtime smoke success criteria');
check(mcpText.includes('timeoutMs ?? commandDefaultTimeoutMs(action)'), 'MCP bridgeCommand wrapper must default to registry action timeout');
check(mcpText.includes('chrome_bridge_reload_extension') && mcpText.includes('confirmed: z.boolean()'), 'MCP reload extension tool must require confirmed=true');
check(mcpText.includes('coveragePlan: z.boolean().optional()'), 'MCP runtime smoke tool must expose coveragePlan option');
check(mcpText.includes("if (args.coveragePlan) cliArgs.push('--coverage-plan')"), 'MCP runtime smoke helper must forward coveragePlan to CLI');
check(mcpText.includes('z.enum(HTTP_METHODS)'), 'MCP request method schema must use the shared HTTP method allowlist');
check(cliText.includes('includeSnapshot') && cliText.includes('includeScreenshot'), 'CLI debug bundle page artifacts must be explicit opt-in');
check(mcpText.includes('includeSnapshot: z.boolean().optional()') && mcpText.includes('includeScreenshot: z.boolean().optional()'), 'MCP debug bundle page artifacts must be explicit opt-in');
check(cliText.includes('function redactDebugBundleValue(value)') && mcpText.includes('function redactDebugBundleValue(value)'), 'debug bundle JSON artifacts must pass through a redaction helper');
check(cliText.includes("args['include-trace-events']") && mcpText.includes('includeTraceEvents: z.boolean().optional()'), 'debug bundle full trace events must be explicit opt-in');
check(COMMAND_METADATA.traceSummary?.summary?.includes('metadata'), 'registry must expose a traceSummary metadata-only action');
const cliDebugBundleBlock = functionBlock(cliText, 'debugBundle');
const mcpDebugBundleBlock = functionBlock(mcpText, 'debugBundle');
const runtimeSmokeBlock = functionBlock(cliText, 'runtimeSmoke');
const runtimeSmokeLiveVerificationBlock = functionBlock(cliText, 'runtimeSmokeLiveVerification');
const runtimeSmokeCoveragePlanBlock = functionBlock(cliText, 'runtimeSmokeCoveragePlan');
const runtimeSmokeCoverageBlock = functionBlock(cliText, 'runtimeSmokeCoverage');
const runtimeSmokeRequiredCoverageBlock = /const RUNTIME_SMOKE_REQUIRED_COVERAGE = Object\.freeze\(\[[\s\S]*?\]\);/.exec(cliText)?.[0] || '';
const listSelectOptionsBlock = functionBlock(pageScriptsText, 'listSelectOptionsInPage');
check(
  cliDebugBundleBlock.includes("command('traceSummary'")
    && cliDebugBundleBlock.includes('if (includeTraceEvents)')
    && cliDebugBundleBlock.includes("command('traceEvents'"),
  'CLI debug bundle must use traceSummary by default and reserve traceEvents for the explicit includeTraceEvents branch',
);
check(
  mcpDebugBundleBlock.includes("bridgeCommand('traceSummary'")
    && mcpDebugBundleBlock.includes('if (includeTraceEvents)')
    && mcpDebugBundleBlock.includes("bridgeCommand('traceEvents'"),
  'MCP debug bundle must use traceSummary by default and reserve traceEvents for the explicit includeTraceEvents branch',
);
check(cliText.includes("addJson('session-summary.json', redactDebugBundleValue(summary))"), 'CLI debug bundle session summary must be redacted');
check(mcpText.includes("addJson('session-summary.json', redactDebugBundleValue(summary))"), 'MCP debug bundle session summary must be redacted');
check(!LOCAL_COMMAND_METADATA['debug-bundle'].summary.includes('screenshot'), 'debug-bundle catalog summary must not imply screenshot capture by default');
for (const smokeStep of [
  'workspace includes smoke tab',
  'set strict smoke workspace',
  'strict policy rejects outside tab even with allowExternal',
  'session summary covers strict policy',
  'debug bundle default redaction',
  'cleanup close outside smoke group',
  'cleanup close smoke tab',
  'clear strict smoke workspace',
]) {
  check(runtimeSmokeBlock.includes(smokeStep), `runtime-smoke must cover deferred roadmap step: ${smokeStep}`);
}
check(runtimeSmokeBlock.includes("debugBundle({") && runtimeSmokeBlock.includes('readJsonFile'), 'runtime-smoke must inspect debug-bundle files without enabling page artifacts');
check(runtimeSmokeBlock.includes('assertTabCleanupMitigation'), 'runtime-smoke must assert tab cleanup mitigation metadata');
check(runtimeSmokeBlock.includes('savedGroupPersistence'), 'runtime-smoke must assert saved tab-group persistence metadata');
check(runtimeSmokeBlock.includes('RUNTIME_SMOKE_REQUIRED_COVERAGE'), 'runtime-smoke must declare required coverage names');
check(runtimeSmokeBlock.indexOf("args['coverage-plan']") >= 0, 'runtime-smoke must support offline coverage-plan mode');
check(
  runtimeSmokeBlock.indexOf("args['coverage-plan']") < runtimeSmokeBlock.indexOf("bridgeFetch('/health')"),
  'runtime-smoke coverage-plan mode must return before live bridge health checks',
);
check(runtimeSmokeCoveragePlanBlock.includes("status: 'not-run'"), 'runtime-smoke coverage-plan output must mark live verification as not-run');
check(runtimeSmokeCoveragePlanBlock.includes('liveVerificationRequired: true'), 'runtime-smoke coverage-plan output must explicitly require final live verification');
check(runtimeSmokeCoveragePlanBlock.includes('coverageOk: true'), 'runtime-smoke coverage-plan output must document coverage.ok success criteria');
check(runtimeSmokeLiveVerificationBlock.includes("'passed'") && runtimeSmokeLiveVerificationBlock.includes("'failed'") && runtimeSmokeLiveVerificationBlock.includes('status: effectiveStatus'), 'runtime-smoke live output must include explicit passed/failed verification states');
check(runtimeSmokeBlock.includes("runtimeSmokeLiveVerification({ status: 'skipped'"), 'runtime-smoke stale-extension output must include explicit skipped verification state');
check(runtimeSmokeBlock.includes('verification: runtimeSmokeLiveVerification({'), 'runtime-smoke final output must include machine-readable live verification metadata');
check(runtimeSmokeBlock.includes("runtimeSmokeLiveVerification({ status: 'skipped'"), 'runtime-smoke version mismatch skip must include verification metadata');
for (const coverageStep of [
  'tabs scoped includes smoke tab',
  'viewport screenshot',
  'selector screenshot',
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
]) {
  check(runtimeSmokeRequiredCoverageBlock.includes(`'${coverageStep}'`), `runtime-smoke required coverage must include ${coverageStep}`);
}
check(runtimeSmokeBlock.includes('const coverage = runtimeSmokeCoverage(steps)'), 'runtime-smoke must compute machine-readable coverage from completed steps');
check(runtimeSmokeBlock.includes('const ok = failures.length === 0 && coverage.ok') && runtimeSmokeBlock.includes('ok,'), 'runtime-smoke ok must fail when required coverage is missing');
check(runtimeSmokeCoverageBlock.includes('requiredCount') && runtimeSmokeCoverageBlock.includes('coveredCount') && runtimeSmokeCoverageBlock.includes('missingCount'), 'runtime-smoke coverage must include machine-readable coverage counts');
check(runtimeSmokeBlock.includes('coverage,'), 'runtime-smoke result must include machine-readable coverage');
check(debuggerSessionText.includes('const debuggerLocks = new Map()'), 'extension must maintain per-tab debugger locks');
check(functionBlock(debuggerSessionText, 'withTabLock').includes('debuggerLocks.set(tabId, next)'), 'withTabLock must serialize debugger work per tab');
check(functionBlock(debuggerSessionText, 'withDebugger').includes('return withTabLock(tabId'), 'withDebugger must run under the per-tab debugger lock');
check((debuggerSessionText.match(/chrome\.debugger\.sendCommand/g) || []).length === 1, 'extension must send debugger commands only through sendDebuggerCommand');
check((debuggerSessionText.match(/chrome\.debugger\.detach/g) || []).length === 1, 'extension must detach debugger only through detachDebugger');
check(functionBlock(debuggerSessionText, 'startTraceForTab').includes('withTabLock(tab.id'), 'traceStart debugger action must use the serialized debugger wrapper');
check(functionBlock(debuggerSessionText, 'stopTraceForTab').includes('withTabLock(tab.id'), 'traceStop debugger action must use the serialized debugger wrapper');

const debuggerActionFunctions = {
  screenshot: 'screenshot',
  printPdf: 'printPdf',
  clickAt: 'clickAt',
  hover: 'hover',
  type: 'typeInto',
  press: 'pressKey',
  handleDialog: 'handleDialog',
  uploadFile: 'uploadFile',
  traceStart: 'traceStart',
  traceStop: 'traceStop',
};

for (const action of DEBUGGER_SERIALIZED_ACTIONS) {
  const source = ['screenshot', 'printPdf'].includes(action)
    ? pageArtifactsText
    : (['clickAt', 'hover', 'type', 'press', 'handleDialog', 'uploadFile'].includes(action)
      ? pageInteractionsText
      : (['traceStart', 'traceStop'].includes(action) ? traceActionsText : backgroundText));
  const block = functionBlock(source, debuggerActionFunctions[action]);
  check(block, `${action} debugger action function is missing`);
  if (action === 'traceStart') {
    check(block.includes('startTraceForTab('), `${action} debugger action must use the serialized debugger wrapper`);
  } else if (action === 'traceStop') {
    check(block.includes('stopTraceForTab('), `${action} debugger action must use the serialized debugger wrapper`);
  } else {
    check(block.includes('withDebugger('), `${action} debugger action must use the serialized debugger wrapper`);
  }
}
check(mcpText.includes('const navigationUrlSchema'), 'MCP must define navigationUrlSchema for http/https/about:blank');
check(mcpText.includes('const webUrlSchema'), 'MCP must define webUrlSchema for http/https-only URL tools');
check(!mcpText.includes('z.string().url()'), 'MCP must not use broad z.string().url() because it accepts unsafe URL schemes');
check(!cliText.includes("confirmSensitive: Boolean(args['confirm-sensitive'])"), 'CLI must not emit confirmSensitive=false by default');
check(pageScriptsText.includes('function formFieldValueState(field'), 'form helpers must report value state without exposing values');
check(!pageScriptsText.includes('value: field.value'), 'extract form fields must not expose current field values');
check(!pageScriptsText.includes('selectedIndex: field'), 'extract form fields must not expose current select indexes');
check(!pageScriptsText.includes('before,'), 'fill-form preview must not expose current field values');
check(!pageScriptsText.includes('after: nextValue'), 'fill-form preview must not echo planned field values');
check(!listSelectOptionsBlock.includes('selectedIndex'), 'select-options must not expose current selected index without confirmation');
check(!listSelectOptionsBlock.includes('value: select.value'), 'select-options must not expose current selected value without confirmation');
check(!listSelectOptionsBlock.includes('selected: option.selected'), 'select-options must not expose current selected option without confirmation');
check(functionBlock(navigationActionsText, 'listTabs').includes("requireConfirmed(payload, 'tabs includeAll')"), 'extension tabs includeAll must require confirmation');
check(functionBlock(navigationActionsText, 'listWindows').includes("requireConfirmed(payload, 'windows includeAll')"), 'extension windows includeAll must require confirmation');
check(functionBlock(runtimeActionsText, 'reloadExtension').includes("requireConfirmed(payload, 'reloadExtension')"), 'extension reloadExtension must require confirmation');
check(backgroundText.includes("from './browser-data.js';"), 'extension background must import private browser-data handlers from extension/browser-data.js');
for (const helperName of ['historySearch', 'bookmarksSearch', 'flattenBookmarks', 'cookiesList', 'fetchUrl']) {
  check(!functionBlock(backgroundText, helperName), `extension background must not own browser-data internals: ${helperName}`);
}
check(browserDataText.includes('export async function historySearch'), 'extension browser data module must export historySearch');
check(browserDataText.includes('export async function bookmarksSearch'), 'extension browser data module must export bookmarksSearch');
check(browserDataText.includes('export async function cookiesList'), 'extension browser data module must export cookiesList');
check(browserDataText.includes('export async function fetchUrl'), 'extension browser data module must export fetchUrl');
check(functionBlock(browserDataText, 'historySearch').includes("requireConfirmed(payload, 'historySearch')"), 'extension browser data history must require confirmation');
check(functionBlock(browserDataText, 'cookiesList').includes("requireSensitiveConfirmed(payload, 'cookiesList without url/domain/name')"), 'extension browser data cookies whole-jar reads must require sensitive confirmation');
check(functionBlock(browserDataText, 'fetchUrl').includes("requireSensitiveConfirmed(payload, 'fetchUrl credentials=include')"), 'extension browser data credentialed requests must require sensitive confirmation');
check(runtimeActionsText.includes("import { requireConfirmed } from './safety-gates.js';"), 'extension runtime actions must import safety gates from extension/safety-gates.js');
check(!backgroundText.includes('function requireConfirmed'), 'extension background must not own confirmation gate internals');
check(!backgroundText.includes('function requireSensitiveConfirmed'), 'extension background must not own confirmation gate internals');
check(functionBlock(safetyGatesText, 'requireConfirmed').includes('confirmed=true'), 'safety gates module must enforce mutation confirmation');
check(functionBlock(safetyGatesText, 'requireSensitiveConfirmed').includes('confirmSensitive=true'), 'safety gates module must enforce sensitive confirmation');
check(backgroundText.includes("from './runtime-actions.js';"), 'extension background must import runtime actions from extension/runtime-actions.js');
check(!functionBlock(backgroundText, 'reloadExtension'), 'extension background must not own runtime action internals: reloadExtension');
check(runtimeActionsText.includes('export function reloadExtension'), 'extension runtime actions module must export reloadExtension');
check(functionBlock(runtimeActionsText, 'reloadExtension').includes('chrome.runtime.reload()'), 'extension runtime actions module must own runtime reload call');
check(backgroundText.includes("from './debugger-session.js';"), 'extension background must import debugger session helpers from extension/debugger-session.js');
check(!backgroundText.includes('traceSessions'), 'extension background must not own debugger trace session state');
check(!backgroundText.includes('debuggerLocks'), 'extension background must not own debugger lock state');
check(!backgroundText.includes('function withDebugger'), 'extension background must not own debugger lifecycle internals');
check(!backgroundText.includes('function sendDebuggerCommand'), 'extension background must not own debugger command internals');
check(!backgroundText.includes('function recordDebuggerEvent'), 'extension background must not own debugger event internals');
check(functionBlock(debuggerSessionText, 'withDebugger').includes('chrome.debugger.attach'), 'extension debugger session module must own debugger attach lifecycle');
check(functionBlock(debuggerSessionText, 'sendDebuggerCommand').includes('chrome.debugger.sendCommand'), 'extension debugger session module must own debugger commands');
check(functionBlock(debuggerSessionText, 'recordDebuggerEvent').includes('Network.responseReceived'), 'extension debugger session module must record trace debugger events');
check(debuggerSessionText.includes('traceSessions') && debuggerSessionText.includes('MAX_TRACE_EVENTS'), 'extension debugger session module must own trace session buffering');
check(pageInteractionsText.includes("import { keyEventPayload } from './keyboard-events.js';"), 'extension page interactions must import trusted key event mapping from extension/keyboard-events.js');
check(!backgroundText.includes('function keyEventPayload'), 'extension background must not own trusted key event mapping internals');
check(!backgroundText.includes('function keyCodeFor'), 'extension background must not own trusted key code mapping internals');
check(!backgroundText.includes('function virtualKeyCodeFor'), 'extension background must not own trusted virtual-key mapping internals');
check(functionBlock(keyboardEventsText, 'keyEventPayload').includes('windowsVirtualKeyCode'), 'extension keyboard event module must serialize debugger key events');
check(functionBlock(keyboardEventsText, 'keyCodeFor').includes('ArrowUp'), 'extension keyboard event module must map named key codes');
check(functionBlock(keyboardEventsText, 'virtualKeyCodeFor').includes('ArrowUp'), 'extension keyboard event module must map virtual key codes');
check(backgroundText.includes("from './navigation-actions.js';"), 'extension background must import navigation actions from extension/navigation-actions.js');
for (const helperName of ['listTabs', 'listWindows', 'ensureCodexTab', 'adoptTab', 'openTab', 'createGroupedTab', 'groupStatus', 'workspaceStatus', 'setWorkspace', 'clearWorkspace', 'activateTab', 'closeTab', 'closeGroup', 'goBack', 'goForward', 'reloadTab']) {
  check(!functionBlock(backgroundText, helperName), `extension background must not own navigation action internals: ${helperName}`);
}
for (const helperName of ['listTabs', 'listWindows', 'ensureCodexTab', 'adoptTab', 'openTab', 'groupStatus', 'workspaceStatus', 'setWorkspace', 'clearWorkspace', 'activateTab', 'closeTab', 'closeGroup', 'goBack', 'goForward', 'reloadTab']) {
  check(navigationActionsText.includes(`export async function ${helperName}`), `extension navigation actions module must export ${helperName}`);
}
check(functionBlock(navigationActionsText, 'openTab').includes('createGroupedTab(payload)'), 'extension navigation actions module must keep grouped new-tab creation path');
check(functionBlock(navigationActionsText, 'setWorkspace').includes("requireConfirmed(payload, 'setWorkspace')"), 'extension setWorkspace must require confirmation');
check(functionBlock(navigationActionsText, 'closeTab').includes('closeTabsWithGroupPersistenceMitigation([tab])'), 'closeTab must use ungroup-before-close mitigation');
check(functionBlock(navigationActionsText, 'closeGroup').includes('closeTabsWithGroupPersistenceMitigation(tabs)'), 'closeGroup must use ungroup-before-close mitigation');
check(pageInteractionsText.includes("import { tabInfo } from './tab-info.js';") && navigationActionsText.includes("import { groupInfo, tabInfo } from './tab-info.js';"), 'extension tab/group serializers must be imported by active extension modules');
check(!backgroundText.includes('function groupInfo'), 'extension background must not own tab/group serializer internals');
check(!backgroundText.includes('function tabInfo'), 'extension background must not own tab/group serializer internals');
check(functionBlock(tabInfoText, 'groupInfo').includes('collapsed'), 'extension tab info module must serialize tab group metadata');
check(functionBlock(tabInfoText, 'tabInfo').includes('groupInfo(group)') && functionBlock(tabInfoText, 'tabInfo').includes('status'), 'extension tab info module must serialize tab metadata with group info');
check(navigationActionsText.includes("from './tab-loading.js';"), 'extension navigation actions must import tab loading helper from extension/tab-loading.js');
check(!backgroundText.includes('function waitForTabComplete'), 'extension background must not own tab loading internals');
check(!backgroundText.includes('function delay'), 'extension background must not own tab loading delay internals');
check(functionBlock(tabLoadingText, 'waitForTabComplete').includes("tab.status === 'complete'"), 'extension tab loading module must wait for complete tab status');
check(functionBlock(tabLoadingText, 'waitForTabComplete').includes('chrome.tabs.get'), 'extension tab loading module must poll Chrome tab state');
check(backgroundText.includes("from './trace-actions.js';"), 'extension background must import trace actions from extension/trace-actions.js');
for (const helperName of ['traceStart', 'traceEvents', 'traceSummaryCommand', 'traceStop']) {
  check(!functionBlock(backgroundText, helperName), `extension background must not own trace action internals: ${helperName}`);
}
for (const helperName of ['traceStart', 'traceEvents', 'traceSummaryCommand', 'traceStop']) {
  check(traceActionsText.includes(`export async function ${helperName}`), `extension trace actions module must export ${helperName}`);
}
check(functionBlock(traceActionsText, 'traceStart').includes("requireConfirmed(payload, 'traceStart')"), 'extension traceStart must require confirmation');
check(functionBlock(traceActionsText, 'traceStart').includes('startTraceForTab(tab, payload)'), 'extension traceStart must call debugger trace start helper');
check(functionBlock(traceActionsText, 'traceStop').includes('stopTraceForTab(tab, payload)'), 'extension traceStop must call debugger trace stop helper');
check(backgroundText.includes("from './user-prompts.js';"), 'extension background must import user prompt lifecycle helpers from extension/user-prompts.js');
check(!backgroundText.includes('pendingUserPrompts'), 'extension background must not own user prompt state');
check(!backgroundText.includes('function normalizePromptChoices'), 'extension background must not own user prompt choice normalization');
check(!functionBlock(backgroundText, 'createPromptTab'), 'extension background must not own user prompt tab creation');
check(!functionBlock(backgroundText, 'restoreStoredCodexTarget'), 'extension background must not own user prompt target restoration');
check(!functionBlock(backgroundText, 'completeUserPrompt'), 'extension background must not own user prompt completion');
check(userPromptsText.includes('const pendingUserPrompts = new Map()'), 'extension user prompt module must own pending prompt state');
check(userPromptsText.includes('export async function askUser'), 'extension user prompt module must export askUser');
check(userPromptsText.includes('export function completeUserPrompt'), 'extension user prompt module must export completeUserPrompt');
check(userPromptsText.includes('export function userPromptResponse'), 'extension user prompt module must export userPromptResponse for ask page reads');
check(userPromptsText.includes('export function handlePromptTabRemoved'), 'extension user prompt module must export prompt tab removal cleanup');
check(functionBlock(userPromptsText, 'askUser').includes('chrome.runtime.getURL'), 'extension user prompt module must open local ask page URLs');
check(
  functionBlock(userPromptsText, 'askUser').includes('closeTabsWithGroupPersistenceMitigation([tab], { ignoreMissing: true })')
    && functionBlock(userPromptsText, 'completeUserPrompt').includes('closeTabsWithGroupPersistenceMitigation([prompt.tabId], { ignoreMissing: true })'),
  'extension user prompt module must keep ungroup-before-close cleanup mitigation',
);
check(navigationActionsText.includes("from './workspace-tabs.js';") && pageInteractionsText.includes("from './workspace-tabs.js';") && traceActionsText.includes("from './workspace-tabs.js';"), 'extension action modules must import workspace tab helpers from extension/workspace-tabs.js');
for (const helperName of ['storageGet', 'storageSet', 'storageRemove', 'getTargetTab', 'getStoredCodexGroup', 'getCodexGroupTabs', 'ensureCodexGroupForTab', 'assertCodexScopedTab']) {
  check(!functionBlock(backgroundText, helperName), `extension background must not own workspace tab helper internals: ${helperName}`);
}
check(workspaceTabsText.includes('export async function getTargetTab'), 'extension workspace tabs module must export getTargetTab');
check(workspaceTabsText.includes('export async function ensureCodexGroupForTab'), 'extension workspace tabs module must export ensureCodexGroupForTab');
check(functionBlock(workspaceTabsText, 'getTargetTab').includes("policyMode === 'strict'"), 'extension workspace tabs module must enforce strict outside-tab policy');
check(functionBlock(workspaceTabsText, 'ensureCodexGroupForTab').includes('chrome.tabs.group'), 'extension workspace tabs module must own tab grouping');
check(functionBlock(workspaceTabsText, 'storageSet').includes('chrome.storage.local.set'), 'extension workspace tabs module must own workspace storage writes');
check(backgroundText.includes("import { extensionErrorCode, extensionErrorDetails } from './extension-errors.js';"), 'extension background must import error classification helpers from extension/extension-errors.js');
check(!backgroundText.includes('function extensionErrorCode'), 'extension background must not own extension error helper internals');
check(!backgroundText.includes('function extensionErrorDetails'), 'extension background must not own extension error helper internals');
check(functionBlock(extensionErrorsText, 'extensionErrorCode').includes('TAB_SCOPE_VIOLATION'), 'extension error module must classify tab-scope violations');
check(functionBlock(extensionErrorsText, 'extensionErrorDetails').includes('details.name'), 'extension error module must preserve safe error details');
check(backgroundText.includes("import { startBridge } from './offscreen-lifecycle.js';"), 'extension background must import offscreen lifecycle helper from extension/offscreen-lifecycle.js');
check(!backgroundText.includes('function ensureOffscreen'), 'extension background must not own offscreen lifecycle internals');
check(!backgroundText.includes('async function startBridge'), 'extension background must not own offscreen lifecycle internals');
check(functionBlock(offscreenLifecycleText, 'ensureOffscreen').includes('chrome.offscreen.createDocument'), 'offscreen lifecycle module must create the offscreen document');
check(functionBlock(offscreenLifecycleText, 'startBridge').includes('ensureOffscreen'), 'offscreen lifecycle module must export startup retry helper');
check(pageInteractionsText.includes("import { execute } from './page-execution.js';"), 'extension page interactions must import page execution helper from extension/page-execution.js');
check(!functionBlock(backgroundText, 'execute'), 'extension background must not own page execution helper internals');
check(pageExecutionText.includes('export async function execute'), 'extension page execution module must export execute');
check(functionBlock(pageExecutionText, 'execute').includes('chrome.scripting.executeScript'), 'extension page execution module must own chrome.scripting execution');
check(functionBlock(pageExecutionText, 'execute').includes("world: options.world || 'ISOLATED'"), 'extension page execution module must preserve isolated-world default');
check(backgroundText.includes("from './page-artifacts.js';"), 'extension background must import page artifact actions from extension/page-artifacts.js');
for (const helperName of ['screenshot', 'printPdf']) {
  check(!functionBlock(backgroundText, helperName), `extension background must not own page artifact action internals: ${helperName}`);
  check(pageArtifactsText.includes(`export async function ${helperName}`), `extension page artifacts module must export ${helperName}`);
}
check(functionBlock(pageArtifactsText, 'screenshot').includes('chrome.tabs.captureVisibleTab'), 'extension page artifacts module must own viewport screenshot capture');
check(functionBlock(pageArtifactsText, 'screenshot').includes('Page.captureScreenshot'), 'extension page artifacts module must own debugger screenshot capture');
check(functionBlock(pageArtifactsText, 'screenshot').includes('setTimeout'), 'extension page artifacts module must own viewport capture delay');
check(functionBlock(pageArtifactsText, 'printPdf').includes('Page.printToPDF'), 'extension page artifacts module must own PDF printing');
check(backgroundText.includes("from './page-read-actions.js';"), 'extension background must import page read actions from extension/page-read-actions.js');
for (const helperName of ['waitForSelector', 'observe', 'findElements', 'elementFilters', 'extractPage', 'snapshot', 'pageText', 'pageHTML', 'listSelectOptions', 'storageSnapshot']) {
  check(!functionBlock(backgroundText, helperName), `extension background must not own page read action internals: ${helperName}`);
}
for (const helperName of ['waitForSelector', 'observe', 'findElements', 'extractPage', 'snapshot', 'pageText', 'pageHTML', 'listSelectOptions', 'storageSnapshot']) {
  check(pageReadActionsText.includes(`export async function ${helperName}`), `extension page read actions module must export ${helperName}`);
}
check(functionBlock(pageReadActionsText, 'observe').includes('collectObserve'), 'extension page read actions module must use page observation scripts');
check(functionBlock(pageReadActionsText, 'findElements').includes('elementFilters'), 'extension page read actions module must preserve element filter echo');
check(functionBlock(pageReadActionsText, 'storageSnapshot').includes("requireSensitiveConfirmed(payload, 'storageSnapshot includeValues')"), 'extension page read actions storage snapshot must require sensitive confirmation for values');
check(backgroundText.includes("from './page-interactions.js';"), 'extension background must import page interactions from extension/page-interactions.js');
for (const helperName of ['scroll', 'click', 'clickAt', 'hover', 'typeInto', 'pressKey', 'selectOption', 'fillForm', 'handleDialog', 'uploadFile']) {
  check(!functionBlock(backgroundText, helperName), `extension background must not own page interaction internals: ${helperName}`);
}
for (const helperName of ['scroll', 'click', 'clickAt', 'hover', 'typeInto', 'pressKey', 'selectOption', 'fillForm', 'handleDialog', 'uploadFile']) {
  check(pageInteractionsText.includes(`export async function ${helperName}`), `extension page interactions module must export ${helperName}`);
}
check(functionBlock(pageInteractionsText, 'click').includes("throw new Error('click requires confirmed=true')"), 'extension click interaction must require confirmation');
check(functionBlock(pageInteractionsText, 'fillForm').includes("if (!dryRun) requireConfirmed(payload, 'fillForm')"), 'extension fillForm must keep dry-run-first confirmation behavior');
check(functionBlock(pageInteractionsText, 'uploadFile').includes("requireConfirmed(payload, 'uploadFile')"), 'extension uploadFile must require confirmation');
check(navigationActionsText.includes("import { closeTabsWithGroupPersistenceMitigation } from './tab-cleanup.js';"), 'extension navigation actions must import tab cleanup helper from extension/tab-cleanup.js');
check(workspaceTabsText.includes("from './tab-group-persistence.js';"), 'extension workspace tabs must import tab-group persistence helpers');
check(tabCleanupText.includes("from './tab-group-persistence.js';"), 'extension tab cleanup must import tab-group persistence helpers');
check(!backgroundText.includes('function tabIdForClose'), 'extension background must not own tab cleanup helper internals');
check(!backgroundText.includes('async function closeTabsWithGroupPersistenceMitigation'), 'extension background must not own tab cleanup helper internals');
check(tabGroupPersistenceText.includes('export async function disableSavedTabGroupIfSupported'), 'extension tab-group persistence module must export disableSavedTabGroupIfSupported');
check(tabGroupPersistenceText.includes('export async function disableSavedTabGroupsForTabs'), 'extension tab-group persistence module must export disableSavedTabGroupsForTabs');
check(functionBlock(tabGroupPersistenceText, 'disableSavedTabGroupIfSupported').includes("'saved'"), 'extension tab-group persistence must detect Chrome saved-group support without assuming it exists');
check(functionBlock(tabGroupPersistenceText, 'disableSavedTabGroupIfSupported').includes('saved: false'), 'extension tab-group persistence must disable saved groups when Chrome exposes that API');
check(functionBlock(workspaceTabsText, 'ensureCodexGroupForTab').includes('disableSavedTabGroupIfSupported(group)'), 'extension workspace grouping must mark Codex groups ephemeral when Chrome supports it');
const tabCloseMitigationBlock = functionBlock(tabCleanupText, 'closeTabsWithGroupPersistenceMitigation');
check(tabCloseMitigationBlock.includes('disableSavedTabGroupsForTabs(tabs)'), 'extension tab cleanup must try saved-group disablement before ungroup-before-close');
check(tabCloseMitigationBlock.includes('chrome.tabs.ungroup'), 'extension tab cleanup must ungroup grouped bridge tabs before removing them');
check(tabCloseMitigationBlock.includes('chrome.tabs.remove'), 'extension tab cleanup mitigation must own tab removal');
check(
  tabCloseMitigationBlock.indexOf('chrome.tabs.ungroup') < tabCloseMitigationBlock.indexOf('chrome.tabs.remove'),
  'extension tab cleanup must attempt ungroup before remove',
);
check(
  tabCloseMitigationBlock.includes('throw new Error') && tabCloseMitigationBlock.includes('before close'),
  'extension tab cleanup must fail closed if grouped tabs cannot be ungrouped before close',
);
check((backgroundText.match(/chrome\.tabs\.remove/g) || []).length === 0, 'extension background must not remove tabs directly');
check((tabCleanupText.match(/chrome\.tabs\.remove/g) || []).length === 1, 'extension tab cleanup module must remove tabs only through closeTabsWithGroupPersistenceMitigation');
check(
  functionBlock(userPromptsText, 'askUser').includes('closeTabsWithGroupPersistenceMitigation([tab], { ignoreMissing: true })'),
  'askUser prompt race cleanup must use ungroup-before-close mitigation',
);
check(
  functionBlock(userPromptsText, 'completeUserPrompt').includes('closeTabsWithGroupPersistenceMitigation([prompt.tabId], { ignoreMissing: true })'),
  'askUser close-on-answer cleanup must use ungroup-before-close mitigation',
);

if (failures.length) {
  process.stderr.write(`${failures.map((failure) => `- ${failure}`).join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(JSON.stringify({
    ok: true,
    version: BRIDGE_VERSION,
    packageVersion: packageJson.version,
    manifestVersion: manifest.version,
    manifestPermissions: (manifest.permissions || []).length,
    actions: EXTENSION_ACTIONS.length,
    localCommands: LOCAL_COMMAND_CATALOG.length,
    cliCommands: CLI_COMMANDS.length,
    mcpTools: MCP_TOOLS.length,
  }, null, 2));
  process.stdout.write('\n');
}
