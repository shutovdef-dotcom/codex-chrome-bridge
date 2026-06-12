#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMAND_PAYLOAD_SCHEMAS } from '../shared/command-registry.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function functionBlock(source, name) {
  const marker = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`);
  const match = marker.exec(source);
  if (!match) return '';
  const paramsStart = source.indexOf('(', match.index);
  let paramsDepth = 0;
  let paramsEnd = -1;
  for (let index = paramsStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '(') paramsDepth += 1;
    if (char === ')') {
      paramsDepth -= 1;
      if (paramsDepth === 0) {
        paramsEnd = index;
        break;
      }
    }
  }
  const braceStart = source.indexOf('{', paramsEnd);
  if (braceStart < 0) return '';
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(match.index, index + 1);
    }
  }
  return '';
}

const [
  packageText,
  registryText,
  cliText,
  mcpText,
  pageScriptsText,
  pageInteractionsText,
  pageArtifactsText,
  pageReadActionsText,
  readmeText,
  cliDocsText,
  mcpDocsText,
] = await Promise.all([
  fs.readFile(path.join(rootDir, 'package.json'), 'utf8'),
  fs.readFile(path.join(rootDir, 'shared/command-registry.mjs'), 'utf8'),
  fs.readFile(path.join(rootDir, 'bin/chrome-bridge.mjs'), 'utf8'),
  fs.readFile(path.join(rootDir, 'mcp/chrome-bridge-mcp.mjs'), 'utf8'),
  fs.readFile(path.join(rootDir, 'extension/page-scripts.js'), 'utf8'),
  fs.readFile(path.join(rootDir, 'extension/page-interactions.js'), 'utf8'),
  fs.readFile(path.join(rootDir, 'extension/page-artifacts.js'), 'utf8'),
  fs.readFile(path.join(rootDir, 'extension/page-read-actions.js'), 'utf8'),
  fs.readFile(path.join(rootDir, 'README.md'), 'utf8'),
  fs.readFile(path.join(rootDir, 'docs/CLI.md'), 'utf8'),
  fs.readFile(path.join(rootDir, 'docs/MCP.md'), 'utf8'),
]);

const packageJson = JSON.parse(packageText);
const refCapableActions = ['waitForSelector', 'html', 'screenshot', 'listSelectOptions', 'click', 'download', 'hover', 'type', 'press', 'select', 'uploadFile'];

check(packageJson.scripts?.['check:element-ref-contract'] === 'node ./scripts/check-element-ref-contract.mjs', 'package.json must expose check:element-ref-contract');
check(packageJson.scripts?.check?.includes('npm run check:element-ref-contract'), 'npm run check must include check:element-ref-contract');
check(registryText.includes("const elementTarget = [...base, 'selector', 'elementRef']"), 'registry must define shared selector-or-elementRef payload keys');
for (const action of refCapableActions) {
  check(COMMAND_PAYLOAD_SCHEMAS[action]?.includes('elementRef'), `${action} schema must allow elementRef`);
}

check(functionBlock(pageScriptsText, 'collectObserve').includes('elementRef:'), 'observe output must include elementRef for actionable elements');
check(pageScriptsText.includes('export function resolveObservedElementTarget'), 'page scripts must export observed element ref resolver');
check(functionBlock(pageScriptsText, 'resolveObservedElementTarget').includes('elementRef'), 'observed element resolver must accept elementRef');
check(functionBlock(pageReadActionsText, 'waitForSelector').includes('resolveElementTarget'), 'waitForSelector must resolve selector-or-ref targets before page scripts');
check(functionBlock(pageArtifactsText, 'screenshot').includes('resolveObservedElementTarget'), 'selector screenshot must resolve selector-or-ref targets');
for (const helperName of ['click', 'hover', 'typeInto', 'pressKey', 'selectOption', 'uploadFile']) {
  check(functionBlock(pageInteractionsText, helperName).includes('resolveElementTarget'), `${helperName} must resolve selector-or-ref targets`);
}

check(registryText.includes('--ref <ref>'), 'CLI usage registry must expose --ref <ref>');
check(cliText.includes('elementRef: args.ref'), 'CLI must forward --ref as elementRef');
check(mcpText.includes('elementRef: z.string().optional()'), 'MCP surfaces must expose elementRef schema fields');
check(readmeText.includes('--ref <ref>'), 'README must document ref-first interaction');
check(cliDocsText.includes('--ref <ref>'), 'CLI docs must document ref-first interaction');
check(mcpDocsText.includes('elementRef'), 'MCP docs must document elementRef');

if (failures.length) {
  process.stdout.write(`${JSON.stringify({ ok: false, failures }, null, 2)}\n`);
  process.exit(1);
}

process.stdout.write(`${JSON.stringify({ ok: true }, null, 2)}\n`);
