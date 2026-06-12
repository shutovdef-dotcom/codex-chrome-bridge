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
const wrapperText = await read('shared/command-registry.mjs');

const modules = [
  'shared/registry/actions.mjs',
  'shared/registry/metadata.mjs',
  'shared/registry/cli-usage.mjs',
  'shared/registry/surfaces.mjs',
  'shared/registry/generated-docs.mjs',
  'shared/registry/validation.mjs',
  'shared/registry/index.mjs',
];

const syntaxCheckedFiles = [
  'shared/command-registry.mjs',
  ...modules,
  'scripts/checks/lib/registry-source.mjs',
  'scripts/checks/contracts/check-registry-module-boundaries.mjs',
];

for (const modulePath of modules) {
  check(await exists(modulePath), `registry module is missing: ${modulePath}`);
}

check(wrapperText.trim() === "export * from './registry/index.mjs';", 'shared/command-registry.mjs must stay as a stable re-export wrapper');
check((wrapperText.match(/\n/g) || []).length <= 1, 'shared/command-registry.mjs wrapper must stay tiny');
check(packageJson.scripts?.['check:registry-modules'] === 'node ./scripts/checks/contracts/check-registry-module-boundaries.mjs', 'package.json must expose check:registry-modules');
for (const syntaxCheckedFile of syntaxCheckedFiles) {
  check(
    packageJson.scripts?.check?.includes(`node --check ./${syntaxCheckedFile}`),
    `npm run check must syntax-check ${syntaxCheckedFile}`,
  );
}
check(packageJson.scripts?.check?.includes('npm run check:registry-modules'), 'npm run check must run check:registry-modules');

const actionsText = await read('shared/registry/actions.mjs');
const metadataText = await read('shared/registry/metadata.mjs');
const cliUsageText = await read('shared/registry/cli-usage.mjs');
const surfacesText = await read('shared/registry/surfaces.mjs');
const generatedDocsText = await read('shared/registry/generated-docs.mjs');
const validationText = await read('shared/registry/validation.mjs');
const indexText = await read('shared/registry/index.mjs');

check(actionsText.includes('COMMAND_PAYLOAD_SCHEMAS') && actionsText.includes('DEBUGGER_SERIALIZED_ACTIONS'), 'actions module must own action schemas and debugger serialization metadata');
check(metadataText.includes('COMMAND_METADATA') && metadataText.includes('LOCAL_COMMAND_METADATA'), 'metadata module must own command metadata catalogs');
check(cliUsageText.includes('CLI_USAGE_LINES') && cliUsageText.includes('CLI_USAGE_GROUPS'), 'cli-usage module must own CLI usage lines and groups');
check(surfacesText.includes('CLI_COMMANDS') && surfacesText.includes('MCP_TOOLS'), 'surfaces module must own CLI command and MCP tool lists');
check(generatedDocsText.includes('generatedMcpToolsBlock') && generatedDocsText.includes('generatedCliSafetyNotesBlock'), 'generated-docs module must own generated reference blocks');
check(validationText.includes('CommandPayloadValidationError') && validationText.includes('validateCommandPayload'), 'validation module must own payload validation');
check(indexText.includes("export * from './actions.mjs';") && indexText.includes("export * from './validation.mjs';"), 'registry index must re-export focused modules');

if (failures.length) {
  process.stdout.write(`${JSON.stringify({ ok: false, failures }, null, 2)}\n`);
  process.exit(1);
}

process.stdout.write(`${JSON.stringify({ ok: true }, null, 2)}\n`);
