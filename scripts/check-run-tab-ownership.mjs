#!/usr/bin/env node
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  createRunId,
  readRunState,
  recordOwnedTab,
} from '../shared/run-tabs.mjs';
import { validateCommandPayload } from '../shared/command-registry.mjs';

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(rootDir, 'bin/chrome-bridge.mjs');
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function inheritedEnv(extra = {}) {
  return {
    ...Object.fromEntries(Object.entries(process.env).filter(([, value]) => typeof value === 'string')),
    ...extra,
  };
}

async function runCli(args, env) {
  try {
    const result = await execFileAsync(process.execPath, [cliPath, ...args], {
      cwd: rootDir,
      env,
      timeout: 20_000,
    });
    return {
      ok: true,
      stdout: result.stdout,
      stderr: result.stderr,
      parsed: JSON.parse(result.stdout),
    };
  } catch (error) {
    let parsed = null;
    try {
      parsed = JSON.parse(error?.stdout || '');
    } catch {
      // Non-JSON failure output is reported below.
    }
    return {
      ok: false,
      stdout: error?.stdout || '',
      stderr: error?.stderr || '',
      parsed,
      error,
    };
  }
}

async function withFakeBridge(fn) {
  let nextTabId = 700;
  const receivedCommands = [];
  let failNextRead = false;
  const server = http.createServer(async (req, res) => {
    if (req.url !== '/command' || req.method !== 'POST') {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'unexpected path' }));
      return;
    }

    let body = '';
    for await (const chunk of req) body += chunk;
    const parsed = JSON.parse(body);
    receivedCommands.push(parsed);

    try {
      validateCommandPayload(parsed.action, parsed.payload || {});
    } catch (error) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        ok: false,
        code: 'INVALID_PAYLOAD',
        error: String(error?.message || error),
      }));
      return;
    }

    if (parsed.action === 'open') {
      const id = nextTabId;
      nextTabId += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        result: {
          id,
          windowId: 1,
          groupId: 10,
          active: Boolean(parsed.payload.active),
          url: parsed.payload.url,
          title: `Temp ${id}`,
          group: { id: 10, title: 'Codex Bridge', color: 'purple' },
        },
      }));
      return;
    }

    if (parsed.action === 'text') {
      if (failNextRead) {
        failNextRead = false;
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          ok: false,
          code: 'FAKE_READ_FAILURE',
          error: 'forced fake read failure',
        }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        result: {
          tab: {
            id: parsed.payload.tabId,
            url: 'https://example.test/temp',
            title: 'Temp text page',
          },
          text: 'temporary tab payload',
          length: 'temporary tab payload'.length,
          truncated: false,
        },
      }));
      return;
    }

    if (parsed.action === 'closeTab') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        result: {
          closedTabIds: [parsed.payload.tabId],
          missingTabIds: [],
          tabGroupPersistenceMitigation: {
            savedClosedGroupChipPrevention: {
              prevented: true,
              method: 'ungroup-before-close',
            },
          },
        },
      }));
      return;
    }

    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: `unexpected action ${parsed.action}` }));
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const { port } = server.address();
    return await fn({
      bridgeUrl: `http://127.0.0.1:${port}`,
      receivedCommands,
      failReadOnce: () => {
        failNextRead = true;
      },
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chrome-bridge-run-state-check-'));
const artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chrome-bridge-run-artifact-check-'));
try {
  const seededRunId = createRunId('check');
  await recordOwnedTab({ runId: seededRunId, tabId: 42, stateDir });
  const seededState = await readRunState({ runId: seededRunId, stateDir });
  check(seededState.ownedTabIds.includes(42), 'run state must record owned tab ids');

  await withFakeBridge(async ({ bridgeUrl, receivedCommands, failReadOnce }) => {
    const env = inheritedEnv({
      CHROME_BRIDGE_URL: bridgeUrl,
      CHROME_BRIDGE_RUN_STATE_DIR: stateDir,
    });

    const success = await runCli([
      'with-temp-tab',
      'https://example.test/temp',
      '--',
      'text',
      '--summary-only',
      '--out',
      path.join(artifactDir, 'success.txt'),
    ], env);
    check(success.ok, `with-temp-tab success command failed: ${success.stderr || success.stdout}`);
    check(success.parsed?.ok === true, 'with-temp-tab success must return ok=true');
    check(success.parsed?.runId, 'with-temp-tab success must expose runId');
    check(success.parsed?.ownedTabsBefore?.length === 0, 'with-temp-tab success must start with zero owned tabs');
    check(success.parsed?.ownedTabsAfter?.length === 0, 'with-temp-tab success must leave zero owned tabs');
    check(success.parsed?.closedTabIds?.length === 1, 'with-temp-tab success must close one owned tab');
    check(success.parsed?.result?.outputContract === 'metadata-first/v1', 'with-temp-tab nested read must return metadata-first envelope');

    const successActions = receivedCommands.map((command) => command.action);
    check(successActions.includes('open'), 'with-temp-tab success must open a temp tab');
    check(successActions.includes('text'), 'with-temp-tab success must run nested text command');
    check(successActions.includes('closeTab'), 'with-temp-tab success must close the temp tab');

    failReadOnce();
    const failure = await runCli([
      'with-temp-tab',
      'https://example.test/fail',
      '--',
      'text',
      '--summary-only',
      '--out',
      path.join(artifactDir, 'failure.txt'),
    ], env);
    check(!failure.ok, 'with-temp-tab forced failure must exit non-zero');
    check(failure.parsed?.ok === false, 'with-temp-tab forced failure must return structured ok=false JSON');
    check(failure.parsed?.closedTabIds?.length === 1, 'with-temp-tab forced failure must still close one owned tab');
    check(failure.parsed?.ownedTabsAfter?.length === 0, 'with-temp-tab forced failure must leave zero owned tabs');

    const batchRunId = createRunId('batch');
    const batchStartCommandCount = receivedCommands.length;
    for (let i = 0; i < 20; i += 1) {
      const batch = await runCli([
        'with-temp-tab',
        `https://example.test/batch-${i}`,
        '--run-id',
        batchRunId,
        '--',
        'text',
        '--summary-only',
        '--out',
        path.join(artifactDir, `batch-${i}.txt`),
      ], env);
      check(batch.ok, `with-temp-tab batch command ${i} failed: ${batch.stderr || batch.stdout}`);
      check(batch.parsed?.ownedTabsBefore?.length === 0, `with-temp-tab batch command ${i} must start with zero owned tabs`);
      check(batch.parsed?.ownedTabsAfter?.length === 0, `with-temp-tab batch command ${i} must leave zero owned tabs`);
      check(batch.parsed?.closedTabIds?.length === 1, `with-temp-tab batch command ${i} must close one owned tab`);
    }
    const batchCommands = receivedCommands.slice(batchStartCommandCount);
    const batchState = await readRunState({ runId: batchRunId, stateDir });
    check(batchState.ownedTabIds.length === 0, 'with-temp-tab batch must leave zero run-owned tabs in state');
    check(batchCommands.filter((command) => command.action === 'open').length === 20, 'with-temp-tab batch must open 20 temp tabs');
    check(batchCommands.filter((command) => command.action === 'text').length === 20, 'with-temp-tab batch must read 20 temp tabs');
    check(batchCommands.filter((command) => command.action === 'closeTab').length === 20, 'with-temp-tab batch must close 20 temp tabs');

    const cleanupRunId = createRunId('cleanup');
    await recordOwnedTab({ runId: cleanupRunId, tabId: 901, stateDir });
    await recordOwnedTab({ runId: cleanupRunId, tabId: 902, stateDir });
    const cleanup = await runCli([
      'cleanup-run-tabs',
      '--run-id',
      cleanupRunId,
    ], env);
    check(cleanup.ok, `cleanup-run-tabs failed: ${cleanup.stderr || cleanup.stdout}`);
    check(cleanup.parsed?.runId === cleanupRunId, 'cleanup-run-tabs must echo runId');
    check(cleanup.parsed?.ownedTabsBefore?.length === 2, 'cleanup-run-tabs must report owned tabs before cleanup');
    check(cleanup.parsed?.closedTabIds?.length === 2, 'cleanup-run-tabs must close recorded tabs');
    check(cleanup.parsed?.ownedTabsAfter?.length === 0, 'cleanup-run-tabs must remove closed tabs from run state');

    const closedPayloadTabIds = receivedCommands
      .filter((command) => command.action === 'closeTab')
      .map((command) => command.payload.tabId);
    check(!closedPayloadTabIds.includes(42), 'cleanup must not close tabs recorded under a different run id');
  });
} finally {
  await fs.rm(stateDir, { recursive: true, force: true });
  await fs.rm(artifactDir, { recursive: true, force: true });
}

if (failures.length) {
  process.stdout.write(`${JSON.stringify({ ok: false, failures }, null, 2)}\n`);
  process.exit(1);
}

process.stdout.write(`${JSON.stringify({ ok: true }, null, 2)}\n`);
