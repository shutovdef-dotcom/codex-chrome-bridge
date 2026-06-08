import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const OUTPUT_CONTRACT_VERSION = 'metadata-first/v1';
export const DEFAULT_MAX_INLINE_CHARS = 4_000;
export const DEFAULT_ARTIFACT_DIR = path.join(os.tmpdir(), 'chrome-bridge-artifacts');
export const DEFAULT_ARTIFACT_INDEX_BASENAME = 'index.jsonl';

const JSON_READ_ACTIONS = new Set(['snapshot', 'traceEvents', 'traceStop']);

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return fallback;
  return parsed;
}

function generatedArtifactPath(action, extension, artifactDir = DEFAULT_ARTIFACT_DIR) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(artifactDir, `${timestamp}-${action}-${crypto.randomUUID()}.${extension}`);
}

export function artifactIndexPath(artifactDir = DEFAULT_ARTIFACT_DIR) {
  return path.join(artifactDir || DEFAULT_ARTIFACT_DIR, DEFAULT_ARTIFACT_INDEX_BASENAME);
}

function tabMeta(result = {}) {
  const tab = result.tab || {};
  return {
    tabId: tab.id ?? result.tabId ?? null,
    url: result.url || tab.url || null,
    title: result.title || tab.title || null,
  };
}

function countArray(value) {
  return Array.isArray(value) ? value.length : 0;
}

function snapshotCounts(result = {}) {
  return {
    headings: countArray(result.headings),
    elements: countArray(result.elements),
    tables: countArray(result.tables),
    jsonLd: countArray(result.jsonLd),
  };
}

function decodeDataUrl(dataUrl, expectedMediaType) {
  const match = /^data:([^;,]+);base64,(.+)$/.exec(String(dataUrl || ''));
  if (!match) throw new Error('Cannot build output envelope from an invalid data URL');
  if (expectedMediaType && match[1] !== expectedMediaType) {
    throw new Error(`Expected ${expectedMediaType} data URL, got ${match[1]}`);
  }
  return {
    mediaType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  };
}

function textPayload(action, result = {}) {
  if (action === 'text') {
    const content = String(result.text || '');
    return {
      content,
      contentType: 'text/plain',
      extension: 'txt',
      charCount: Number.isFinite(result.length) ? result.length : content.length,
      truncated: Boolean(result.truncated),
    };
  }

  if (action === 'html') {
    const content = String(result.html || '');
    return {
      content,
      contentType: 'text/html',
      extension: 'html',
      charCount: Number.isFinite(result.length) ? result.length : content.length,
      truncated: Boolean(result.truncated),
    };
  }

  if (action === 'snapshot' || JSON_READ_ACTIONS.has(action)) {
    const content = `${JSON.stringify(result, null, 2)}\n`;
    return {
      content,
      contentType: 'application/json',
      extension: 'json',
      charCount: Number.isFinite(result.textLength)
        ? result.textLength
        : String(result.text || '').length || content.length,
      truncated: Boolean(result.truncated),
    };
  }

  throw new Error(`Unsupported metadata-first output action: ${action}`);
}

function inlineContent(content, options = {}) {
  const maxInlineChars = positiveInteger(options.maxInlineChars, DEFAULT_MAX_INLINE_CHARS);
  const include = Boolean(options.includeContent) && !options.noContent && !options.summaryOnly;
  if (!include) {
    return {
      inline: {
        included: false,
        maxInlineChars,
        charCount: 0,
        truncated: false,
      },
    };
  }

  const value = content.slice(0, maxInlineChars);
  return {
    content: value,
    inline: {
      included: true,
      maxInlineChars,
      charCount: value.length,
      truncated: content.length > maxInlineChars,
    },
  };
}

function commonEnvelope({ action, result, options, now, contentType, artifactPath, buffer, charCount, truncated }) {
  const meta = tabMeta(result);
  const diagnostics = {
    requestedOut: options.out ? path.resolve(options.out) : null,
    artifactBytes: buffer.byteLength,
  };
  if (result.fullPageDiagnostics) diagnostics.fullPage = result.fullPageDiagnostics;
  if (result.sizeGuard) diagnostics.sizeGuard = result.sizeGuard;
  if (result.coverage) diagnostics.coverage = result.coverage;
  return {
    ok: true,
    outputContract: OUTPUT_CONTRACT_VERSION,
    action,
    contentType,
    generatedAt: now || new Date().toISOString(),
    ...meta,
    charCount,
    byteCount: buffer.byteLength,
    truncated,
    sourceTruncated: truncated,
    artifactPath,
    sha256: sha256(buffer),
    diagnostics,
  };
}

