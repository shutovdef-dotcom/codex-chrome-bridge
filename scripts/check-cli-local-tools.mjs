#!/usr/bin/env node
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { BRIDGE_VERSION, CLI_COMMANDS, MCP_TOOLS } from '../shared/command-registry.mjs';

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

async function runCli(args, env = {}) {
  try {
    const result = await execFileAsync(process.execPath, [cliPath, ...args], {
      cwd: rootDir,
      env: {
        ...process.env,
        CHROME_BRIDGE_URL: 'http://127.0.0.1:9',
        ...env,
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

async function withFakeLiveDoctor(fn) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chrome-bridge-doctor-check-'));
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

let liveDoctorBridgeCurrent = null;
await withFakeLiveDoctor(async ({ bridgeUrl, pathEnv }) => {
  const liveDoctorResult = await runCli(['doctor', '--live-checks'], {
    CHROME_BRIDGE_URL: bridgeUrl,
    PATH: pathEnv,
  });
  check(liveDoctorResult.ok, 'CLI doctor --live-checks must succeed against fake health and fake osascript');
  const liveDoctorJson = parseJsonOutput(liveDoctorResult, 'CLI doctor live checks');
  if (!liveDoctorJson) return;

  check(liveDoctorJson.liveChecks === true, 'CLI doctor live check fixture must report liveChecks=true');
  check(liveDoctorJson.health?.ok === true, 'CLI doctor live check fixture must read fake health');
  check(liveDoctorJson.checks?.expectedBridgeVersion === BRIDGE_VERSION, 'CLI doctor live checks must report expected bridge version');
  check(liveDoctorJson.checks?.bridgeVersion === BRIDGE_VERSION, 'CLI doctor live checks must report observed bridge version');
  check(liveDoctorJson.checks?.bridgeCurrent === true, 'CLI doctor live checks must confirm bridge version is current');
  liveDoctorBridgeCurrent = liveDoctorJson.checks?.bridgeCurrent;
});

let sessionSummaryStaleBridgeRecommendation = false;
await withFakeStaleSummaryBridge(async ({ bridgeUrl, staleBridgeVersion }) => {
  const summaryResult = await runCli(['session-summary'], {
    CHROME_BRIDGE_URL: bridgeUrl,
  });
  check(summaryResult.ok, 'CLI session-summary must succeed against fake stale bridge health');
  const summaryJson = parseJsonOutput(summaryResult, 'CLI session-summary stale bridge');
  if (!summaryJson) return;

  sessionSummaryStaleBridgeRecommendation = summaryJson.recommendations?.some((recommendation) => (
    recommendation.includes('Restart the local Chrome Bridge server')
      && recommendation.includes(staleBridgeVersion)
  ));
  check(sessionSummaryStaleBridgeRecommendation, 'CLI session-summary must recommend restarting stale bridge server');
});

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
  doctorLiveBridgeCurrent: liveDoctorBridgeCurrent,
  sessionSummaryStaleBridgeRecommendation,
  catalogCommandCount: CLI_COMMANDS.length,
  catalogToolCount: MCP_TOOLS.length,
}, null, 2)}\n`);
