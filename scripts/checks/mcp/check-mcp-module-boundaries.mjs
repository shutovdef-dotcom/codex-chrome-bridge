#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

async function read(relativePath) {
  return fs.readFile(path.join(rootDir, relativePath), 'utf8').catch(() => '');
}

async function exists(relativePath) {
  return fs.access(path.join(rootDir, relativePath)).then(() => true, () => false);
}

const packageText = await read('package.json');
const packageJson = packageText ? JSON.parse(packageText) : {};
const wrapperText = await read('mcp/chrome-bridge-mcp.mjs');
const mainText = await read('mcp/server/main.mjs');
const mcpSourceHelperText = await read('scripts/checks/lib/mcp-source.mjs');

const requiredFiles = [
  'mcp/chrome-bridge-mcp.mjs',
  'mcp/server/main.mjs',
  'scripts/checks/lib/mcp-source.mjs',
  'scripts/checks/mcp/check-mcp-module-boundaries.mjs',
];

for (const requiredFile of requiredFiles) {
  check(await exists(requiredFile), `MCP module file is missing: ${requiredFile}`);
  check(
    packageJson.scripts?.check?.includes(`node --check ./${requiredFile}`),
    `npm run check must syntax-check ${requiredFile}`,
  );
}

check(packageJson.bin?.['chrome-bridge-mcp'] === './mcp/chrome-bridge-mcp.mjs', 'chrome-bridge-mcp bin path must remain stable');
check(packageJson.scripts?.['check:mcp-modules'] === 'node ./scripts/checks/mcp/check-mcp-module-boundaries.mjs', 'package.json must expose check:mcp-modules');
check(packageJson.scripts?.check?.includes('npm run check:mcp-modules'), 'npm run check must run check:mcp-modules');
check(wrapperText.startsWith('#!/usr/bin/env node'), 'mcp/chrome-bridge-mcp.mjs must keep its executable shebang');
check(wrapperText.includes("import { main } from './server/main.mjs';"), 'mcp/chrome-bridge-mcp.mjs must import main from ./server/main.mjs');
check(wrapperText.includes('main().catch'), 'mcp/chrome-bridge-mcp.mjs must keep top-level error handling');
check((wrapperText.match(/\n/g) || []).length <= 12, 'mcp/chrome-bridge-mcp.mjs wrapper must stay tiny');
check(!wrapperText.includes('server.tool('), 'mcp/chrome-bridge-mcp.mjs wrapper must not contain tool registration internals');
check(mainText.includes('export async function main()'), 'mcp/server/main.mjs must export the MCP main function');
check(mainText.includes('server.tool(') && mainText.includes('server.prompt(') && mainText.includes('server.resource('), 'mcp/server/main.mjs must own MCP surfaces');
check(mcpSourceHelperText.includes('readMcpSource') && mcpSourceHelperText.includes('mcp/server/main.mjs'), 'MCP source helper must aggregate wrapper and implementation files');

if (failures.length) {
  process.stdout.write(`${JSON.stringify({ ok: false, failures }, null, 2)}\n`);
  process.exit(1);
}

process.stdout.write(`${JSON.stringify({ ok: true }, null, 2)}\n`);