export async function recordArtifactIndex(envelope = {}, options = {}) {
  if (options.recordArtifact === false || !envelope.artifactPath) return null;
  const indexPath = artifactIndexPath(options.artifactDir || DEFAULT_ARTIFACT_DIR);
  const entry = {
    generatedAt: envelope.generatedAt,
    action: envelope.action,
    contentType: envelope.contentType,
    artifactPath: envelope.artifactPath,
    tabId: envelope.tabId,
    url: envelope.url,
    title: envelope.title,
    charCount: envelope.charCount,
    byteCount: envelope.byteCount,
    sha256: envelope.sha256,
  };
  await fs.mkdir(path.dirname(indexPath), { recursive: true });
  await fs.appendFile(indexPath, `${JSON.stringify(entry)}\n`);
  return { indexPath, entry };
}

export async function readArtifactIndex({ artifactDir = DEFAULT_ARTIFACT_DIR, limit = 100 } = {}) {
  const indexPath = artifactIndexPath(artifactDir);
  const text = await fs.readFile(indexPath, 'utf8').catch((error) => {
    if (error?.code === 'ENOENT') return '';
    throw error;
  });
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
    .filter(Boolean);
  return {
    ok: true,
    indexPath,
    count: entries.length,
    entries: entries.slice(Math.max(0, entries.length - limit)),
  };
}

export async function lastArtifact({ artifactDir = DEFAULT_ARTIFACT_DIR } = {}) {
  const index = await readArtifactIndex({ artifactDir, limit: 1 });
  const latest = index.entries[index.entries.length - 1] || null;
  return {
    ok: Boolean(latest),
    indexPath: index.indexPath,
    ...latest,
  };
}

export async function readArtifactPreview({
  artifactPath,
  head = 20,
  grep,
  maxMatches = 20,
} = {}) {
  if (!artifactPath) throw new Error('read-artifact requires --path <file>');
  const resolved = path.resolve(artifactPath);
  const buffer = await fs.readFile(resolved);
  const text = buffer.toString('utf8');
  const lines = text.replace(/\r/g, '').split('\n');
  const headCount = positiveInteger(head, 20);
  let matcher = null;
  if (grep) {
    matcher = new RegExp(String(grep), 'i');
  }
  const headLines = lines
    .slice(0, headCount)
    .map((line, index) => ({ line: index + 1, text: line }));
  const matches = matcher
    ? lines
      .map((line, index) => ({ line: index + 1, text: line }))
      .filter((entry) => matcher.test(entry.text))
      .slice(0, positiveInteger(maxMatches, 20))
    : [];
  return {
    ok: true,
    artifactPath: resolved,
    byteCount: buffer.byteLength,
    lineCount: lines.length,
    head: headLines,
    grep: grep || null,
    matches,
  };
}

export async function formatReadOutput({ action, result = {}, options = {}, now } = {}) {
  if (!action) throw new Error('formatReadOutput requires action');

  if (action === 'screenshot') {
    const { mediaType, buffer } = decodeDataUrl(result.dataUrl, 'image/png');
    const artifactPath = path.resolve(options.out || generatedArtifactPath(action, 'png', options.artifactDir));
    await fs.mkdir(path.dirname(artifactPath), { recursive: true });
    await fs.writeFile(artifactPath, buffer);
    const envelope = {
      ...commonEnvelope({
        action,
        result,
        options,
        now,
        contentType: mediaType,
        artifactPath,
        buffer,
        charCount: 0,
        truncated: false,
      }),
      fullPage: Boolean(result.fullPage),
      selector: result.selector || null,
      capturedAt: result.capturedAt || null,
      inline: {
        included: false,
        maxInlineChars: positiveInteger(options.maxInlineChars, DEFAULT_MAX_INLINE_CHARS),
        charCount: 0,
        truncated: false,
      },
    };
    await recordArtifactIndex(envelope, options);
    return envelope;
  }

  const payload = textPayload(action, result);
  const artifactPath = path.resolve(options.out || generatedArtifactPath(action, payload.extension, options.artifactDir));
  const buffer = Buffer.from(payload.content, 'utf8');
  await fs.mkdir(path.dirname(artifactPath), { recursive: true });
  await fs.writeFile(artifactPath, buffer);
  const inline = inlineContent(payload.content, options);
  const envelope = {
    ...commonEnvelope({
      action,
      result,
      options,
      now,
      contentType: payload.contentType,
      artifactPath,
      buffer,
      charCount: payload.charCount,
      truncated: payload.truncated,
    }),
    inline: inline.inline,
  };

  if (action === 'snapshot') {
    envelope.counts = snapshotCounts(result);
  }
  if (result.selector) envelope.selector = result.selector;
  if (inline.content !== undefined) envelope.content = inline.content;
  await recordArtifactIndex(envelope, options);
  return envelope;
}
