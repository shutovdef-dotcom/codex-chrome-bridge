import fs from 'node:fs/promises';
import path from 'node:path';
import { COMMAND_METADATA } from './command-registry.mjs';

export const ACTION_RECORDING_CONTRACT_VERSION = 'action-recording/v1';

const SENSITIVE_PAYLOAD_KEYS = new Set([
  'body',
  'headers',
  'text',
  'fields',
  'file',
  'files',
  'promptText',
  'choices',
  'question',
]);

function recordingPath(explicitPath = process.env.CHROME_BRIDGE_RECORDING_PATH) {
  const value = typeof explicitPath === 'string' ? explicitPath.trim() : '';
  return value ? path.resolve(value) : null;
}

function compactPayload(payload = {}) {
  const result = {};
  for (const [key, value] of Object.entries(payload || {})) {
    if (SENSITIVE_PAYLOAD_KEYS.has(key)) {
      result[key] = { redacted: true, type: Array.isArray(value) ? 'array' : typeof value };
    } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
      result[key] = value;
    }
  }
  return result;
}

function resultSummary(result = {}) {
  const tab = result?.tab || {};
  return {
    resultKeys: result && typeof result === 'object' ? Object.keys(result).slice(0, 40) : [],
    tabId: tab.id ?? result?.tabId ?? null,
    hasArtifactPath: typeof result?.artifactPath === 'string',
    artifactPath: typeof result?.artifactPath === 'string' ? result.artifactPath : null,
  };
}

export async function appendActionRecording({
  action,
  payload = {},
  timeoutMs = null,
  ok = true,
  result = null,
  error = null,
  path: explicitPath,
} = {}) {
  const targetPath = recordingPath(explicitPath);
  if (!targetPath || !action) return { recorded: false };
  const entry = {
    contract: ACTION_RECORDING_CONTRACT_VERSION,
    generatedAt: new Date().toISOString(),
    action,
    cli: COMMAND_METADATA[action]?.cli?.[0] || null,
    mcp: COMMAND_METADATA[action]?.mcp?.[0] || null,
    timeoutMs,
    ok: Boolean(ok),
    payload: compactPayload(payload),
    result: ok ? resultSummary(result) : null,
    error: ok ? null : String(error?.message || error || 'unknown error').slice(0, 500),
  };
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.appendFile(targetPath, `${JSON.stringify(entry)}\n`);
  return { recorded: true, recordingPath: targetPath, entry };
}

export async function readActionRecording({ path: explicitPath, limit = 500 } = {}) {
  const targetPath = recordingPath(explicitPath);
  if (!targetPath) throw new Error('recording path is required');
  const text = await fs.readFile(targetPath, 'utf8');
  const entries = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((entry) => entry?.contract === ACTION_RECORDING_CONTRACT_VERSION);
  return {
    ok: true,
    recordingPath: targetPath,
    count: entries.length,
    entries: entries.slice(Math.max(0, entries.length - Math.max(1, Number(limit || 500)))),
  };
}

export function buildReplayLitePlan(entries = []) {
  return entries.map((entry, index) => ({
    index: index + 1,
    action: entry.action,
    cli: entry.cli ? `chrome-bridge ${entry.cli}` : null,
    mcp: entry.mcp || null,
    ok: Boolean(entry.ok),
    requiresHumanReview: true,
    payload: entry.payload || {},
    note: 'Replay-lite is a human-reviewed checklist; it does not auto-execute recorded browser actions.',
  }));
}

export async function summarizeActionRecording({ path: explicitPath, limit = 500 } = {}) {
  const recording = await readActionRecording({ path: explicitPath, limit });
  const byAction = {};
  for (const entry of recording.entries) {
    byAction[entry.action] = (byAction[entry.action] || 0) + 1;
  }
  return {
    ok: true,
    contract: ACTION_RECORDING_CONTRACT_VERSION,
    recordingPath: recording.recordingPath,
    count: recording.count,
    byAction,
    replayLite: {
      autoExecute: false,
      requiresHumanReview: true,
      steps: buildReplayLitePlan(recording.entries),
    },
  };
}
