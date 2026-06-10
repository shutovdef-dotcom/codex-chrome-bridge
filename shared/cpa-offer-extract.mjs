import fs from 'node:fs/promises';
import path from 'node:path';
import { formatReadOutput } from './output-envelope.mjs';

export const CPA_OFFER_OUTPUT_CONTRACT_VERSION = 'cpa-offer/v1';

const TRAILING_URL_PUNCTUATION = /[),.;\]}]+$/;
const COUNTRY_CODE_PATTERN = /\b[A-Z]{2}\b/g;
const MATERIAL_PATH_PATTERN = /\.(?:zip|rar|7z|pdf|docx?|xlsx?|csv|png|jpe?g|gif|webp|svg)(?:[?#].*)?$/i;

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function clip(value, maxChars = 500) {
  return clean(value).slice(0, maxChars);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function visibleLines(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => clean(line))
    .filter(Boolean);
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

function normalizeUrl(value, baseUrl) {
  const trimmed = decodeHtml(value).trim().replace(TRAILING_URL_PUNCTUATION, '');
  try {
    return new URL(trimmed, baseUrl || undefined).href;
  } catch {
    return null;
  }
}

function linksFromHtml(html, baseUrl) {
  const links = [];
  const anchorPattern = /<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    const href = normalizeUrl(match[2], baseUrl);
    if (!href || !/^https?:\/\//i.test(href)) continue;
    links.push({
      href,
      text: clip(stripTags(match[3]), 200),
      source: 'html',
    });
  }
  return links;
}

function linksFromText(text, baseUrl) {
  const links = [];
  const urlPattern = /https?:\/\/[^\s"'<>]+/gi;
  for (const match of String(text || '').matchAll(urlPattern)) {
    const href = normalizeUrl(match[0], baseUrl);
    if (!href) continue;
    links.push({
      href,
      text: '',
      source: 'text',
    });
  }
  return links;
}

function extractLinks({ text = '', html = '', sourceUrl = '' } = {}) {
  const byHref = new Map();
  for (const link of [...linksFromHtml(html, sourceUrl), ...linksFromText(text, sourceUrl)]) {
    if (!byHref.has(link.href)) {
      byHref.set(link.href, link);
      continue;
    }
    const existing = byHref.get(link.href);
    if (!existing.text && link.text) byHref.set(link.href, { ...existing, text: link.text });
  }
  return [...byHref.values()];
}

function urlParts(href) {
  try {
    const parsed = new URL(href);
    return `${parsed.hostname} ${parsed.pathname} ${parsed.search}`.toLowerCase();
  } catch {
    return String(href || '').toLowerCase();
  }
}

function isGoogleSheetLink(link) {
  return /docs\.google\.com\/spreadsheets/i.test(link.href);
}

function isMaterialLink(link) {
  const parts = urlParts(link.href);
  return MATERIAL_PATH_PATTERN.test(link.href)
    || /\b(material|materials|creative|creatives|banner|banners|promo|asset|cdn)\b/i.test(parts);
}

function isTrackingLink(link) {
  const parts = urlParts(link.href);
  return /\b(trk|track|tracking|click|go|redirect|aff|partner|lead|postback)\b/i.test(parts)
    || /(?:^|[?&])(?:offer|offer_id|aff_id|partner_id)=/i.test(link.href);
}

function asPublicLinks(links) {
  return links.map((link) => ({
    href: link.href,
    text: link.text || undefined,
  }));
}

function classifyLinks(links) {
  const googleSheetLinks = links.filter(isGoogleSheetLink);
  const materialLinks = links.filter((link) => !isGoogleSheetLink(link) && isMaterialLink(link));
  const trackingLinks = links.filter((link) => !isGoogleSheetLink(link) && !isMaterialLink(link) && isTrackingLink(link));
  const landingLinks = links.filter((link) => !isGoogleSheetLink(link)
    && !isMaterialLink(link)
    && !isTrackingLink(link));
  return {
    trackingLinks: asPublicLinks(trackingLinks),
    landingLinks: asPublicLinks(landingLinks),
    materialLinks: asPublicLinks(materialLinks),
    googleSheetLinks: asPublicLinks(googleSheetLinks),
  };
}

function lineValues(lines, patterns) {
  return unique(lines
    .filter((line) => patterns.some((pattern) => pattern.test(line)))
    .map((line) => clip(line.replace(/^[^:：-]+[:：-]\s*/, ''), 500)));
}

function inferGeoHints(lines) {
  const geoLines = lines.filter((line) => /\b(?:geo|гео|country|countries|страны)\b/i.test(line));
  const candidates = geoLines.flatMap((line) => line.match(COUNTRY_CODE_PATTERN) || []);
  return unique(candidates.map((item) => item.toUpperCase())).slice(0, 50);
}

function inferSourceOfferId({ sourceUrl = '', text = '' } = {}) {
  try {
    const parsed = new URL(sourceUrl);
    for (const key of ['offer_id', 'offer', 'id']) {
      const value = parsed.searchParams.get(key);
      if (value && /^[A-Za-z0-9_-]{2,80}$/.test(value)) return value;
    }
    const pathId = parsed.pathname.match(/(?:offers?|campaigns?|programs?)\/([A-Za-z0-9_-]{2,80})/i)?.[1];
    if (pathId) return pathId;
    const numericPathId = parsed.pathname.match(/\/(\d{2,})\/?$/)?.[1];
    if (numericPathId) return numericPathId;
  } catch {
    // Fall back to page text below.
  }

  const textId = String(text || '').match(/\b(?:offer|оффер|id|#)\s*[:#-]?\s*([A-Za-z]{0,8}-?\d{2,})\b/i)?.[1];
  return textId ? textId.replace(/^[A-Za-z]{1,8}-/, '') : null;
}

function inferTitle({ title = '', html = '', text = '' } = {}) {
  const htmlTitle = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  return clip(title || stripTags(htmlTitle || '') || visibleLines(text)[0] || '', 300) || null;
}

function inferPageState(text) {
  const value = String(text || '').toLowerCase();
  if (/\b(active|enabled|live|running)\b|активн|включен|запущен/.test(value)) return 'active';
  if (/\b(paused|disabled|stopped|archived|inactive)\b|останов|выключен|архив/.test(value)) return 'inactive';
  if (/\b(pending|review|moderation)\b|ожида|провер|модерац/.test(value)) return 'pending';
  return 'unknown';
}

function inferAccessStatus(text) {
  const value = String(text || '').toLowerCase();
  if (/access\s+granted|доступ\s+(?:открыт|разрешен|разрешён)|approved access/.test(value)) return 'granted';
  if (/access\s+denied|no\s+access|доступ\s+(?:закрыт|запрещен|запрещён)|not\s+approved/.test(value)) return 'denied';
  return 'unknown';
}

function inferModerationRequired(text) {
  if (/\b(?:no moderation(?: required)?|without moderation|no pre-approval)\b|без\s+модерац/i.test(text)) return false;
  if (/\b(?:moderation required|requires moderation|pre-approval|approval required)\b|модерац|согласован/i.test(text)) return true;
  return null;
}

export function extractCpaOffer({
  text = '',
  html = '',
  sourceNetwork = 'unknown',
  sourceUrl = '',
  title = '',
  rawArtifactPath = null,
  rawHtmlArtifactPath = null,
} = {}) {
  const lines = visibleLines(text);
  const links = extractLinks({ text, html, sourceUrl });
  const classifiedLinks = classifyLinks(links);
  const inferredTitle = inferTitle({ title, html, text });

  return {
    outputContract: CPA_OFFER_OUTPUT_CONTRACT_VERSION,
    sourceNetwork: sourceNetwork || 'unknown',
    sourceOfferId: inferSourceOfferId({ sourceUrl, text }),
    title: inferredTitle,
    pageState: inferPageState(text),
    trackingLinks: classifiedLinks.trackingLinks,
    landingLinks: classifiedLinks.landingLinks,
    materialLinks: classifiedLinks.materialLinks,
    googleSheetLinks: classifiedLinks.googleSheetLinks,
    payoutRules: lineValues(lines, [
      /\b(?:payout|commission|rate|reward|cpa|cpl|cps)\b/i,
      /\b(?:rub|usd|eur|₽|\$|€)\b/i,
      /выплат|ставк|вознагражд/i,
    ]).slice(0, 25),
    trafficAllow: lineValues(lines, [
      /\b(?:allowed traffic|allow traffic|traffic allow|allowed sources)\b/i,
      /разреш[её]н.*трафик|можно\s+лить/i,
    ]).slice(0, 25),
    trafficForbid: lineValues(lines, [
      /\b(?:forbidden traffic|forbid traffic|traffic forbid|prohibited|not allowed|disallowed)\b/i,
      /запрещ[её]н.*трафик|нельзя\s+лить/i,
    ]).slice(0, 25),
    trafficByAgreement: lineValues(lines, [
      /\b(?:by agreement|on request|requires approval|approval required)\b/i,
      /по\s+согласован|требует\s+согласован/i,
    ]).slice(0, 25),
    geoHints: inferGeoHints(lines),
    accessStatus: inferAccessStatus(text),
    moderationRequired: inferModerationRequired(text),
    rawArtifactPath,
    rawHtmlArtifactPath,
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

function offerCounts(offer) {
  return {
    trackingLinks: offer.trackingLinks.length,
    landingLinks: offer.landingLinks.length,
    materialLinks: offer.materialLinks.length,
    googleSheetLinks: offer.googleSheetLinks.length,
    payoutRules: offer.payoutRules.length,
    trafficAllow: offer.trafficAllow.length,
    trafficForbid: offer.trafficForbid.length,
    trafficByAgreement: offer.trafficByAgreement.length,
    geoHints: offer.geoHints.length,
  };
}

export async function buildCpaOfferExtraction({
  bridgeCommand,
  target = {},
  options = {},
} = {}) {
  if (typeof bridgeCommand !== 'function') throw new Error('buildCpaOfferExtraction requires bridgeCommand');
  if (!options.out) throw new Error('extract --preset cpa-offer requires --out <file>');

  const textResult = await bridgeCommand('text', {
    ...target,
    maxChars: options.maxChars ?? 200_000,
    fullPage: true,
    waitForText: options.waitForText,
    waitForPattern: options.waitForPattern,
    scrollStepPx: options.scrollStepPx,
    maxScrollSteps: options.maxScrollSteps,
    scrollDelayMs: options.scrollDelayMs,
  }, options.textTimeoutMs ?? 30_000);

  const htmlResult = await bridgeCommand('html', {
    ...target,
    selector: options.selector,
    maxChars: options.maxHtmlChars ?? 500_000,
    outer: true,
  }, options.htmlTimeoutMs ?? 30_000);

  const artifactOptions = {
    artifactDir: options.artifactDir,
    summaryOnly: true,
  };
  const textEnvelope = await formatReadOutput({
    action: 'text',
    result: textResult,
    options: {
      ...artifactOptions,
      out: options.rawOut,
    },
  });
  const htmlEnvelope = await formatReadOutput({
    action: 'html',
    result: htmlResult,
    options: {
      ...artifactOptions,
      out: options.rawHtmlOut,
    },
  });

  const sourceUrl = textResult.url || textResult.tab?.url || htmlResult.url || htmlResult.tab?.url || null;
  const offer = extractCpaOffer({
    text: textResult.text || '',
    html: htmlResult.html || '',
    sourceNetwork: options.sourceNetwork || options.network || 'unknown',
    sourceUrl,
    title: textResult.title || textResult.tab?.title || htmlResult.title || htmlResult.tab?.title || '',
    rawArtifactPath: textEnvelope.artifactPath,
    rawHtmlArtifactPath: htmlEnvelope.artifactPath,
  });

  const artifactPath = path.resolve(options.out);
  await fs.mkdir(path.dirname(artifactPath), { recursive: true });
  await fs.writeFile(artifactPath, `${JSON.stringify(offer, null, 2)}\n`);

  return {
    ok: true,
    outputContract: CPA_OFFER_OUTPUT_CONTRACT_VERSION,
    preset: 'cpa-offer',
    sourceNetwork: offer.sourceNetwork,
    sourceOfferId: offer.sourceOfferId,
    title: offer.title,
    pageState: offer.pageState,
    accessStatus: offer.accessStatus,
    moderationRequired: offer.moderationRequired,
    artifactPath,
    rawArtifactPath: offer.rawArtifactPath,
    rawHtmlArtifactPath: offer.rawHtmlArtifactPath,
    counts: offerCounts(offer),
    diagnostics: {
      text: envelopeSummary(textEnvelope),
      html: envelopeSummary(htmlEnvelope),
      fullPage: textEnvelope.diagnostics?.fullPage || null,
    },
  };
}
