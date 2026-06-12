#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

const aliasDir = path.join(rootDir, 'aliases', 'chrome-mcp-bridge');
const [mainPackage, aliasPackage, aliasReadme, cliWrapper, mcpWrapper, distributionText] = await Promise.all([
  fs.readFile(path.join(rootDir, 'package.json'), 'utf8').then((text) => JSON.parse(text)),
  fs.readFile(path.join(aliasDir, 'package.json'), 'utf8').then((text) => JSON.parse(text)),
  fs.readFile(path.join(aliasDir, 'README.md'), 'utf8'),
  fs.readFile(path.join(aliasDir, 'bin', 'chrome-bridge.mjs'), 'utf8'),
  fs.readFile(path.join(aliasDir, 'bin', 'chrome-bridge-mcp.mjs'), 'utf8'),
  fs.readFile(path.join(rootDir, 'docs/DISTRIBUTION.md'), 'utf8'),
]);

check(aliasPackage.name === 'chrome-mcp-bridge', 'alias package must use the chrome-mcp-bridge name');
check(aliasPackage.private === true, 'alias package must stay private until release planning is approved');
check(aliasPackage.version === mainPackage.version, 'alias package version must match the main package version');
check(aliasPackage.dependencies?.['codex-chrome-bridge'] === `^${mainPackage.version}`, 'alias package must depend on the matching codex-chrome-bridge version');
check(aliasPackage.bin?.['chrome-bridge'] === './bin/chrome-bridge.mjs', 'alias package must expose the chrome-bridge wrapper binary');
check(aliasPackage.bin?.['chrome-bridge-mcp'] === './bin/chrome-bridge-mcp.mjs', 'alias package must expose the chrome-bridge-mcp wrapper binary');
check(cliWrapper.includes("node_modules', 'codex-chrome-bridge', 'bin', 'chrome-bridge.mjs"), 'CLI alias wrapper must forward into the main package CLI entrypoint');
check(mcpWrapper.includes("node_modules', 'codex-chrome-bridge', 'mcp', 'chrome-bridge-mcp.mjs"), 'MCP alias wrapper must forward into the main package MCP entrypoint');
check(aliasReadme.includes('2026-06-12') && aliasReadme.includes('Unpublished on 2025-08-15T05:17:00.343Z'), 'alias package README must record the npm availability check and unpublished timestamp');
check(distributionText.includes('2026-06-12') && distributionText.includes('Unpublished on 2025-08-15T05:17:00.343Z'), 'distribution docs must record the current npm alias-name status');

if (failures.length > 0) {
  process.stderr.write(`${JSON.stringify({ ok: false, failures }, null, 2)}\n`);
  process.exit(1);
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  version: mainPackage.version,
}, null, 2)}\n`);
