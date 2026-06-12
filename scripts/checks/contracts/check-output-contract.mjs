#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_MAX_INLINE_CHARS,
  formatReadOutput,
} from '../../../shared/output-envelope.mjs';

import { readCliSource } from '../lib/cli-source.mjs';

import { readMcpSource } from '../lib/mcp-source.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function readText(filePath) {
  return fs.readFile(filePath, 'utf8');
}

async function checkTextEnvelope(tmpDir) {
  const text = 'x'.repeat(200_000);
  const out = path.join(tmpDir, 'large-page.txt');
  const envelope = await formatReadOutput({
    action: 'text',
    result: {
      tab: { id: 123, url: 'https://example.test/large', title: 'Large page' },
      url: 'https://example.test/large',
      title: 'Large page',
      text,
      length: text.length,
      truncated: false,
    },
    options: { out },
    now: '2026-06-08T00:00:00.000Z',
  });

  check(envelope.outputContract === 'metadata-first/v1', 'text envelope must expose metadata-first/v1 contract');
  check(envelope.action === 'text', 'text envelope must report action');
  check(envelope.tabId === 123, 'text envelope must expose tabId');
  check(envelope.url === 'https://example.test/large', 'text envelope must expose url');
  check(envelope.title === 'Large page', 'text envelope must expose title');
  check(envelope.charCount === 200_000, 'text envelope must expose full charCount');
  check(envelope.truncated === false, 'text envelope must preserve source truncation flag');
  check(envelope.artifactPath === out, 'text envelope must use requested artifact path');
  check(envelope.sha256 === sha256(text), 'text envelope must expose artifact sha256');
  check(!Object.prototype.hasOwnProperty.call(envelope, 'text'), 'text envelope must not include legacy text by default');
  check(!Object.prototype.hasOwnProperty.call(envelope, 'content'), 'text envelope must not include inline content by default');
  check(JSON.stringify(envelope).length < 12_000, 'text envelope default stdout JSON must stay under 12k chars');
  check(await readText(out) === text, 'text artifact must contain the full payload');
}

async function checkInlineCaps(tmpDir) {
  const text = '0123456789'.repeat(20);
  const envelope = await formatReadOutput({
    action: 'text',
    result: {
      tab: { id: 124, url: 'https://example.test/inline', title: 'Inline page' },
      text,
      length: text.length,
      truncated: false,
    },
    options: {
      out: path.join(tmpDir, 'inline.txt'),
      includeContent: true,
      maxInlineChars: 25,
    },
    now: '2026-06-08T00:00:00.000Z',
  });

  check(envelope.inline?.included === true, 'includeContent must enable inline metadata');
  check(envelope.inline?.maxInlineChars === 25, 'inline envelope must report maxInlineChars');
  check(envelope.inline?.truncated === true, 'inline envelope must report truncation when capped');
  check(envelope.content === text.slice(0, 25), 'inline content must be capped by maxInlineChars');
  check(DEFAULT_MAX_INLINE_CHARS <= 12_000, 'default inline cap must stay token-budget friendly');

  const noContent = await formatReadOutput({
    action: 'text',
    result: {
      tab: { id: 125, url: 'https://example.test/no-content', title: 'No content page' },
      text,
      length: text.length,
      truncated: false,
    },
    options: {
      out: path.join(tmpDir, 'no-content.txt'),
      includeContent: true,
      noContent: true,
    },
    now: '2026-06-08T00:00:00.000Z',
  });

  check(noContent.inline?.included === false, '--no-content must suppress inline content');
  check(!Object.prototype.hasOwnProperty.call(noContent, 'content'), '--no-content must omit content');
}

