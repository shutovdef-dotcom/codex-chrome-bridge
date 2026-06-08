#!/usr/bin/env node
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  BRIDGE_VERSION,
  CLI_COMMANDS,
  COMMAND_PAYLOAD_SCHEMAS,
  MCP_TOOLS,
  validateCommandPayload,
} from '../shared/command-registry.mjs';

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

async function withMcpClient(fn, env = {}) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [mcpPath],
    cwd: rootDir,
    env: inheritedEnv({ CHROME_BRIDGE_URL: 'http://127.0.0.1:9', ...env }),
    stderr: 'pipe',
  });
  const client = new Client({ name: 'chrome-bridge-mcp-local-tools-check', version: '0.1.0' });

  let stderr = '';
  transport.stderr?.on('data', (chunk) => {
    stderr += String(chunk);
  });

  try {
    await client.connect(transport);
    return await fn(client);
  } catch (error) {
    fail(`MCP local tools check failed: ${String(error?.message || error)}${stderr ? `; stderr: ${stderr.slice(0, 500)}` : ''}`);
    return null;
  } finally {
    await client.close().catch(() => {});
  }
}

async function withFakeLiveDoctor(fn) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chrome-bridge-mcp-doctor-check-'));
  const fakeBinDir = path.join(tmpDir, 'bin');
  await fs.mkdir(fakeBinDir);
  const fakeOsascript = path.join(fakeBinDir, 'osascript');
  await fs.writeFile(fakeOsascript, '#!/bin/sh\nprintf "Codex Bridge Fake Chrome Title\\n"\n');
  await fs.chmod(fakeOsascript, 0o755);

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
    return await fn({
      bridgeUrl: `http://127.0.0.1:${port}`,
      pathEnv: `${fakeBinDir}${path.delimiter}${process.env.PATH || ''}`,
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

async function withFakeStaleSummaryBridge(fn) {
  const staleBridgeVersion = '0.0.0-stale-summary';
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
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
      return;
    }

    if (req.url === '/command') {
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        ok: false,
        code: 'EXTENSION_NOT_CONNECTED',
        error: 'fake summary bridge has no extension command transport',
      }));
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'unexpected path' }));
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const { port } = server.address();
    return await fn({
      bridgeUrl: `http://127.0.0.1:${port}`,
      staleBridgeVersion,
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function withFakeCommandBridge(fn) {
  const receivedCommands = [];
  const server = http.createServer(async (req, res) => {
    if (req.url !== '/command' || req.method !== 'POST') {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'unexpected path' }));
      return;
    }

    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }

    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'invalid json' }));
      return;
    }

    try {
      validateCommandPayload(parsed.action, parsed.payload || {});
    } catch (error) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        ok: false,
        code: 'INVALID_PAYLOAD',
        error: String(error?.message || error),
      }));
      return;
    }

    receivedCommands.push(parsed);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      result: {
        action: parsed.action,
        payload: parsed.payload,
        timeoutMs: parsed.timeoutMs,
      },
    }));
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const { port } = server.address();
    return await fn({
      bridgeUrl: `http://127.0.0.1:${port}`,
      receivedCommands,
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

let doctorLiveBridgeCurrent = null;
await withMcpClient(async (client) => {
  const tools = await client.listTools();
  const toolNames = new Set((tools.tools || []).map((tool) => tool.name));
  const registryToolNames = new Set(MCP_TOOLS);
  for (const tool of MCP_TOOLS) {
    check(toolNames.has(tool), `MCP listTools output is missing registry tool: ${tool}`);
  }
  for (const tool of toolNames) {
    check(registryToolNames.has(tool), `MCP listTools output includes unexpected MCP tool: ${tool}`);
  }
  check(toolNames.size === MCP_TOOLS.length, 'MCP listTools output count must match registry MCP_TOOLS count');

  check(toolNames.has('chrome_bridge_doctor'), 'MCP tools list must expose chrome_bridge_doctor');
  check(toolNames.has('chrome_bridge_extension_path'), 'MCP tools list must expose chrome_bridge_extension_path');
  check(toolNames.has('chrome_bridge_codex_config'), 'MCP tools list must expose chrome_bridge_codex_config');
  check(toolNames.has('chrome_bridge_command_catalog'), 'MCP tools list must expose chrome_bridge_command_catalog');

  const doctorParsed = parseToolJson(await client.callTool({
    name: 'chrome_bridge_doctor',
    arguments: {},
  }), 'MCP doctor');

  if (doctorParsed) {
    check(doctorParsed.liveChecks === false, 'MCP doctor must keep liveChecks === false by default');
    check(doctorParsed.health?.skipped === true, 'MCP doctor default call must skip bridge health checks');
    check(doctorParsed.health?.ok === null, 'MCP doctor default call must not contact bridge health');
    check(doctorParsed.checks?.extensionConnected === null, 'MCP doctor default call must not infer extension connection');
    check(Array.isArray(doctorParsed.nextActions), 'MCP doctor must return setup nextActions');
    check(doctorParsed.nextActions.some((action) => action.includes('runtime-smoke --coverage-plan')), 'MCP doctor offline nextActions must recommend the coverage plan');
  }

  const catalogParsed = parseToolJson(await client.callTool({
    name: 'chrome_bridge_command_catalog',
    arguments: {},
  }), 'MCP command catalog');

  check(catalogParsed?.cliCommands?.length === CLI_COMMANDS.length, 'MCP command catalog must expose every registry CLI command');
  check(catalogParsed?.mcpTools?.length === MCP_TOOLS.length, 'MCP command catalog must expose every registry MCP tool');
  check(catalogParsed?.counts?.cliCommands === CLI_COMMANDS.length, 'MCP command catalog must expose registry CLI command count');
  check(catalogParsed?.counts?.mcpTools === MCP_TOOLS.length, 'MCP command catalog must expose registry MCP tool count');
  const catalogCommandNames = new Set(catalogParsed?.cliCommands || []);
  const catalogToolNames = new Set(catalogParsed?.mcpTools || []);
  for (const command of CLI_COMMANDS) {
    check(catalogCommandNames.has(command), `MCP command catalog is missing registry CLI command: ${command}`);
  }
  for (const tool of MCP_TOOLS) {
    check(catalogToolNames.has(tool), `MCP command catalog is missing registry tool: ${tool}`);
  }

  const doctorEntry = catalogParsed?.localCommands?.find((entry) => entry.id === 'doctor');
  check(Boolean(doctorEntry), 'MCP command catalog must include local doctor command');
  check(doctorEntry?.mcp?.includes('chrome_bridge_doctor'), 'MCP command catalog must map doctor to chrome_bridge_doctor');
  check(doctorEntry?.liveBridge === 'optional', 'MCP command catalog must mark doctor live bridge behavior optional');

  const extensionPath = await client.callTool({
    name: 'chrome_bridge_extension_path',
    arguments: {},
  });
  const extensionPathText = extensionPath?.content?.find((item) => item?.type === 'text')?.text;
  check(typeof extensionPathText === 'string' && extensionPathText.endsWith('/extension'), 'MCP extension path tool must return the unpacked extension path');

  const codexConfig = await client.callTool({
    name: 'chrome_bridge_codex_config',
    arguments: {},
  });
  const codexConfigText = codexConfig?.content?.find((item) => item?.type === 'text')?.text;
  check(codexConfigText?.includes('[mcp_servers.chrome-bridge]'), 'MCP codex-config tool must return a Codex MCP server section');
  check(codexConfigText?.includes('mcp/chrome-bridge-mcp.mjs'), 'MCP codex-config tool must point at the local MCP server file');
});

await withFakeLiveDoctor(async ({ bridgeUrl, pathEnv }) => {
  await withMcpClient(async (client) => {
    const liveDoctorParsed = parseToolJson(await client.callTool({
      name: 'chrome_bridge_doctor',
      arguments: { liveChecks: true },
    }), 'MCP doctor live checks');
    if (!liveDoctorParsed) return;

    check(liveDoctorParsed.liveChecks === true, 'MCP doctor live check fixture must report liveChecks=true');
    check(liveDoctorParsed.health?.ok === true, 'MCP doctor live check fixture must read fake health');
    check(liveDoctorParsed.checks?.expectedBridgeVersion === BRIDGE_VERSION, 'MCP doctor live checks must report expected bridge version');
    check(liveDoctorParsed.checks?.bridgeVersion === BRIDGE_VERSION, 'MCP doctor live checks must report observed bridge version');
    check(liveDoctorParsed.checks?.bridgeCurrent === true, 'MCP doctor live checks must confirm bridge version is current');
    doctorLiveBridgeCurrent = liveDoctorParsed.checks?.bridgeCurrent;
  }, {
    CHROME_BRIDGE_URL: bridgeUrl,
    PATH: pathEnv,
  });
});

let sessionSummaryStaleBridgeRecommendation = false;
await withFakeStaleSummaryBridge(async ({ bridgeUrl, staleBridgeVersion }) => {
  await withMcpClient(async (client) => {
    const summaryParsed = parseToolJson(await client.callTool({
      name: 'chrome_bridge_session_summary',
      arguments: {},
    }), 'MCP session-summary stale bridge');
    if (!summaryParsed) return;

    sessionSummaryStaleBridgeRecommendation = summaryParsed.recommendations?.some((recommendation) => (
      recommendation.includes('Restart the local Chrome Bridge server')
        && recommendation.includes(staleBridgeVersion)
    ));
    check(sessionSummaryStaleBridgeRecommendation, 'MCP session-summary must recommend restarting stale bridge server');
  }, {
    CHROME_BRIDGE_URL: bridgeUrl,
  });
});

let inventoryIncludeAllChecks = 0;
let groupScopePayloadChecks = 0;
await withFakeCommandBridge(async ({ bridgeUrl, receivedCommands }) => {
  const groupTitle = 'Codex Bridge MCP Group Scope';
  const groupColor = 'cyan';
  const includeAllCases = [
    { action: 'windows', tool: 'chrome_bridge_windows' },
    { action: 'tabs', tool: 'chrome_bridge_tabs' },
  ];
  const cases = [
    { action: 'windows', tool: 'chrome_bridge_windows', args: { groupTitle, groupColor } },
    { action: 'tabs', tool: 'chrome_bridge_tabs', args: { groupTitle, groupColor } },
    { action: 'group', tool: 'chrome_bridge_group', args: { includeTabs: true, groupTitle, groupColor } },
    { action: 'ensureTab', tool: 'chrome_bridge_ensure_tab', args: { url: 'https://example.com', groupTitle, groupColor } },
    { action: 'adoptTab', tool: 'chrome_bridge_adopt_tab', args: { tabId: 123, groupTitle, groupColor, confirmed: true } },
    { action: 'open', tool: 'chrome_bridge_open', args: { url: 'https://example.com', newTab: true, groupTitle, groupColor } },
    { action: 'closeGroup', tool: 'chrome_bridge_close_group', args: { groupTitle, groupColor, confirmed: true } },
  ];

  await withMcpClient(async (client) => {
    for (const testCase of includeAllCases) {
      const beforeReject = receivedCommands.length;
      try {
        const rejected = await client.callTool({
          name: testCase.tool,
          arguments: { includeAll: true },
        });
        const rejectedText = rejected?.content?.find((item) => item?.type === 'text')?.text || '';
        check(rejected?.isError === true, `MCP ${testCase.tool} includeAll must return a tool error without confirmed=true`);
        check(
          rejectedText.includes(`${testCase.action} requires confirmed=true`),
          `MCP ${testCase.tool} includeAll tool error must explain confirmed=true`,
        );
      } catch (error) {
        check(
          String(error?.message || error).includes(`${testCase.action} requires confirmed=true`),
          `MCP ${testCase.tool} includeAll rejection must explain confirmed=true`,
        );
      }
      check(receivedCommands.length === beforeReject, `MCP ${testCase.tool} unconfirmed includeAll must not be accepted by fake bridge`);
      inventoryIncludeAllChecks += 1;

      const beforeAccept = receivedCommands.length;
      const parsed = parseToolJson(await client.callTool({
        name: testCase.tool,
        arguments: { includeAll: true, confirmed: true },
      }), `MCP ${testCase.tool} confirmed includeAll fake command bridge`);
      const commandPayload = receivedCommands[beforeAccept]?.payload || parsed?.payload;
      check(receivedCommands[beforeAccept]?.action === testCase.action, `MCP ${testCase.tool} confirmed includeAll must dispatch ${testCase.action}`);
      check(commandPayload?.includeAll === true, `MCP ${testCase.tool} confirmed includeAll must forward includeAll`);
      check(commandPayload?.confirmed === true, `MCP ${testCase.tool} confirmed includeAll must forward confirmed`);
      inventoryIncludeAllChecks += 1;
    }

    for (const testCase of cases) {
      check(COMMAND_PAYLOAD_SCHEMAS[testCase.action]?.includes('groupTitle'), `${testCase.action} schema must allow groupTitle before MCP behavior checks`);
      check(COMMAND_PAYLOAD_SCHEMAS[testCase.action]?.includes('groupColor'), `${testCase.action} schema must allow groupColor before MCP behavior checks`);
      const before = receivedCommands.length;
      const parsed = parseToolJson(await client.callTool({
        name: testCase.tool,
        arguments: testCase.args,
      }), `MCP ${testCase.tool} fake command bridge`);
      const commandPayload = receivedCommands[before]?.payload || parsed?.payload;
      check(receivedCommands[before]?.action === testCase.action, `MCP ${testCase.tool} must dispatch ${testCase.action}`);
      check(commandPayload?.groupTitle === groupTitle, `MCP ${testCase.tool} must forward groupTitle`);
      check(commandPayload?.groupColor === groupColor, `MCP ${testCase.tool} must forward groupColor`);
      groupScopePayloadChecks += 1;
    }
  }, {
    CHROME_BRIDGE_URL: bridgeUrl,
  });
});

if (failures.length) {
  for (const failure of failures) process.stderr.write(`- ${failure}\n`);
  process.exit(1);
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  registryCommandCount: CLI_COMMANDS.length,
  registryToolCount: MCP_TOOLS.length,
  catalogCommandCount: CLI_COMMANDS.length,
  catalogToolCount: MCP_TOOLS.length,
  listedToolCount: MCP_TOOLS.length,
  checkedTools: ['chrome_bridge_doctor', 'chrome_bridge_extension_path', 'chrome_bridge_codex_config', 'chrome_bridge_command_catalog'],
  doctorOfflineByDefault: true,
  doctorLiveBridgeCurrent,
  sessionSummaryStaleBridgeRecommendation,
  inventoryIncludeAllChecks,
  groupScopePayloadChecks,
}, null, 2)}\n`);
