#!/usr/bin/env node
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { BRIDGE_VERSION } from '../shared/command-registry.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mcpPath = path.join(rootDir, 'mcp/chrome-bridge-mcp.mjs');
const failures = [];

function fail(message) {
  failures.push(message);
}

function check(condition, message) {
  if (!condition) fail(message);
}

function inheritedEnv(extra = {}) {
  return {
    ...Object.fromEntries(Object.entries(process.env).filter(([, value]) => typeof value === 'string')),
    ...extra,
  };
}

function parseToolJson(result, label) {
  const text = result?.content?.find((item) => item?.type === 'text')?.text;
  if (!text) {
    fail(`${label} did not return text content`);
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`${label} text content was not JSON: ${String(error?.message || error)}`);
    return null;
  }
}

async function withMcpClient(env, fn) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [mcpPath],
    cwd: rootDir,
    env: inheritedEnv(env),
    stderr: 'pipe',
  });
  const client = new Client({ name: 'chrome-bridge-mcp-runtime-smoke-check', version: '0.1.0' });

  let stderr = '';
  transport.stderr?.on('data', (chunk) => {
    stderr += String(chunk);
  });

  try {
    await client.connect(transport);
    return await fn(client);
  } catch (error) {
    fail(`MCP client call failed: ${String(error?.message || error)}${stderr ? `; stderr: ${stderr.slice(0, 500)}` : ''}`);
    return null;
  } finally {
    await client.close().catch(() => {});
  }
}

async function callRuntimeSmoke(client, args) {
  return client.callTool({
    name: 'chrome_bridge_runtime_smoke',
    arguments: args,
  });
}

async function withStaleHealthServer(fn) {
  const staleExtensionVersion = '0.0.0-stale-extension';
  const server = http.createServer((req, res) => {
    if (req.url !== '/health') {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'unexpected path' }));
      return;
    }

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      bridge: {
        version: BRIDGE_VERSION,
      },
      extension: {
        connected: true,
        info: {
          version: staleExtensionVersion,
        },
      },
    }));
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const { port } = server.address();
    return await fn(`http://127.0.0.1:${port}`, staleExtensionVersion);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function withStaleBridgeHealthServer(fn) {
  const staleBridgeVersion = '0.0.0-stale-bridge';
  const server = http.createServer((req, res) => {
    if (req.url !== '/health') {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'unexpected path' }));
      return;
    }

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      bridge: {
        version: staleBridgeVersion,
      },
      extension: {
        connected: true,
        info: {
          version: BRIDGE_VERSION,
        },
      },
    }));
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const { port } = server.address();
    return await fn(`http://127.0.0.1:${port}`, staleBridgeVersion);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const coveragePlanParsed = await withMcpClient({ CHROME_BRIDGE_URL: 'http://127.0.0.1:9' }, async (client) => (
  parseToolJson(await callRuntimeSmoke(client, { coveragePlan: true }), 'MCP coverage-plan runtime smoke')
));

if (coveragePlanParsed) {
  check(coveragePlanParsed.ok === true, 'MCP coverage-plan runtime smoke must succeed');
  check(coveragePlanParsed.mode === 'coverage-plan', 'MCP coverage-plan runtime smoke must report mode=coverage-plan');
  check(coveragePlanParsed.liveBridge === false, 'MCP coverage-plan runtime smoke must not touch the live bridge');
  check(
    coveragePlanParsed.nextCommand === 'chrome-bridge reload-extension --confirm',
    'MCP coverage-plan nextCommand must point at the first live verification prep step',
  );
  check(
    coveragePlanParsed.verification?.nextCommand === 'chrome-bridge reload-extension --confirm',
    'MCP coverage-plan verification metadata must include the first live verification command',
  );
  check(
    coveragePlanParsed.verification?.nextAction?.includes('Reload the unpacked Codex Chrome Bridge extension'),
    'MCP coverage-plan verification metadata must include the first live verification action',
  );
  check(coveragePlanParsed.verification?.status === 'not-run', 'MCP coverage-plan verification status must be not-run');
  check(coveragePlanParsed.verification?.liveVerificationRequired === true, 'MCP coverage-plan must require final live verification');
  check(
    coveragePlanParsed.verification?.finalCommands?.includes('chrome-bridge reload-extension --confirm'),
    'MCP coverage-plan final commands must include confirmed extension reload before live smoke',
  );
  check(
    coveragePlanParsed.verification?.finalCommands?.includes('chrome-bridge doctor --live-checks'),
    'MCP coverage-plan final commands must include explicit live doctor check',
  );
  check(
    coveragePlanParsed.verification?.finalCommands?.includes('chrome-bridge runtime-smoke'),
    'MCP coverage-plan final commands must include live runtime-smoke',
  );
  check(
    coveragePlanParsed.verification?.finalMcpCalls?.some((call) => call?.tool === 'chrome_bridge_reload_extension' && call?.arguments?.confirmed === true),
    'MCP coverage-plan final MCP calls must include confirmed extension reload',
  );
  check(
    coveragePlanParsed.verification?.finalMcpCalls?.some((call) => call?.tool === 'chrome_bridge_doctor' && call?.arguments?.liveChecks === true),
    'MCP coverage-plan final MCP calls must include explicit live doctor check',
  );
  check(
    coveragePlanParsed.verification?.finalMcpCalls?.some((call) => call?.tool === 'chrome_bridge_runtime_smoke' && call?.arguments && Object.keys(call.arguments).length === 0),
    'MCP coverage-plan final MCP calls must include live runtime-smoke',
  );
  check(coveragePlanParsed.coverage?.requiredCount > 0, 'MCP coverage-plan must include required coverage count');
  check(
    coveragePlanParsed.verification?.successCriteria?.requiredCoverageCount === coveragePlanParsed.coverage?.requiredCount,
    'MCP coverage-plan success criteria must match required coverage count',
  );
  check(
    coveragePlanParsed.verification?.successCriteria?.bridgeVersion === BRIDGE_VERSION,
    'MCP coverage-plan success criteria must require current bridge version',
  );
  check(
    coveragePlanParsed.verification?.successCriteria?.extensionVersion === BRIDGE_VERSION,
    'MCP coverage-plan success criteria must require current extension version',
  );
}

