import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { stripUnsafeObjectKeys } from './safe-record.mjs';

export const DEFAULT_ACT_PREVIEW_STATE_DIR = path.join(os.tmpdir(), 'chrome-bridge-act-previews');
export const DEFAULT_ACT_PREVIEW_TTL_MS = 10 * 60 * 1000;

function effectiveStateDir(stateDir) {
  return path.resolve(stateDir || process.env.CHROME_BRIDGE_ACT_PREVIEW_STATE_DIR || DEFAULT_ACT_PREVIEW_STATE_DIR);
}

function normalizePreviewActionId(previewActionId) {
  const value = String(previewActionId || '').trim();
  if (!/^actp-[A-Za-z0-9._:-]{8,160}$/.test(value)) {
    throw new Error('previewId must be a previously issued act-preview action id');
  }
  return value;
}

function previewActionPath({ previewActionId, stateDir } = {}) {
  return path.join(effectiveStateDir(stateDir), `${normalizePreviewActionId(previewActionId)}.json`);
}

function corruptStatePath(filePath) {
  return `${filePath}.corrupt.${Date.now().toString(36)}`;
}

function safeObject(value) {
  return stripUnsafeObjectKeys(value && typeof value === 'object' && !Array.isArray(value) ? value : {});
}

export function createPreviewActionId(prefix = 'actp') {
  return `${String(prefix || 'actp').replace(/[^A-Za-z0-9._:-]/g, '-').slice(0, 16) || 'actp'}-${Date.now().toString(36)}-${crypto.randomUUID()}`;
}

export async function writePreviewAction({
  previewActionId,
  stateDir,
  action = {},
  page = {},
  intent = '',
  createdAt = new Date().toISOString(),
  ttlMs = DEFAULT_ACT_PREVIEW_TTL_MS,
} = {}) {
  const normalizedId = normalizePreviewActionId(previewActionId);
  const filePath = previewActionPath({ previewActionId: normalizedId, stateDir });
  const expiresAt = new Date(Date.parse(createdAt) + Math.max(1_000, Number(ttlMs || DEFAULT_ACT_PREVIEW_TTL_MS))).toISOString();
  const payload = {
    previewActionId: normalizedId,
    createdAt,
    expiresAt,
    ttlMs: Math.max(1_000, Number(ttlMs || DEFAULT_ACT_PREVIEW_TTL_MS)),
    intent: String(intent || ''),
    page: safeObject(page),
    action: safeObject(action),
    usedAt: null,
  };
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`);
  return {
    ...payload,
    path: filePath,
  };
}

export async function readPreviewAction({ previewActionId, stateDir } = {}) {
  const normalizedId = normalizePreviewActionId(previewActionId);
  const filePath = previewActionPath({ previewActionId: normalizedId, stateDir });
  let text;
  try {
    text = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const corruptPath = corruptStatePath(filePath);
    await fs.rename(filePath, corruptPath).catch(() => {});
    throw new Error(`Preview state is corrupted: ${String(error?.message || error)} (${corruptPath})`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    const corruptPath = corruptStatePath(filePath);
    await fs.rename(filePath, corruptPath).catch(() => {});
    throw new Error(`Preview state is corrupted: preview JSON must be an object (${corruptPath})`);
  }

  return {
    previewActionId: normalizedId,
    createdAt: parsed.createdAt || null,
    expiresAt: parsed.expiresAt || null,
    ttlMs: Number(parsed.ttlMs || DEFAULT_ACT_PREVIEW_TTL_MS),
    intent: String(parsed.intent || ''),
    page: safeObject(parsed.page),
    action: safeObject(parsed.action),
    usedAt: parsed.usedAt || null,
    path: filePath,
  };
}

export async function markPreviewActionUsed({ previewActionId, stateDir, usedAt = new Date().toISOString(), result = {} } = {}) {
  const current = await readPreviewAction({ previewActionId, stateDir });
  if (!current) throw new Error('Preview action not found');
  const payload = {
    ...current,
    result: safeObject(result),
    usedAt,
  };
  await fs.writeFile(current.path, `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

export function previewActionIsExpired(record, now = new Date()) {
  const expiresAt = Date.parse(record?.expiresAt || '');
  return !Number.isFinite(expiresAt) || now.getTime() > expiresAt;
}
