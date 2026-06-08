#!/usr/bin/env node
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const REQUIRED_PACKAGE_FILES = Object.freeze([
  'bin/chrome-bridge.mjs',
  'mcp/chrome-bridge-mcp.mjs',
  'server/bridge-server.mjs',
  'shared/command-registry.mjs',
  'shared/cpa-offer-extract.mjs',
  'extension/manifest.json',
  'extension/background.js',
  'extension/browser-data.js',
  'extension/debugger-session.js',
  'extension/extension-errors.js',
  'extension/keyboard-events.js',
  'extension/navigation-actions.js',
  'extension/offscreen.js',
  'extension/offscreen-lifecycle.js',
  'extension/page-execution.js',
  'extension/page-artifacts.js',
  'extension/page-read-actions.js',
  'extension/page-interactions.js',
  'extension/page-scripts.js',
  'extension/runtime-actions.js',
  'extension/safety-gates.js',
  'extension/tab-cleanup.js',
  'extension/tab-group-persistence.js',
  'extension/tab-info.js',
  'extension/tab-loading.js',
  'extension/trace-actions.js',
  'extension/user-prompts.js',
  'extension/workspace-policy.js',
  'extension/workspace-tabs.js',
  'extension/ask.html',
  'extension/ask.js',
  'docs/ARCHITECTURE.md',
  'docs/CLI.md',
  'docs/MCP.md',
  'docs/SAFETY.md',
  'docs/COMMAND-CATALOG.md',
  'docs/COMPETITIVE-ROADMAP.md',
  'docs/PUBLISHING.md',
  'scripts/generate-command-catalog.mjs',
  'scripts/check-command-registry.mjs',
  'scripts/check-bridge-contract.mjs',
  'scripts/check-docs-coverage.mjs',
  'scripts/check-runtime-smoke-plan.mjs',
  'scripts/check-roadmap-coverage.mjs',
  'scripts/check-cli-local-tools.mjs',
  'scripts/check-mcp-runtime-smoke.mjs',
  'scripts/check-mcp-local-tools.mjs',
  'scripts/check-tab-group-persistence.mjs',
  'scripts/check-cpa-offer-preset.mjs',
  'scripts/check-size-aware-screenshot.mjs',
  'scripts/check-package-contents.mjs',
  'scripts/check-privacy-scan.mjs',
  'scripts/install-launch-agent.mjs',
  'scripts/uninstall-launch-agent.mjs',
  'README.md',
  'llms.txt',
  'CHANGELOG.md',
  'LICENSE',
  'SECURITY.md',
  'SUPPORT.md',
]);

const FORBIDDEN_PACKAGE_PATH_PREFIXES = Object.freeze([
  '.github/',
  '.git/',
  'codex/',
  'node_modules/',
  'screenshots/',
  'tmp/',
]);

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function parsePackOutput(stdout) {
  try {
    const parsed = JSON.parse(stdout);
    const [entry] = parsed;
    if (!entry || !Array.isArray(entry.files)) {
      throw new Error('missing files array');
    }
    return entry;
  } catch (error) {
    throw new Error(`Unable to parse npm pack --dry-run --json output: ${String(error?.message || error)}`);
  }
}

async function copyPackFileList(paths, packageDir) {
  for (const filePath of paths) {
    const source = path.join(rootDir, filePath);
    const destination = path.join(packageDir, filePath);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(source, destination);
  }
}

async function checkPackagedRegistryScript(paths) {
  const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'codex-chrome-bridge-pack-'));
  const packageDir = path.join(tempDir, 'package');
  try {
    await copyPackFileList(paths, packageDir);
    await execFileAsync(npmCommand, ['run', 'check:registry', '--prefix', packageDir], {
      maxBuffer: 5 * 1024 * 1024,
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: String(error?.message || error),
      stdout: error?.stdout?.trim?.() || '',
      stderr: error?.stderr?.trim?.() || '',
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const { stdout } = await execFileAsync(npmCommand, ['pack', '--dry-run', '--json'], {
  maxBuffer: 5 * 1024 * 1024,
});

const pack = parsePackOutput(stdout);
const paths = new Set(pack.files.map((file) => file.path));
const failures = [];

for (const requiredPath of REQUIRED_PACKAGE_FILES) {
  if (!paths.has(requiredPath)) {
    failures.push(`package tarball is missing required file: ${requiredPath}`);
  }
}

for (const filePath of paths) {
  if (FORBIDDEN_PACKAGE_PATH_PREFIXES.some((prefix) => filePath.startsWith(prefix))) {
    failures.push(`package tarball includes forbidden path: ${filePath}`);
  }
}

if (pack.entryCount !== paths.size) {
  failures.push(`package tarball entryCount ${pack.entryCount} does not match file list size ${paths.size}`);
}

const packagedRegistryCheck = await checkPackagedRegistryScript(paths);
if (!packagedRegistryCheck.ok) {
  failures.push([
    'package tarball layout cannot run npm run check:registry',
    packagedRegistryCheck.stderr,
    packagedRegistryCheck.stdout,
  ].filter(Boolean).join('\n'));
}

if (failures.length) {
  fail(failures.map((failure) => `- ${failure}`).join('\n'));
} else {
  process.stdout.write(JSON.stringify({
    ok: true,
    name: pack.name,
    version: pack.version,
    filename: pack.filename,
    entryCount: pack.entryCount,
    requiredFiles: REQUIRED_PACKAGE_FILES.length,
    packagedRegistryCheck: packagedRegistryCheck.ok,
    unpackedSize: pack.unpackedSize,
  }, null, 2));
  process.stdout.write('\n');
}