let staleParsed;
let staleExtensionStructuredOutput = false;
await withStaleHealthServer(async (bridgeUrl, staleExtensionVersion) => {
  staleParsed = await withMcpClient({ CHROME_BRIDGE_URL: bridgeUrl }, async (client) => (
    parseToolJson(await callRuntimeSmoke(client, {}), 'MCP stale-extension runtime smoke')
  ));

  if (!staleParsed) return;

  check(staleParsed.ok === false, 'MCP stale-extension runtime smoke output must fail top-level ok');
  check(staleParsed.skipped === true, 'MCP stale-extension runtime smoke must be skipped before fixture work');
  check(staleParsed.extensionVersion === staleExtensionVersion, 'MCP stale-extension runtime smoke must report observed extension version');
  check(staleParsed.verification?.status === 'skipped', 'MCP stale-extension verification status must be skipped');
  check(staleParsed.verification?.liveVerificationRequired === true, 'MCP stale-extension runtime smoke must still require final live verification');
  check(
    staleParsed.nextCommand === 'chrome-bridge reload-extension --confirm',
    'MCP stale-extension top-level nextCommand must point at extension reload',
  );
  check(
    staleParsed.nextAction?.includes('Reload the unpacked Codex Chrome Bridge extension'),
    'MCP stale-extension top-level nextAction must explain the reload action',
  );
  check(
    staleParsed.verification?.nextCommand === 'chrome-bridge reload-extension --confirm',
    'MCP stale-extension verification metadata must point at extension reload as the next command',
  );
  check(
    staleParsed.verification?.nextAction?.includes('Reload the unpacked Codex Chrome Bridge extension'),
    'MCP stale-extension verification metadata must explain the next reload action',
  );
  check(staleParsed.verification?.observed?.extensionVersion === staleExtensionVersion, 'MCP stale-extension verification metadata must include observed extension version');
  check(
    staleParsed.verification?.finalCommands?.includes('chrome-bridge reload-extension --confirm')
      && staleParsed.verification?.finalCommands?.includes('chrome-bridge doctor --live-checks')
      && staleParsed.verification?.finalCommands?.includes('chrome-bridge runtime-smoke'),
    'MCP stale-extension verification metadata must keep the final live command sequence',
  );
  check(
    staleParsed.verification?.finalMcpCalls?.some((call) => call?.tool === 'chrome_bridge_reload_extension' && call?.arguments?.confirmed === true)
      && staleParsed.verification?.finalMcpCalls?.some((call) => call?.tool === 'chrome_bridge_doctor' && call?.arguments?.liveChecks === true)
      && staleParsed.verification?.finalMcpCalls?.some((call) => call?.tool === 'chrome_bridge_runtime_smoke' && call?.arguments && Object.keys(call.arguments).length === 0),
    'MCP stale-extension verification metadata must keep the final live MCP sequence',
  );
  check(typeof staleParsed.cliExitError === 'string' && staleParsed.cliExitError.length > 0, 'MCP stale-extension runtime smoke must preserve cliExitError');
  staleExtensionStructuredOutput = !Object.prototype.hasOwnProperty.call(staleParsed, 'stdout');
  check(staleExtensionStructuredOutput, 'MCP stale-extension runtime smoke must not fall back to raw stdout wrapping');
});

