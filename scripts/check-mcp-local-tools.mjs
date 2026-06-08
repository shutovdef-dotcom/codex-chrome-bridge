#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

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

async function withMcpClient(fn) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [mcpPath],
    cwd: rootDir,
    env: inheritedEnv({ CHROME_BRIDGE_URL: 'http://127.0.0.1:9' }),
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

await withMcpClient(async (client) => {
  const tools = await client.listTools();
  const toolNames = new Set((tools.tools || []).map((tool) => tool.name));
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

if (failures.length) {
  for (const failure of failures) process.stderr.write(`- ${failure}\n`);
  process.exit(1);
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  checkedTools: ['chrome_bridge_doctor', 'chrome_bridge_extension_path', 'chrome_bridge_codex_config', 'chrome_bridge_command_catalog'],
  doctorOfflineByDefault: true,
}, null, 2)}\n`);
