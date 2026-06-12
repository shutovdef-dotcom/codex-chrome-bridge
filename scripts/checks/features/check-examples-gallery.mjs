#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractStructuredPreset } from '../../../shared/structured-extract.mjs';
import { discoverDownloads } from '../../../shared/download-discovery.mjs';
import { ingestLighthouseReport } from '../../../shared/lighthouse-ingest.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

async function readRequired(relativePath) {
  try {
    return await fs.readFile(path.join(rootDir, relativePath), 'utf8');
  } catch (error) {
    failures.push(`missing required examples gallery file: ${relativePath}`);
    return null;
  }
}

function visibleText(html) {
  return String(html || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/?(?:h[1-6]|p|li|tr|td|th|article|section|main|div|ul|ol)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function sourceUrl(name) {
  return `https://example.test/chrome-bridge/examples/${name}`;
}

function checkDocs(doc) {
  if (!doc) return;
  for (const required of [
    '# Chrome Bridge Examples Gallery',
    'metadata-first',
    'extract --preset article',
    'extract --preset product-page',
    'extract --preset pricing-table',
    'download-discovery',
    'lighthouse-ingest',
    '--out',
    '--artifact-dir',
    'does not click',
  ]) {
    check(doc.includes(required), `docs/EXAMPLES.md must mention ${required}`);
  }
}

function checkArticleFixture(html) {
  if (!html) return;
  const result = extractStructuredPreset({
    preset: 'article',
    html,
    text: visibleText(html),
    sourceUrl: sourceUrl('article-news'),
    title: '',
    rawArtifactPath: '/tmp/article.txt',
    rawHtmlArtifactPath: '/tmp/article.html',
  });
  check(result.data?.title === 'Bridge Agents Need Smaller Browser Outputs', 'article fixture must extract JSON-LD headline');
  check(result.data?.byline === 'Ada Metrics', 'article fixture must extract JSON-LD author');
  check(result.data?.publishedDate === '2026-06-12', 'article fixture must extract JSON-LD datePublished');
  check(result.data?.summary?.length >= 1, 'article fixture must preserve a bounded summary');
  check(!JSON.stringify(result).includes('<script'), 'article extraction must not inline raw fixture HTML');
}

function checkProductFixture(html) {
  if (!html) return;
  const result = extractStructuredPreset({
    preset: 'product-page',
    html,
    text: visibleText(html),
    sourceUrl: sourceUrl('product-page'),
    title: '',
    rawArtifactPath: '/tmp/product.txt',
    rawHtmlArtifactPath: '/tmp/product.html',
  });
  check(result.data?.title === 'Acme Export Kit', 'product fixture must extract JSON-LD product name');
  check(result.data?.sku === 'EXPORT-KIT-42', 'product fixture must extract JSON-LD SKU');
  check(result.data?.availability === 'InStock', 'product fixture must normalize JSON-LD availability');
  check(result.data?.priceHints?.includes('USD 149.00'), 'product fixture must expose JSON-LD offer price');
}

function checkPricingFixture(html) {
  if (!html) return;
  const result = extractStructuredPreset({
    preset: 'pricing-table',
    html,
    text: visibleText(html),
    sourceUrl: sourceUrl('pricing-table'),
    title: '',
    rawArtifactPath: '/tmp/pricing.txt',
    rawHtmlArtifactPath: '/tmp/pricing.html',
  });
  check(result.data?.plans?.length === 3, 'pricing fixture must extract three pricing cards');
  check(result.data?.plans?.some((plan) => plan.name === 'Growth' && plan.price === '$79/mo'), 'pricing fixture must extract Growth card price');
  check(result.data?.plans?.some((plan) => plan.name === 'Enterprise' && plan.features?.includes('Audit logs')), 'pricing fixture must extract card features');
}

function checkLinearPricingFixture(html) {
  if (!html) return;
  const result = extractStructuredPreset({
    preset: 'pricing-table',
    html,
    text: visibleText(html),
    sourceUrl: sourceUrl('pricing-linear'),
    title: '',
    rawArtifactPath: '/tmp/pricing-linear.txt',
    rawHtmlArtifactPath: '/tmp/pricing-linear.html',
  });
  check(result.data?.plans?.length === 5, 'linear pricing fixture must extract five text-only plans');
  check(result.data?.plans?.some((plan) => plan.name === 'Prototyping' && plan.price === '$25/month'), 'linear pricing fixture must combine split monthly price');
  check(result.data?.plans?.some((plan) => plan.name === 'Enterprise' && /^Custom pricing/.test(plan.price)), 'linear pricing fixture must preserve custom enterprise pricing');
  check(result.data?.plans?.some((plan) => plan.name === 'Starter' && plan.features?.includes('180k units per month')), 'linear pricing fixture must collect text-only plan features');
}

function checkDownloadsFixture(html) {
  if (!html) return;
  const result = discoverDownloads({
    html,
    text: visibleText(html),
    sourceUrl: sourceUrl('downloads'),
    title: 'Download Center',
  });
  check(result.downloadCandidates?.some((item) => item.fileType === 'csv' && item.href.endsWith('/exports/monthly')), 'download fixture must infer CSV type from type/label');
  check(result.downloadCandidates?.some((item) => item.fileType === 'pdf'), 'download fixture must keep explicit PDF file links');
  check(result.exportActionCandidates?.some((item) => item.selectorHint === '[data-testid="export-xlsx"]'), 'download fixture must expose stable export action selector hints');
  check(result.safety?.clicked === false && result.safety?.fetchedCandidateUrls === false, 'download fixture must remain discovery-only');
}

function checkLighthouseFixture(reportText) {
  if (!reportText) return;
  let report;
  try {
    report = JSON.parse(reportText);
  } catch (error) {
    failures.push(`examples/fixtures/lighthouse-report.json must be valid JSON: ${error?.message || error}`);
    return;
  }
  const result = ingestLighthouseReport({
    report,
    reportPath: '/tmp/lighthouse-report.json',
    maxAudits: 3,
  });
  check(result.scores?.performance === 91, 'Lighthouse fixture must expose performance score as percent');
  check(result.failingAudits?.[0]?.id === 'unused-javascript', 'Lighthouse fixture must sort failing audits by lowest score');
  check(result.privacy?.rawReportInStdout === false, 'Lighthouse fixture must keep raw report out of stdout');
}

function checkPackageJson(packageText) {
  if (!packageText) return;
  const packageJson = JSON.parse(packageText);
  check(packageJson.files?.includes('examples/'), 'package.json files must include examples/');
  check(packageJson.scripts?.['check:examples-gallery'] === 'node ./scripts/checks/features/check-examples-gallery.mjs', 'package.json must expose check:examples-gallery');
  check(packageJson.scripts?.check?.includes('npm run check:examples-gallery'), 'npm run check must include check:examples-gallery');
}

const [
  docs,
  packageText,
  articleHtml,
  productHtml,
  pricingHtml,
  downloadsHtml,
  lighthouseReport,
  linearPricingHtml,
] = await Promise.all([
  readRequired('docs/EXAMPLES.md'),
  readRequired('package.json'),
  readRequired('examples/fixtures/article-news.html'),
  readRequired('examples/fixtures/product-page.html'),
  readRequired('examples/fixtures/pricing-table.html'),
  readRequired('examples/fixtures/downloads.html'),
  readRequired('examples/fixtures/lighthouse-report.json'),
  readRequired('examples/fixtures/pricing-linear.html'),
]);

checkDocs(docs);
checkPackageJson(packageText);
checkArticleFixture(articleHtml);
checkProductFixture(productHtml);
checkPricingFixture(pricingHtml);
checkLinearPricingFixture(linearPricingHtml);
checkDownloadsFixture(downloadsHtml);
checkLighthouseFixture(lighthouseReport);

if (failures.length) {
  process.stdout.write(`${JSON.stringify({ ok: false, failures }, null, 2)}\n`);
  process.exit(1);
}

process.stdout.write(`${JSON.stringify({ ok: true }, null, 2)}\n`);
