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
const wrapperText = await read('extension/page-scripts.js');
const mainText = await read('extension/page-scripts/main.js');
const sourceHelperText = await read('scripts/checks/lib/page-scripts-source.mjs');

const requiredFiles = [
  'extension/page-scripts.js',
  'extension/page-scripts/main.js',
  'scripts/checks/lib/page-scripts-source.mjs',
  'scripts/checks/extension/check-page-scripts-modules.mjs',
];

for (const requiredFile of requiredFiles) {
  check(await exists(requiredFile), `page-scripts module file is missing: ${requiredFile}`);
  check(
    packageJson.scripts?.check?.includes(`node --check ./${requiredFile}`),
    `npm run check must syntax-check ${requiredFile}`,
  );
}

check(packageJson.scripts?.['check:page-scripts-modules'] === 'node ./scripts/checks/extension/check-page-scripts-modules.mjs', 'package.json must expose check:page-scripts-modules');
check(packageJson.scripts?.check?.includes('npm run check:page-scripts-modules'), 'npm run check must run check:page-scripts-modules');
check(wrapperText.trim() === "export * from './page-scripts/main.js';", 'extension/page-scripts.js must stay as a stable re-export wrapper');
check((wrapperText.match(/\n/g) || []).length <= 1, 'extension/page-scripts.js wrapper must stay tiny');
check(mainText.includes('export async function collectText') && mainText.includes('export async function collectSnapshot'), 'page-scripts main module must own read collectors');
check(mainText.includes('export function collectObserve') && mainText.includes('export function resolveObservedElementTarget'), 'page-scripts main module must own observe/ref helpers');
check(sourceHelperText.includes('readPageScriptsSource') && sourceHelperText.includes('extension/page-scripts/main.js'), 'page-scripts source helper must aggregate wrapper and implementation files');

if (failures.length) {
  process.stdout.write(`${JSON.stringify({ ok: false, failures }, null, 2)}\n`);
  process.exit(1);
}

process.stdout.write(`${JSON.stringify({ ok: true }, null, 2)}\n`);
