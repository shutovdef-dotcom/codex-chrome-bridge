import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const PAGE_SEARCH_CONTRACT_VERSION = 'page-search/v1';

const DEFAULT_ARTIFACT_DIR = path.join(os.tmpdir(), 'chrome-bridge-artifacts');

const QUERY_EXPANSIONS = Object.freeze({
  download: ['export', 'save', 'file', 'csv', 'xlsx', 'pdf', 'spreadsheet', 'report'],
  export: ['download', 'save', 'file', 'csv', 'xlsx', 'spreadsheet', 'report'],
  spreadsheet: ['csv', 'xlsx', 'excel', 'sheet', 'table', 'export', 'download'],
  report: ['dashboard', 'analytics', 'export', 'download', 'summary'],
  billing: ['invoice', 'payment', 'account', 'address', 'subscription'],
  login: ['sign in', 'signin', 'auth', 'authentication', 'account'],
  error: ['failure', 'failed', 'warning', 'exception', 'issue'],
});

function clean(value = '') {
  return String(value || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function words(value = '') {
  return clean(value).toLowerCase().match(/[\p{L}\p{N}_-]+/gu) || [];
}

function expandedTerms(query) {
  const terms = new Set(words(query));
  for (const term of [...terms]) {
    for (const expanded of QUERY_EXPANSIONS[term] || []) {
      for (const token of words(expanded)) terms.add(token);
    }
  }
  return [...terms].filter((term) => term.length > 1);
}

function chunksForText(text = '', chunkLines = 4) {
  const lines = clean(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const chunks = [];
  const step = Math.max(1, Math.floor(chunkLines / 2));
  for (let start = 0; start < lines.length; start += step) {
    const selected = lines.slice(start, start + chunkLines);
    if (!selected.length) continue;
    chunks.push({
      startLine: start + 1,
      endLine: start + selected.length,
      text: selected.join(' '),
    });
  }
  return chunks;
}

function scoreChunk(chunkText, query, terms) {
  const haystack = clean(chunkText).toLowerCase();
  const queryText = clean(query).toLowerCase();
  let score = 0;
  if (queryText && haystack.includes(queryText)) score += 20;
  for (const term of terms) {
    if (haystack.includes(term)) score += 3;
  }
  for (let index = 0; index < terms.length - 1; index += 1) {
    if (haystack.includes(`${terms[index]} ${terms[index + 1]}`)) score += 5;
  }
  return score;
}

function clipSnippet(value, maxChars) {
  const text = clean(value);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
}

function generatedPath(artifactDir = DEFAULT_ARTIFACT_DIR) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(artifactDir || DEFAULT_ARTIFACT_DIR, `${timestamp}-page-search.json`);
}

export async function buildPageSearch({
  query,
  text,
  source = {},
  rawArtifactPath = null,
  out,
  artifactDir,
  maxMatches = 8,
  maxSnippetChars = 320,
  chunkLines = 1,
} = {}) {
  const normalizedQuery = clean(query);
  if (!normalizedQuery) throw new Error('page-search requires query');
  const terms = expandedTerms(normalizedQuery);
  const chunks = chunksForText(text, Math.min(Math.max(Number(chunkLines || 1), 1), 20));
  const limit = Math.min(Math.max(Number(maxMatches || 8), 1), 50);
  const snippetLimit = Math.min(Math.max(Number(maxSnippetChars || 320), 80), 2_000);
  const matches = chunks
    .map((chunk) => ({
      ...chunk,
      score: scoreChunk(chunk.text, normalizedQuery, terms),
    }))
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score || a.startLine - b.startLine)
    .slice(0, limit)
    .map((chunk, index) => ({
      rank: index + 1,
      score: chunk.score,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      snippet: clipSnippet(chunk.text, snippetLimit),
    }));

  const artifact = {
    contract: PAGE_SEARCH_CONTRACT_VERSION,
    generatedAt: new Date().toISOString(),
    query: normalizedQuery,
    terms,
    source: {
      url: source.url || null,
      title: source.title || null,
      tabId: source.tabId ?? null,
    },
    rawArtifactPath,
    totalChunks: chunks.length,
    matchCount: matches.length,
    matches,
  };
  const artifactPath = path.resolve(out || generatedPath(artifactDir));
  await fs.mkdir(path.dirname(artifactPath), { recursive: true });
  await fs.writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);

  return {
    ok: true,
    contract: PAGE_SEARCH_CONTRACT_VERSION,
    action: 'page-search',
    query: normalizedQuery,
    artifactPath,
    rawArtifactPath,
    totalChunks: chunks.length,
    matchCount: matches.length,
    matches,
    source: artifact.source,
  };
}