let staleBridgeParsed;
let staleBridgeStructuredOutput = false;
await withStaleBridgeHealthServer(async (bridgeUrl, staleBridgeVersion) => {
  staleBridgeParsed = await withMcpClient({ CHROME_BRIDGE_URL: bridgeUrl }, async (client) => (
    parseToolJson(await callRuntimeSmoke(client, {}), 'MCP stale-bridge runtime smoke')
  ));

  if (!staleBridgeParsed) return;

  check(staleBridgeParsed.ok === false, 'MCP stale-bridge runtime smoke output must fail top-level ok');
  check(staleBridgeParsed.skipped === true, 'MCP stale-bridge runtime smoke must be skipped before fixture work');
  check(staleBridgeParsed.bridgeVersion === staleBridgeVersion, 'MCP stale-bridge runtime smoke must report observed bridge version');
  check(staleBridgeParsed.verification?.status === 'skipped', 'MCP stale-bridge verification status must be skipped');
  check(staleBridgeParsed.verification?.liveVerificationRequired === true, 'MCP stale-bridge runtime smoke must still require final live verification');
  check(
    staleBridgeParsed.nextCommand === 'chrome-bridge doctor --live-checks',
    'MCP stale-bridge top-level nextCommand must point at live doctor after restart',
  );
  check(
    staleBridgeParsed.nextAction?.includes('Restart the local Chrome Bridge server'),
    'MCP stale-bridge top-level nextAction must explain the bridge restart action',
  );
  check(
    staleBridgeParsed.verification?.nextCommand === 'chrome-bridge doctor --live-checks',
    'MCP stale-bridge verification metadata must point at live doctor as the next command after restart',
  );
  check(
    staleBridgeParsed.verification?.nextAction?.includes('Restart the local Chrome Bridge server'),
    'MCP stale-bridge verification metadata must explain the next bridge restart action',
  );
  check(staleBridgeParsed.verification?.observed?.bridgeVersion === staleBridgeVersion, 'MCP stale-bridge verification metadata must include observed bridge version');
  check(
    staleBridgeParsed.verification?.finalCommands?.includes('chrome-bridge reload-extension --confirm')
      && staleBridgeParsed.verification?.finalCommands?.includes('chrome-bridge doctor --live-checks')
      && staleBridgeParsed.verification?.finalCommands?.includes('chrome-bridge runtime-smoke'),
    'MCP stale-bridge verification metadata must keep the final live command sequence',
  );
  check(
    staleBridgeParsed.verification?.finalMcpCalls?.some((call) => call?.tool === 'chrome_bridge_reload_extension' && call?.arguments?.confirmed === true)
      && staleBridgeParsed.verification?.finalMcpCalls?.some((call) => call?.tool === 'chrome_bridge_doctor' && call?.arguments?.liveChecks === true)
      && staleBridgeParsed.verification?.finalMcpCalls?.some((call) => call?.tool === 'chrome_bridge_runtime_smoke' && call?.arguments && Object.keys(call.arguments).length === 0),
    'MCP stale-bridge verification metadata must keep the final live MCP sequence',
  );
  check(typeof staleBridgeParsed.cliExitError === 'string' && staleBridgeParsed.cliExitError.length > 0, 'MCP stale-bridge runtime smoke must preserve cliExitError');
  staleBridgeStructuredOutput = !Object.prototype.hasOwnProperty.call(staleBridgeParsed, 'stdout');
  check(staleBridgeStructuredOutput, 'MCP stale-bridge runtime smoke must not fall back to raw stdout wrapping');
});

if (failures.length) {
  for (const failure of failures) process.stderr.write(`- ${failure}\n`);
  process.exit(1);
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  coveragePlanStatus: coveragePlanParsed?.verification?.status,
  coveragePlanLiveBridge: coveragePlanParsed?.liveBridge,
  coveragePlanNextCommand: coveragePlanParsed?.nextCommand,
  coveragePlanVerificationNextCommand: coveragePlanParsed?.verification?.nextCommand,
  staleExtensionTopLevelNextCommand: staleParsed?.nextCommand,
  staleBridgeTopLevelNextCommand: staleBridgeParsed?.nextCommand,
  staleExtensionNextCommand: staleParsed?.verification?.nextCommand,
  staleBridgeNextCommand: staleBridgeParsed?.verification?.nextCommand,
  coveragePlanFinalCommandCount: coveragePlanParsed?.verification?.finalCommands?.length || 0,
  coveragePlanFinalMcpCallCount: coveragePlanParsed?.verification?.finalMcpCalls?.length || 0,
  successCriteriaBridgeVersion: coveragePlanParsed?.verification?.successCriteria?.bridgeVersion,
  successCriteriaExtensionVersion: coveragePlanParsed?.verification?.successCriteria?.extensionVersion,
  staleExtensionStatus: staleParsed?.verification?.status,
  staleBridgeStatus: staleBridgeParsed?.verification?.status,
  staleExtensionFinalCommandCount: staleParsed?.verification?.finalCommands?.length || 0,
  staleBridgeFinalCommandCount: staleBridgeParsed?.verification?.finalCommands?.length || 0,
  staleExtensionFinalMcpCallCount: staleParsed?.verification?.finalMcpCalls?.length || 0,
  staleBridgeFinalMcpCallCount: staleBridgeParsed?.verification?.finalMcpCalls?.length || 0,
  staleExtensionCliExitPreserved: Boolean(staleParsed?.cliExitError),
  staleBridgeCliExitPreserved: Boolean(staleBridgeParsed?.cliExitError),
  staleExtensionStructuredOutput,
  staleBridgeStructuredOutput,
}, null, 2)}\n`);
