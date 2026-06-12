#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

async function read(relativePath) {
  return fs.readFile(path.join(rootDir, relativePath), 'utf8').catch(() => '');
}

const [
  packageText,
  transportText,
  compatibilityText,
  safetyText,
  readmeText,
] = await Promise.all([
  read('package.json'),
  read('docs/STREAMABLE-HTTP.md'),
  read('docs/COMPATIBILITY.md'),
  read('docs/SAFETY.md'),
  read('README.md'),
]);

const packageJson = packageText ? JSON.parse(packageText) : {};

check(packageJson.scripts?.['check:streamable-http-plan'] === 'node ./scripts/check-streamable-http-plan.mjs', 'package.json must expose check:streamable-http-plan');
check(packageJson.scripts?.check?.includes('npm run check:streamable-http-plan'), 'npm run check must include check:streamable-http-plan');
check(transportText.includes('# Streamable HTTP Transport Plan'), 'docs/STREAMABLE-HTTP.md must exist with the expected title');
check(transportText.includes('https://modelcontextprotocol.io/specification/2025-11-25/basic/transports'), 'transport plan must cite the current MCP transport spec');
check(transportText.includes('https://modelcontextprotocol.io/specification/2025-03-26/basic/transports'), 'transport plan must cite the Streamable HTTP introduction spec');
check(transportText.includes('stdio remains the default'), 'transport plan must preserve stdio as the default local transport');
check(transportText.includes('Origin') && transportText.includes('DNS rebinding'), 'transport plan must include Origin/DNS rebinding requirements');
check(transportText.includes('127.0.0.1') && transportText.includes('authentication') && transportText.includes('TLS'), 'transport plan must include bind/auth/TLS requirements');
check(transportText.includes('MCP-Session-Id') && transportText.includes('MCP-Protocol-Version'), 'transport plan must include current session/protocol header requirements');
check(transportText.includes('Not implemented in this release'), 'transport plan must not imply Streamable HTTP is currently shipped');
check(compatibilityText.includes('STREAMABLE-HTTP.md'), 'compatibility docs must link the Streamable HTTP plan');
check(safetyText.includes('Streamable HTTP') && safetyText.includes('Origin'), 'safety docs must mention Streamable HTTP gating');
check(readmeText.includes('Streamable HTTP') && readmeText.includes('STREAMABLE-HTTP.md'), 'README must link the Streamable HTTP plan');

if (failures.length) {
  process.stdout.write(`${JSON.stringify({ ok: false, failures }, null, 2)}\n`);
  process.exit(1);
}

process.stdout.write(`${JSON.stringify({ ok: true }, null, 2)}\n`);
