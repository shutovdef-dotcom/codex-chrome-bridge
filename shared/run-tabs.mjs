import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_RUN_STATE_DIR = path.join(os.tmpdir(), 'chrome-bridge-run-tabs');

function effectiveStateDir(stateDir) {
  return path.resolve(stateDir || process.env.CHROME_BRIDGE_RUN_STATE_DIR || DEFAULT_RUN_STATE_DIR);
}

function normalizeRunId(runId) {
  const value = String(runId || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) {
    throw new Error('runId must be 1-128 chars and contain only letters, numbers, dots, underscores, colons, or hyphens');
  }
  return value;
}

function normalizeTabId(tabId) {
  const parsed = Number(tabId);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('tabId must be a non-negative integer');
  }
  return parsed;
}

function uniqueSortedTabIds(values = []) {
  return [...new Set(values.map(normalizeTabId))].sort((a, b) => a - b);
}

export function createRunId(prefix = 'run') {
  const safePrefix = String(prefix || 'run').replace(/[^A-Za-z0-9._:-]/g, '-').slice(0, 24) || 'run';
  return `${safePrefix}-${Date.now().toString(36)}-${crypto.randomUUID()}`;
}

export function runStatePath({ runId, stateDir } = {}) {
  return path.join(effectiveStateDir(stateDir), `${normalizeRunId(runId)}.json`);
}

export async function readRunState({ runId, stateDir } = {}) {
  const normalizedRunId = normalizeRunId(runId);
  const filePath = runStatePath({ runId: normalizedRunId, stateDir });
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
    return {
      runId: normalizedRunId,
      createdAt: parsed.createdAt || null,
      updatedAt: parsed.updatedAt || null,
      ownedTabIds: uniqueSortedTabIds(parsed.ownedTabIds || []),
      tabs: parsed.tabs && typeof parsed.tabs === 'object' ? { ...parsed.tabs } : {},
      path: filePath,
    };
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    return {
      runId: normalizedRunId,
      createdAt: null,
      updatedAt: null,
      ownedTabIds: [],
      tabs: {},
      path: filePath,
    };
  }
}

export async function writeRunState({ runId, stateDir, ownedTabIds = [], tabs = {}, createdAt, now } = {}) {
  const normalizedRunId = normalizeRunId(runId);
  const filePath = runStatePath({ runId: normalizedRunId, stateDir });
  const timestamp = now || new Date().toISOString();
  const payload = {
    runId: normalizedRunId,
    createdAt: createdAt || timestamp,
    updatedAt: timestamp,
    ownedTabIds: uniqueSortedTabIds(ownedTabIds),
    tabs: { ...tabs },
  };
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`);
  return {
    ...payload,
    path: filePath,
  };
}

export async function recordOwnedTab({ runId, tabId, stateDir, meta = {}, now } = {}) {
  const normalizedTabId = normalizeTabId(tabId);
  const current = await readRunState({ runId, stateDir });
  const timestamp = now || new Date().toISOString();
  const tabs = {
    ...current.tabs,
    [String(normalizedTabId)]: {
      ...(current.tabs[String(normalizedTabId)] || {}),
      ...meta,
      tabId: normalizedTabId,
      recordedAt: current.tabs[String(normalizedTabId)]?.recordedAt || timestamp,
      updatedAt: timestamp,
    },
  };
  return writeRunState({
    runId: current.runId,
    stateDir,
    createdAt: current.createdAt || timestamp,
    ownedTabIds: [...current.ownedTabIds, normalizedTabId],
    tabs,
    now: timestamp,
  });
}

export async function removeOwnedTabs({ runId, tabIds = [], stateDir, now } = {}) {
  const current = await readRunState({ runId, stateDir });
  const removeIds = new Set(uniqueSortedTabIds(tabIds));
  const ownedTabIds = current.ownedTabIds.filter((tabId) => !removeIds.has(tabId));
  const tabs = Object.fromEntries(
    Object.entries(current.tabs).filter(([tabId]) => !removeIds.has(normalizeTabId(tabId))),
  );
  if (!ownedTabIds.length) {
    await fs.rm(current.path, { force: true });
    return {
      runId: current.runId,
      createdAt: current.createdAt,
      updatedAt: now || new Date().toISOString(),
      ownedTabIds: [],
      tabs: {},
      path: current.path,
    };
  }
  return writeRunState({
    runId: current.runId,
    stateDir,
    createdAt: current.createdAt,
    ownedTabIds,
    tabs,
    now,
  });
}
