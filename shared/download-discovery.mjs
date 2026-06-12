import fs from 'node:fs/promises';
import path from 'node:path';
import { formatReadOutput } from './output-envelope.mjs';

export const DOWNLOAD_DISCOVERY_OUTPUT_CONTRACT_VERSION = 'download-discovery/v1';

const FILE_EXTENSION_PATTERN = /\.(pdf|csv|xlsx?|docx?|zip|rar|7z|json|xml|png|jpe?g|webp)(?:[?#].*)?$/i;
const DOWNLOAD_LABEL_PATTERN = /\b(download|export|offline|save|print|pdf|csv|xlsx?|spreadsheet|report|archive|backup)\b/i;

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function clip(value, maxChars = 300) {
  return clean(value).slice(0, maxChars);
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripTags(value) {
  return decodeHtml(String(value || '').replace(/<[^>]+>/g, ' '));
}

function htmlAttribute(source, name) {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i');
  return decodeHtml(pattern.exec(source || '')?.[2] || '');
}

function hasBooleanOrValuedAttribute(source, name) {
  const pattern = new RegExp(`(?:^|\\s)${name}\\b(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s"'>]+))?`, 'i');
  return pattern.test(source || '');
}

function normalizeUrl(value, baseUrl) {
  const raw = decodeHtml(value).trim();
  if (!raw) return null;
  try {
    return new URL(raw, baseUrl || undefined).href;
  } catch {
    return null;
  }
}

function fileTypeFor(href = '') {
  const match = FILE_EXTENSION_PATTERN.exec(href);
  return match ? match[1].replace(/^jpeg$/i, 'jpg').toLowerCase() : null;
}

function fileTypeForMime(type = '') {
  const value = String(type || '').toLowerCase();
  if (value.includes('csv')) return 'csv';
  if (value.includes('spreadsheet') || value.includes('excel') || value.includes('xlsx')) return 'xlsx';
  if (value.includes('pdf')) return 'pdf';
  if (value.includes('json')) return 'json';
  if (value.includes('xml')) return 'xml';
  if (value.includes('zip')) return 'zip';
  return null;
}

function fileTypeForLabel(label = '') {
  const value = String(label || '').toLowerCase();
  if (/\bcsv\b/.test(value)) return 'csv';
  if (/\bxlsx?\b|spreadsheet/.test(value)) return 'xlsx';
  if (/\bpdf\b/.test(value)) return 'pdf';
  if (/\bjson\b/.test(value)) return 'json';
  if (/\bxml\b/.test(value)) return 'xml';
  return null;
}

function fileNameFor(href = '') {
  try {
    const parsed = new URL(href);
    const name = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || '');
    return name || null;
  } catch {
    return null;
  }
}

function anchorCandidates(html, sourceUrl) {
  const candidates = [];
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  for (const match of String(html || '').matchAll(anchorPattern)) {
    const href = normalizeUrl(htmlAttribute(match[1], 'href'), sourceUrl);
    if (!href || !/^https?:\/\//i.test(href)) continue;
    const label = clip(stripTags(match[2]), 300);
    const fileType = fileTypeFor(href) || fileTypeForMime(htmlAttribute(match[1], 'type')) || fileTypeForLabel(label);
    const hasDownloadAttr = hasBooleanOrValuedAttribute(match[1], 'download');
    const labelMatches = DOWNLOAD_LABEL_PATTERN.test(label);
    if (!fileType && !hasDownloadAttr && !labelMatches) continue;
    candidates.push({
      kind: hasDownloadAttr ? 'download-attribute' : (fileType ? 'file-link' : 'labeled-link'),
      href,
      label,
      fileName: fileNameFor(href),
      fileType,
      confidence: fileType || hasDownloadAttr ? 'high' : 'medium',
    });
  }
  return candidates;
}

function actionCandidates(html) {
  const candidates = [];
  const buttonPattern = /<(button|a|input)\b([^>]*)>([\s\S]*?)<\/\1>|<input\b([^>]*?)>/gi;
  for (const match of String(html || '').matchAll(buttonPattern)) {
    const tag = (match[1] || 'input').toLowerCase();
    const attrs = match[2] || match[4] || '';
    const label = clip(stripTags(match[3] || '') || htmlAttribute(attrs, 'value') || htmlAttribute(attrs, 'aria-label'), 200);
    if (!label || !DOWNLOAD_LABEL_PATTERN.test(label)) continue;
    const selectorHint = htmlAttribute(attrs, 'id')
      ? `#${htmlAttribute(attrs, 'id')}`
      : (htmlAttribute(attrs, 'data-testid') ? `[data-testid="${htmlAttribute(attrs, 'data-testid')}"]` : tag);
    candidates.push({
      kind: 'page-action',
      label,
      tag,
      selectorHint,
      confidence: /\b(download|export|pdf|csv|xlsx?)\b/i.test(label) ? 'medium' : 'low',
    });
  }
  return candidates.slice(0, 50);
}

function textHints(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => clip(line, 240))
    .filter((line) => DOWNLOAD_LABEL_PATTERN.test(line))
    .slice(0, 50)
    .map((line) => ({ kind: 'text-hint', label: line, confidence: 'low' }));
}

function uniqueBy(values, keyFn) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const key = keyFn(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
}

function countsFor(discovery) {
  return {
    downloadCandidates: discovery.downloadCandidates.length,
    exportActionCandidates: discovery.exportActionCandidates.length,
    textHints: discovery.textHints.length,
  };
}

function envelopeSummary(envelope) {
  return {
    artifactPath: envelope.artifactPath,
    charCount: envelope.charCount,
    byteCount: envelope.byteCount,
    truncated: envelope.truncated,
    sha256: envelope.sha256,
  };
}

export function discoverDownloads({
  html = '',
  text = '',
  sourceUrl = '',
  title = '',
  rawHtmlArtifactPath = null,
} = {}) {
  const downloadCandidates = uniqueBy(anchorCandidates(html, sourceUrl), (item) => item.href)
    .slice(0, 100);
  const exportActionCandidates = uniqueBy(actionCandidates(html), (item) => `${item.tag}:${item.label}:${item.selectorHint}`)
    .slice(0, 50);
  const hints = textHints(text);
  return {
    ok: true,
    outputContract: DOWNLOAD_DISCOVERY_OUTPUT_CONTRACT_VERSION,
    source: {
      url: sourceUrl || null,
      title: title || null,
    },
    downloadCandidates,
    exportActionCandidates,
    textHints: hints,
    rawHtmlArtifactPath,
    counts: {
      downloadCandidates: downloadCandidates.length,
      exportActionCandidates: exportActionCandidates.length,
      textHints: hints.length,
    },
    safety: {
      clicked: false,
      fetchedCandidateUrls: false,
      note: 'Discovery only inspects page HTML/text; it does not click, download, or fetch candidate URLs.',
    },
  };
}

export async function buildDownloadDiscovery({
  bridgeCommand,
  target = {},
  options = {},
} = {}) {
  if (typeof bridgeCommand !== 'function') throw new Error('buildDownloadDiscovery requires bridgeCommand');
  if (!options.out) throw new Error('download-discovery requires --out <file>');

  const htmlResult = await bridgeCommand('html', {
    ...target,
    selector: options.selector,
    maxChars: options.maxHtmlChars ?? 500_000,
    outer: true,
  }, options.htmlTimeoutMs ?? 30_000);

  const htmlEnvelope = await formatReadOutput({
    action: 'html',
    result: htmlResult,
    options: {
      artifactDir: options.artifactDir,
      out: options.rawHtmlOut,
      summaryOnly: true,
    },
  });

  const discovery = discoverDownloads({
    html: htmlResult.html || '',
    text: htmlResult.text || '',
    sourceUrl: htmlResult.url || htmlResult.tab?.url || '',
    title: htmlResult.title || htmlResult.tab?.title || '',
    rawHtmlArtifactPath: htmlEnvelope.artifactPath,
  });

  const artifactPath = path.resolve(options.out);
  await fs.mkdir(path.dirname(artifactPath), { recursive: true });
  await fs.writeFile(artifactPath, `${JSON.stringify(discovery, null, 2)}\n`);

  return {
    ok: true,
    outputContract: DOWNLOAD_DISCOVERY_OUTPUT_CONTRACT_VERSION,
    artifactPath,
    rawHtmlArtifactPath: discovery.rawHtmlArtifactPath,
    counts: countsFor(discovery),
    topCandidates: discovery.downloadCandidates.slice(0, 20),
    topActions: discovery.exportActionCandidates.slice(0, 20),
    diagnostics: {
      html: envelopeSummary(htmlEnvelope),
    },
    safety: discovery.safety,
  };
}
