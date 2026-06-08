#!/usr/bin/env node
import { execFile } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(rootDir, 'bin/chrome-bridge.mjs');
const deadBridgeUrl = 'http://127.0.0.1:9';
const failures = [];

function fail(message) {
  failures.push(message);
}

function check(condition, message) {
  if (!condition) fail(message);
}

async function runCli(args, env = {}) {
  try {
    const { stdout } = await execFileAsync(process.execPath, [cliPath, ...args], {
      cwd: rootDir,
      env: {
        ...process.env,
        ...env,
      },
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
    });
    return { ok: true, stdout };
  } catch (error) {
    return {
      ok: false,
      stdout: error?.stdout || '',
      stderr: error?.stderr || '',
      error: String(error?.message || error),
    };
  }
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

let parsed;
try {
  const result = await runCli(['runtime-smoke', '--coverage-plan'], { CHROME_BRIDGE_URL: deadBridgeUrl });
  if (!result.ok) throw new Error(result.error || result.stderr || 'coverage plan command failed');
  parsed = JSON.parse(result.stdout);
} catch (error) {
  fail(`runtime-smoke --coverage-plan failed with a dead bridge URL: ${String(error?.message || error)}`);
}

if (parsed) {
  check(parsed.ok === true, 'coverage plan command must succeed');
  check(parsed.mode === 'coverage-plan', 'coverage plan output must report mode=coverage-plan');
  check(parsed.liveBridge === false, 'coverage plan output must report liveBridge=false');
  check(parsed.verification?.status === 'not-run', 'coverage plan verification status must be not-run');
  check(parsed.verification?.liveVerificationRequired === true, 'coverage plan must require final live verification');
  check(
    parsed.nextCommand === 'chrome-bridge reload-extension --confirm',
    'coverage plan nextCommand must point at the first live verification prep step',
  );
  check(
    parsed.verification?.finalCommands?.includes('chrome-bridge reload-extension --confirm'),
    'coverage plan final commands must include confirmed extension reload before live smoke',
  );
  check(
    parsed.verification?.finalCommands?.includes('chrome-bridge doctor --live-checks'),
    'coverage plan final commands must include explicit live doctor check',
  );
  check(
    parsed.verification?.finalCommands?.includes('chrome-bridge runtime-smoke'),
    'coverage plan final commands must include live runtime-smoke',
  );
  check(
    parsed.verification?.finalMcpCalls?.some((call) => call?.tool === 'chrome_bridge_reload_extension' && call?.arguments?.confirmed === true),
    'coverage plan final MCP calls must include confirmed extension reload',
  );
  check(
    parsed.verification?.finalMcpCalls?.some((call) => call?.tool === 'chrome_bridge_doctor' && call?.arguments?.liveChecks === true),
    'coverage plan final MCP calls must include explicit live doctor check',
  );
  check(
    parsed.verification?.finalMcpCalls?.some((call) => call?.tool === 'chrome_bridge_runtime_smoke' && call?.arguments && Object.keys(call.arguments).length === 0),
    'coverage plan final MCP calls must include live runtime-smoke',
  );
  check(parsed.verification?.successCriteria?.ok === true, 'coverage plan success criteria must require top-level ok=true');
  check(parsed.verification?.successCriteria?.coverageOk === true, 'coverage plan success criteria must require coverage.ok=true');
  check(parsed.coverage?.ok === false, 'coverage plan coverage.ok must remain false until live smoke runs');
  check(parsed.coverage?.requiredCount > 0, 'coverage plan must include at least one required coverage item');
  check(parsed.coverage?.requiredCount === parsed.coverage?.missingCount, 'coverage plan must mark every required item missing before live smoke runs');
  check(Array.isArray(parsed.coverage?.required), 'coverage plan must include required coverage names');
  check(Array.isArray(parsed.coverage?.missing), 'coverage plan must include missing coverage names');
  check(parsed.coverage?.required?.length === parsed.coverage?.requiredCount, 'required coverage names must match requiredCount');
  check(parsed.coverage?.missing?.length === parsed.coverage?.missingCount, 'missing coverage names must match missingCount');
}

let staleParsed;
await withStaleHealthServer(async (bridgeUrl, staleExtensionVersion) => {
  const result = await runCli(['runtime-smoke'], { CHROME_BRIDGE_URL: bridgeUrl });
  try {
    staleParsed = JSON.parse(result.stdout);
  } catch (error) {
    fail(`runtime-smoke stale-extension output was not JSON: ${String(error?.message || error)}`);
    return;
  }

  check(result.ok === false, 'stale-extension runtime smoke must exit nonzero');
  check(staleParsed.ok === false, 'stale-extension runtime smoke output must fail top-level ok');
  check(staleParsed.skipped === true, 'stale-extension runtime smoke must be skipped before fixture work');
  check(staleParsed.extensionVersion === staleExtensionVersion, 'stale-extension runtime smoke must report observed extension version');
  check(staleParsed.verification?.status === 'skipped', 'stale-extension runtime smoke verification status must be skipped');
  check(staleParsed.verification?.liveVerificationRequired === true, 'stale-extension runtime smoke must still require final live verification');
  check(staleParsed.verification?.observed?.extensionVersion === staleExtensionVersion, 'stale-extension verification metadata must include observed extension version');
});

if (failures.length) {
  for (const failure of failures) process.stderr.write(`- ${failure}\n`);
  process.exit(1);
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  mode: parsed.mode,
  liveBridge: parsed.liveBridge,
  verificationStatus: parsed.verification.status,
  liveVerificationRequired: parsed.verification.liveVerificationRequired,
  requiredCount: parsed.coverage.requiredCount,
  staleExtensionStatus: staleParsed?.verification?.status,
}, null, 2)}\n`);
