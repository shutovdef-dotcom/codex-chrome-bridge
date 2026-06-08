#!/usr/bin/env node
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { CLI_COMMANDS, MCP_TOOLS } from '../shared/command-registry.mjs';

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(rootDir, 'bin/chrome-bridge.mjs');
const failures = [];

function fail(message) {
  failures.push(message);
}

function check(condition, message) {
  if (!condition) fail(message);
}

async function runCli(args) {
  try {
    const result = await execFileAsync(process.execPath, [cliPath, ...args], {
      cwd: rootDir,
      env: {
        ...process.env,
        CHROME_BRIDGE_URL: 'http://127.0.0.1:9',
      },
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
    });
    return { ok: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      ok: false,
      stdout: error?.stdout || '',
      stderr: error?.stderr || '',
      error: String(error?.message || error),
    };
  }
}

function parseJsonOutput(result, label) {
  try {
    return JSON.parse(result.stdout || '{}');
  } catch (error) {
    fail(`${label} did not return JSON: ${String(error?.message || error)}`);
    return null;
  }
}

const doctorResult = await runCli(['doctor']);
check(doctorResult.ok, 'CLI doctor must succeed offline');
const doctorJson = parseJsonOutput(doctorResult, 'CLI doctor');
if (doctorJson) {
  check(doctorJson.liveChecks === false, 'CLI doctor must keep liveChecks=false by default');
  check(doctorJson.health?.skipped === true, 'CLI doctor default call must skip bridge health');
  check(doctorJson.health?.ok === null, 'CLI doctor default call must not contact bridge health');
  check(Array.isArray(doctorJson.nextActions), 'CLI doctor must return setup nextActions');
  check(doctorJson.nextActions.some((action) => action.includes('runtime-smoke --coverage-plan')), 'CLI doctor offline nextActions must recommend coverage-plan');
}

const extensionPathResult = await runCli(['extension-path']);
check(extensionPathResult.ok, 'CLI extension-path must succeed offline');
check(extensionPathResult.stdout.trim().endsWith('/extension'), 'CLI extension-path must return the unpacked extension path');

const codexConfigResult = await runCli(['codex-config']);
check(codexConfigResult.ok, 'CLI codex-config must succeed offline');
check(codexConfigResult.stdout.includes('[mcp_servers.chrome-bridge]'), 'CLI codex-config must return a Codex MCP server section');
check(codexConfigResult.stdout.includes('mcp/chrome-bridge-mcp.mjs'), 'CLI codex-config must point at the local MCP server file');

const catalogResult = await runCli(['command-catalog']);
check(catalogResult.ok, 'CLI command-catalog must succeed offline');
const catalogJson = parseJsonOutput(catalogResult, 'CLI command-catalog');
if (catalogJson) {
  check(catalogJson.cliCommands?.length === CLI_COMMANDS.length, 'CLI command-catalog must expose every registry CLI command');
  check(catalogJson.mcpTools?.length === MCP_TOOLS.length, 'CLI command-catalog must expose every registry MCP tool');
  check(catalogJson.counts?.cliCommands === CLI_COMMANDS.length, 'CLI command-catalog must expose CLI command count');
  check(catalogJson.counts?.mcpTools === MCP_TOOLS.length, 'CLI command-catalog must expose MCP tool count');
  const catalogCommands = new Set(catalogJson.cliCommands || []);
  const catalogTools = new Set(catalogJson.mcpTools || []);
  for (const command of CLI_COMMANDS) {
    check(catalogCommands.has(command), `CLI command-catalog is missing registry CLI command: ${command}`);
  }
  for (const tool of MCP_TOOLS) {
    check(catalogTools.has(tool), `CLI command-catalog is missing registry MCP tool: ${tool}`);
  }
}

if (failures.length) {
  for (const failure of failures) process.stderr.write(`- ${failure}\n`);
  process.exit(1);
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  checkedCommands: ['doctor', 'extension-path', 'codex-config', 'command-catalog'],
  doctorOfflineByDefault: true,
  catalogCommandCount: CLI_COMMANDS.length,
  catalogToolCount: MCP_TOOLS.length,
}, null, 2)}\n`);
