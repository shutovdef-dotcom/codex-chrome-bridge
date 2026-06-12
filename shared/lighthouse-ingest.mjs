import fs from 'node:fs/promises';
import path from 'node:path';

export const LIGHTHOUSE_INGEST_OUTPUT_CONTRACT_VERSION = 'lighthouse-ingest/v1';

const CATEGORY_NAMES = Object.freeze([
  'performance',
  'accessibility',
  'best-practices',
  'seo',
  'pwa',
]);

function scorePercent(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

function categoryScores(categories = {}) {
  return Object.fromEntries(CATEGORY_NAMES
    .map((name) => [name, scorePercent(categories[name]?.score)])
    .filter(([, value]) => value !== null));
}

function failingAudits(audits = {}, limit = 25) {
  return Object.values(audits)
    .filter((audit) => audit && typeof audit === 'object')
    .filter((audit) => typeof audit.score === 'number' && audit.score < 1)
    .map((audit) => ({
      id: audit.id || null,
      title: audit.title || null,
      score: scorePercent(audit.score),
      displayValue: audit.displayValue || null,
      numericValue: Number.isFinite(audit.numericValue) ? audit.numericValue : null,
    }))
    .sort((left, right) => (left.score ?? 101) - (right.score ?? 101))
    .slice(0, limit);
}

export function ingestLighthouseReport({ report, reportPath = null, maxAudits = 25 } = {}) {
  if (!report || typeof report !== 'object') {
    throw new Error('Lighthouse report must be a JSON object');
  }
  const audits = failingAudits(report.audits || {}, maxAudits);
  return {
    ok: true,
    outputContract: LIGHTHOUSE_INGEST_OUTPUT_CONTRACT_VERSION,
    lighthouseVersion: report.lighthouseVersion || null,
    url: report.finalDisplayedUrl || report.finalUrl || report.requestedUrl || null,
    requestedUrl: report.requestedUrl || null,
    fetchTime: report.fetchTime || null,
    scores: categoryScores(report.categories || {}),
    failingAuditCount: audits.length,
    failingAudits: audits,
    reportPath: reportPath ? path.resolve(reportPath) : null,
    privacy: {
      rawReportInStdout: false,
      note: 'Summary omits bulky audit payloads and keeps the raw Lighthouse report at reportPath.',
    },
  };
}

export async function ingestLighthouseReportFile({ reportPath, out, maxAudits = 25 } = {}) {
  if (!reportPath) throw new Error('lighthouse-ingest requires --report <file>');
  const resolvedReportPath = path.resolve(reportPath);
  let report;
  try {
    report = JSON.parse(await fs.readFile(resolvedReportPath, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid Lighthouse JSON report: ${error?.message || error}`);
  }
  const summary = ingestLighthouseReport({
    report,
    reportPath: resolvedReportPath,
    maxAudits,
  });

  if (!out) return summary;
  const artifactPath = path.resolve(out);
  await fs.mkdir(path.dirname(artifactPath), { recursive: true });
  await fs.writeFile(artifactPath, `${JSON.stringify(summary, null, 2)}\n`);
  return {
    ...summary,
    artifactPath,
  };
}
