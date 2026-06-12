#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function functionBlock(source, name) {
  const marker = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(`);
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
  pageScriptsText,
  readmeText,
  cliDocsText,
  mcpDocsText,
  safetyDocsText,
] = await Promise.all([
  fs.readFile(path.join(rootDir, 'package.json'), 'utf8'),
  fs.readFile(path.join(rootDir, 'extension/page-scripts.js'), 'utf8'),
  fs.readFile(path.join(rootDir, 'README.md'), 'utf8'),
  fs.readFile(path.join(rootDir, 'docs/CLI.md'), 'utf8'),
  fs.readFile(path.join(rootDir, 'docs/MCP.md'), 'utf8'),
  fs.readFile(path.join(rootDir, 'docs/SAFETY.md'), 'utf8'),
]);

const packageJson = JSON.parse(packageText);
const observeBlock = functionBlock(pageScriptsText, 'collectObserve');
const resolverBlock = functionBlock(pageScriptsText, 'resolveObservedElementTarget');

check(packageJson.scripts?.['check:frame-dom-capabilities'] === 'node ./scripts/checks/extension/check-frame-dom-capabilities.mjs', 'package.json must expose check:frame-dom-capabilities');
check(packageJson.scripts?.check?.includes('npm run check:frame-dom-capabilities'), 'npm run check must include check:frame-dom-capabilities');
check(pageScriptsText.includes('function collectDomCapabilityDiagnostics'), 'page scripts must define DOM capability diagnostics helper');
check(observeBlock.includes('frameDiagnostics'), 'observe output must include frameDiagnostics metadata');
check(observeBlock.includes('shadowDiagnostics'), 'observe output must include shadowDiagnostics metadata');
check(observeBlock.includes('capabilityWarnings'), 'observe output must include capabilityWarnings');
check(observeBlock.includes('collectDomCapabilityDiagnostics'), 'observe must call DOM capability diagnostics helper');
check(resolverBlock.includes('elementRefTargets:') && resolverBlock.includes('main-frame-light-dom'), 'elementRef resolver must report the supported target scope');
check(readmeText.includes('frameDiagnostics') && readmeText.includes('shadowDiagnostics'), 'README must document iframe/shadow capability metadata');
check(cliDocsText.includes('frameDiagnostics') && cliDocsText.includes('shadowDiagnostics'), 'CLI docs must document iframe/shadow capability metadata');
check(mcpDocsText.includes('frameDiagnostics') && mcpDocsText.includes('shadowDiagnostics'), 'MCP docs must document iframe/shadow capability metadata');
check(safetyDocsText.includes('main-frame light DOM') && safetyDocsText.includes('cross-origin iframe'), 'safety docs must explain iframe/shadow action boundaries');

if (failures.length) {
  process.stdout.write(`${JSON.stringify({ ok: false, failures }, null, 2)}\n`);
  process.exit(1);
}

process.stdout.write(`${JSON.stringify({ ok: true }, null, 2)}\n`);
