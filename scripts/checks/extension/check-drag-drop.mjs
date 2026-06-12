#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CLI_COMMANDS,
  COMMAND_PAYLOAD_SCHEMAS,
  MCP_TOOLS,
  validateCommandPayload,
} from '../../../shared/command-registry.mjs';
import { readRegistrySource } from '../lib/registry-source.mjs';

import { readCliSource } from '../lib/cli-source.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function expectPayload(payload, expected, label) {
  let ok = true;
  try {
    validateCommandPayload('dragDrop', payload);
  } catch {
    ok = false;
  }
  check(ok === expected, label);
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
  registryText,
  cliText,
  mcpText,
  backgroundText,
  interactionsText,
  readmeText,
  cliDocsText,
  mcpDocsText,
] = await Promise.all([
  fs.readFile(path.join(rootDir, 'package.json'), 'utf8'),
  readRegistrySource(rootDir),
  readCliSource(rootDir),
  fs.readFile(path.join(rootDir, 'mcp/chrome-bridge-mcp.mjs'), 'utf8'),
  fs.readFile(path.join(rootDir, 'extension/background.js'), 'utf8'),
  fs.readFile(path.join(rootDir, 'extension/page-interactions.js'), 'utf8'),
  fs.readFile(path.join(rootDir, 'README.md'), 'utf8'),
  fs.readFile(path.join(rootDir, 'docs/CLI.md'), 'utf8'),
  fs.readFile(path.join(rootDir, 'docs/MCP.md'), 'utf8'),
]);

const packageJson = JSON.parse(packageText);

check(packageJson.scripts?.['check:drag-drop'] === 'node ./scripts/checks/extension/check-drag-drop.mjs', 'package.json must expose check:drag-drop');
check(packageJson.scripts?.check?.includes('npm run check:drag-drop'), 'npm run check must include check:drag-drop');
check(CLI_COMMANDS.includes('drag-drop'), 'CLI command list must include drag-drop');
check(MCP_TOOLS.includes('chrome_bridge_drag_drop'), 'MCP tool list must include chrome_bridge_drag_drop');
for (const key of ['selector', 'elementRef', 'targetSelector', 'targetElementRef', 'x', 'y', 'targetX', 'targetY', 'trusted', 'confirmed']) {
  check(COMMAND_PAYLOAD_SCHEMAS.dragDrop?.includes(key), `dragDrop schema must allow ${key}`);
}
expectPayload({ selector: '#a', targetElementRef: 'e1', confirmed: true }, true, 'dragDrop selector/ref target payload must validate');
expectPayload({ x: 1, y: 2, targetX: 3, targetY: 4, confirmed: true }, true, 'dragDrop coordinate payload must validate');
expectPayload({ selector: '#a', confirmed: true }, false, 'dragDrop must require a target');
expectPayload({ selector: '#a', targetX: 'bad', targetY: 4, confirmed: true }, false, 'dragDrop target coordinates must be numeric');
check(registryText.includes('dragDrop') && registryText.includes('chrome_bridge_drag_drop'), 'registry metadata must expose dragDrop CLI/MCP action');
check(registryText.includes('chrome-bridge drag-drop'), 'CLI usage must document drag-drop');
check(functionBlock(interactionsText, 'dragDrop').includes("requireConfirmed(payload, 'dragDrop')"), 'extension dragDrop must require confirmation');
check(functionBlock(interactionsText, 'dragDrop').includes('Input.dispatchMouseEvent'), 'extension dragDrop must support trusted debugger mouse events');
check(backgroundText.includes('dragDrop') && backgroundText.includes("case 'dragDrop'"), 'extension background must dispatch dragDrop');
check(cliText.includes("cmd === 'drag-drop'") && cliText.includes("command('dragDrop'"), 'CLI must implement drag-drop command');
check(mcpText.includes('chrome_bridge_drag_drop') && mcpText.includes("bridgeCommand('dragDrop'"), 'MCP must expose chrome_bridge_drag_drop');
check(readmeText.includes('drag-drop'), 'README must document drag-drop');
check(cliDocsText.includes('drag-drop'), 'CLI docs must document drag-drop');
check(mcpDocsText.includes('chrome_bridge_drag_drop'), 'MCP docs must document drag-drop');

if (failures.length) {
  process.stdout.write(`${JSON.stringify({ ok: false, failures }, null, 2)}\n`);
  process.exit(1);
}

process.stdout.write(`${JSON.stringify({ ok: true }, null, 2)}\n`);
