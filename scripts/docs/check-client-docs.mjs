#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

const [packageJson, readmeText, compatibilityText, installText] = await Promise.all([
  fs.readFile(path.join(rootDir, 'package.json'), 'utf8').then((text) => JSON.parse(text)),
  fs.readFile(path.join(rootDir, 'README.md'), 'utf8'),
  fs.readFile(path.join(rootDir, 'docs/COMPATIBILITY.md'), 'utf8'),
  fs.readFile(path.join(rootDir, 'docs/INSTALL.md'), 'utf8'),
]);

const clients = [
  'Claude Code',
  'Cursor',
  'Codex',
  'VS Code',
  'Windsurf / Cascade',
  'Hermes Agent',
];

for (const client of clients) {
  check(compatibilityText.includes(client), `docs/COMPATIBILITY.md must mention ${client}`);
  check(installText.includes(client), `docs/INSTALL.md must mention ${client}`);
}

check(installText.includes('under five minutes'), 'docs/INSTALL.md must set the fast-path expectation');
check(installText.includes('One-Command And One-Click Status'), 'docs/INSTALL.md must include the one-command/one-click status matrix');
check(installText.includes('code --add-mcp'), 'docs/INSTALL.md must include the VS Code one-command install path');
check(installText.includes('Cursor Settings'), 'docs/INSTALL.md must include the Cursor UI install fallback');
check(installText.includes('mcp-config') && installText.includes('mcp-write'), 'docs/INSTALL.md must mention mcp-config and mcp-write');
check(installText.includes('CHROME_BRIDGE_MCP_TOOL_PROFILE=core'), 'docs/INSTALL.md must mention the core tool profile for IDE clients');
check(installText.includes('Load unpacked') && installText.includes('doctor --live-checks'), 'docs/INSTALL.md must include extension loading and live verification');
check(readmeText.includes('docs/INSTALL.md'), 'README.md must link the install guide');
check(readmeText.includes('docs/COMPATIBILITY.md'), 'README.md must continue linking the compatibility guide');
check(packageJson.scripts?.['check:client-docs'] === 'node ./scripts/docs/check-client-docs.mjs', 'package scripts must expose check:client-docs');
check(packageJson.scripts?.check?.includes('npm run check:client-docs'), 'npm run check must include check:client-docs');

if (failures.length > 0) {
  process.stderr.write(`${JSON.stringify({ ok: false, failures }, null, 2)}\n`);
  process.exit(1);
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  clients: clients.length,
}, null, 2)}\n`);
