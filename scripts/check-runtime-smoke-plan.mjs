#!/usr/bin/env node
import { execFile } from 'node:child_process';
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

let parsed;
try {
  const { stdout } = await execFileAsync(process.execPath, [cliPath, 'runtime-smoke', '--coverage-plan'], {
    cwd: rootDir,
    env: {
      ...process.env,
      CHROME_BRIDGE_URL: deadBridgeUrl,
    },
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
  });
  parsed = JSON.parse(stdout);
} catch (error) {
  fail(`runtime-smoke --coverage-plan failed with a dead bridge URL: ${String(error?.message || error)}`);
}

if (parsed) {
  check(parsed.ok === true, 'coverage plan command must succeed');
  check(parsed.mode === 'coverage-plan', 'coverage plan output must report mode=coverage-plan');
  check(parsed.liveBridge === false, 'coverage plan output must report liveBridge=false');
  check(parsed.verification?.status === 'not-run', 'coverage plan verification status must be not-run');
  check(parsed.verification?.liveVerificationRequired === true, 'coverage plan must require final live verification');
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
}, null, 2)}\n`);
