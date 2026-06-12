#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  appendActionRecording,
  summarizeActionRecording,
} from '../shared/action-recording.mjs';
import {
  CLI_COMMANDS,
  LOCAL_COMMAND_METADATA,
  MCP_TOOLS,
} from '../shared/command-registry.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

const [
  packageText,
  cliText,
  mcpText,
  helperText,
  readmeText,
  cliDocsText,
  mcpDocsText,
] = await Promise.all([
  fs.readFile(path.join(rootDir, 'package.json'), 'utf8'),
  fs.readFile(path.join(rootDir, 'bin/chrome-bridge.mjs'), 'utf8'),
  fs.readFile(path.join(rootDir, 'mcp/chrome-bridge-mcp.mjs'), 'utf8'),
  fs.readFile(path.join(rootDir, 'shared/action-recording.mjs'), 'utf8'),
  fs.readFile(path.join(rootDir, 'README.md'), 'utf8'),
  fs.readFile(path.join(rootDir, 'docs/CLI.md'), 'utf8'),
  fs.readFile(path.join(rootDir, 'docs/MCP.md'), 'utf8'),
]);

const packageJson = JSON.parse(packageText);

check(packageJson.scripts?.['check:action-recording'] === 'node ./scripts/check-action-recording.mjs', 'package.json must expose check:action-recording');
check(packageJson.scripts?.check?.includes('npm run check:action-recording'), 'npm run check must include check:action-recording');
check(CLI_COMMANDS.includes('recording-summary'), 'CLI commands must include recording-summary');
check(MCP_TOOLS.includes('chrome_bridge_recording_summary'), 'MCP tools must include chrome_bridge_recording_summary');
check(LOCAL_COMMAND_METADATA['recording-summary']?.usesLiveBridge === false, 'recording-summary must be a local no-live-bridge command');
check(cliText.includes('CHROME_BRIDGE_RECORDING_PATH') || helperText.includes('CHROME_BRIDGE_RECORDING_PATH'), 'CLI/helper must document recording env var');
check(cliText.includes('appendActionRecording') && mcpText.includes('appendActionRecording'), 'CLI and MCP command wrappers must append action recordings');
check(cliText.includes("cmd === 'recording-summary'") && cliText.includes('summarizeActionRecording'), 'CLI must implement recording-summary');
check(mcpText.includes('chrome_bridge_recording_summary') && mcpText.includes('summarizeActionRecording'), 'MCP must implement chrome_bridge_recording_summary');
check(helperText.includes('autoExecute: false') && helperText.includes('requiresHumanReview: true'), 'recording helper must keep replay-lite non-executing and human-reviewed');
check(readmeText.includes('CHROME_BRIDGE_RECORDING_PATH') && readmeText.includes('recording-summary'), 'README must document action recording');
check(cliDocsText.includes('recording-summary') && cliDocsText.includes('CHROME_BRIDGE_RECORDING_PATH'), 'CLI docs must document action recording');
check(mcpDocsText.includes('chrome_bridge_recording_summary') && mcpDocsText.includes('CHROME_BRIDGE_RECORDING_PATH'), 'MCP docs must document action recording');

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chrome-bridge-recording-check-'));
try {
  const recordingPath = path.join(tempDir, 'actions.jsonl');
  await appendActionRecording({
    path: recordingPath,
    action: 'type',
    payload: { selector: '#email', text: 'private@example.test', confirmed: true },
    timeoutMs: 30_000,
    ok: true,
    result: { typed: '#email', length: 20 },
  });
  const summary = await summarizeActionRecording({ path: recordingPath });
  check(summary.ok, 'recording summary must succeed');
  check(summary.count === 1 && summary.byAction.type === 1, 'recording summary must count actions');
  check(summary.replayLite.autoExecute === false, 'replay-lite summary must not auto-execute');
  check(summary.replayLite.steps?.[0]?.requiresHumanReview === true, 'replay-lite steps must require human review');
  check(summary.replayLite.steps?.[0]?.payload?.text?.redacted === true, 'recording payload must redact typed text');
  check(!JSON.stringify(summary).includes('private@example.test'), 'recording summary must not leak raw typed text');
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}

if (failures.length) {
  process.stdout.write(`${JSON.stringify({ ok: false, failures }, null, 2)}\n`);
  process.exit(1);
}

process.stdout.write(`${JSON.stringify({ ok: true }, null, 2)}\n`);