async function checkSnapshotEnvelope(tmpDir) {
  const result = {
    tab: { id: 126, url: 'https://example.test/snapshot', title: 'Snapshot page' },
    url: 'https://example.test/snapshot',
    title: 'Snapshot page',
    headings: [{ level: 'h1', text: 'Snapshot page' }],
    elements: [{ selector: '#cta', text: 'CTA' }],
    tables: [[['A', 'B']]],
    jsonLd: ['{"name":"Snapshot"}'],
    text: 'Snapshot page\nCTA',
    textLength: 17,
    truncated: false,
  };
  const out = path.join(tmpDir, 'snapshot.json');
  const envelope = await formatReadOutput({
    action: 'snapshot',
    result,
    options: { out, summaryOnly: true },
    now: '2026-06-08T00:00:00.000Z',
  });

  check(envelope.contentType === 'application/json', 'snapshot envelope must use JSON content type');
  check(envelope.counts?.headings === 1, 'snapshot envelope must expose heading count');
  check(envelope.counts?.elements === 1, 'snapshot envelope must expose element count');
  check(envelope.counts?.tables === 1, 'snapshot envelope must expose table count');
  check(envelope.counts?.jsonLd === 1, 'snapshot envelope must expose JSON-LD count');
  check(!Object.prototype.hasOwnProperty.call(envelope, 'content'), 'summaryOnly snapshot must omit inline content');
  check(JSON.parse(await readText(out)).text === result.text, 'snapshot artifact must contain full snapshot JSON');
}

async function checkScreenshotEnvelope(tmpDir) {
  const pngBytes = Buffer.from('fake-png');
  const dataUrl = `data:image/png;base64,${pngBytes.toString('base64')}`;
  const out = path.join(tmpDir, 'screenshot.png');
  const envelope = await formatReadOutput({
    action: 'screenshot',
    result: {
      tab: { id: 127, url: 'https://example.test/screenshot', title: 'Screenshot page' },
      dataUrl,
      fullPage: true,
      capturedAt: '2026-06-08T00:00:00.000Z',
    },
    options: { out },
    now: '2026-06-08T00:00:00.000Z',
  });

  check(envelope.contentType === 'image/png', 'screenshot envelope must report image/png');
  check(envelope.artifactPath === out, 'screenshot envelope must expose artifact path');
  check(envelope.byteCount === pngBytes.length, 'screenshot envelope must expose byte count');
  check(envelope.sha256 === sha256(pngBytes), 'screenshot envelope must expose binary sha256');
  check(!Object.prototype.hasOwnProperty.call(envelope, 'dataUrl'), 'screenshot envelope must not include dataUrl');
  check(Buffer.compare(await fs.readFile(out), pngBytes) === 0, 'screenshot artifact must contain PNG bytes');
}

async function checkSurface() {
  const [cliText, mcpText, packageText] = await Promise.all([
    readCliSource(rootDir),
    readMcpSource(rootDir),
    fs.readFile(path.join(rootDir, 'package.json'), 'utf8'),
  ]);
  const packageJson = JSON.parse(packageText);

  for (const flag of ['summary-only', 'max-inline-chars', 'no-content', 'include-content']) {
    check(cliText.includes(flag), `CLI must parse --${flag}`);
  }
  for (const field of ['summaryOnly', 'maxInlineChars', 'noContent', 'includeContent']) {
    check(mcpText.includes(field), `MCP read tools must expose ${field}`);
  }
  check(packageJson.scripts?.['check:output-contract'] === 'node ./scripts/checks/contracts/check-output-contract.mjs', 'package.json must expose check:output-contract');
  check(packageJson.scripts?.check?.includes('npm run check:output-contract'), 'npm run check must include check:output-contract');
}

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chrome-bridge-output-contract-check-'));
try {
  await checkTextEnvelope(tmpDir);
  await checkInlineCaps(tmpDir);
  await checkSnapshotEnvelope(tmpDir);
  await checkScreenshotEnvelope(tmpDir);
  await checkSurface();
} finally {
  await fs.rm(tmpDir, { recursive: true, force: true });
}

if (failures.length) {
  process.stdout.write(`${JSON.stringify({ ok: false, failures }, null, 2)}\n`);
  process.exit(1);
}

process.stdout.write(`${JSON.stringify({ ok: true }, null, 2)}\n`);
