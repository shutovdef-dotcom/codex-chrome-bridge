import fs from 'node:fs/promises';
import path from 'node:path';
import { formatReadOutput } from './output-envelope.mjs';

export const STRUCTURED_PRESET_OUTPUT_CONTRACT_VERSION = 'structured-preset/v1';
export const STRUCTURED_EXTRACTION_PRESETS = Object.freeze([
  'article',
  'product-page',
  'pricing-table',
]);

const PRESET_SCHEMAS = Object.freeze({
  article: Object.freeze({
    name: 'article',
    version: 'v1',
    fields: Object.freeze([
      'title',
      'byline',
      'publishedDate',
      'headings',
      'summary',
      'canonicalUrl',
    ]),
  }),
  'product-page': Object.freeze({
    name: 'product-page',
    version: 'v1',
    fields: Object.freeze([
      'title',
      'sku',
      'availability',
      'priceHints',
      'downloadLinks',
      'canonicalUrl',
    ]),
  }),
  'pricing-table': Object.freeze({
    name: 'pricing-table',
    version: 'v1',
    fields: Object.freeze([
      'plans',
      'currencyHints',
      'downloadLinks',
      'canonicalUrl',
    ]),
  }),
});

const FILE_LINK_PATTERN = /\.(?:pdf|csv|xlsx?|docx?|zip|rar|7z|json|xml)(?:[?#].*)?$/i;

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function clip(value, maxChars = 500) {
  return clean(value).slice(0, maxChars);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function lines(text) {
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

function parseJsonLd(content) {
  const raw = String(content || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    try {
      return JSON.parse(decodeHtml(raw));
    } catch {
      return null;
    }
  }
}

function collectJsonLdNodes(value, output = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectJsonLdNodes(item, output);
    return output;
  }
  if (!value || typeof value !== 'object') return output;
  output.push(value);
  if (value['@graph']) collectJsonLdNodes(value['@graph'], output);
  return output;
}

function jsonLdNodes(html) {
  const nodes = [];
  const scriptPattern = /<script\b(?=[^>]*type\s*=\s*(["'])application\/ld\+json\1)[^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of String(html || '').matchAll(scriptPattern)) {
    const parsed = parseJsonLd(match[2]);
    if (parsed) collectJsonLdNodes(parsed, nodes);
  }
  return nodes;
}

function schemaTypes(node) {
  return (Array.isArray(node?.['@type']) ? node['@type'] : [node?.['@type']])
    .filter(Boolean)
    .map((value) => String(value).split(/[\/#]/).pop().toLowerCase());
}

function schemaNode(nodes, typeNames) {
  const wanted = new Set(typeNames.map((type) => type.toLowerCase()));
  return nodes.find((node) => schemaTypes(node).some((type) => wanted.has(type))) || null;
}

function schemaText(value) {
  if (typeof value === 'string' || typeof value === 'number') return clip(value, 300);
  if (Array.isArray(value)) return schemaText(value[0]);
  if (value && typeof value === 'object') {
    return schemaText(value.name || value.headline || value['@value']);
  }
  return null;
}

function schemaAuthorName(articleNode) {
  const author = articleNode?.author;
  return schemaText(author);
}

function schemaDate(value) {
  return /^\d{4}-\d{2}-\d{2}/.exec(schemaText(value) || '')?.[0] || null;
}

function schemaOffers(productNode) {
  const offers = productNode?.offers;
  if (!offers) return [];
  return Array.isArray(offers) ? offers.filter(Boolean) : [offers];
}

function normalizeSchemaAvailability(value) {
  const raw = schemaText(value);
  if (!raw) return null;
  return clip(raw.split(/[\/#]/).pop(), 120) || null;
}

function schemaPriceHints(productNode) {
  return schemaOffers(productNode)
    .map((offer) => {
      const currency = schemaText(offer?.priceCurrency);
      const price = schemaText(offer?.price);
      if (currency && price) return `${currency} ${price}`;
      return price || null;
    })
    .filter(Boolean)
    .slice(0, 25);
}

function htmlAttribute(source, name) {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i');
  return decodeHtml(pattern.exec(source || '')?.[2] || '');
}

function hasBooleanOrValuedAttribute(source, name) {
  const pattern = new RegExp(`(?:^|\\s)${name}\\b(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s"'>]+))?`, 'i');
  return pattern.test(source || '');
}

function metaContent(html, selectors) {
  for (const selector of selectors) {
    const metaPattern = new RegExp(`<meta\\b(?=[^>]*(?:name|property)\\s*=\\s*["']${selector}["'])[^>]*>`, 'i');
    const match = metaPattern.exec(html || '');
    const content = match ? htmlAttribute(match[0], 'content') : '';
    if (content) return content;
  }
  return '';
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

function canonicalUrl(html, sourceUrl) {
  const linkPattern = /<link\b(?=[^>]*rel\s*=\s*(["'])canonical\1)[^>]*>/i;
  const match = linkPattern.exec(html || '');
  const href = match ? htmlAttribute(match[0], 'href') : '';
  return normalizeUrl(href, sourceUrl) || sourceUrl || null;
}

function anchorLinks(html, sourceUrl) {
  const links = [];
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  for (const match of String(html || '').matchAll(anchorPattern)) {
    const href = normalizeUrl(htmlAttribute(match[1], 'href'), sourceUrl);
    if (!href || !/^https?:\/\//i.test(href)) continue;
    links.push({
      href,
      text: clip(stripTags(match[2]), 200),
      download: hasBooleanOrValuedAttribute(match[1], 'download'),
    });
  }
  return links;
}

function downloadLinks(html, sourceUrl) {
  return anchorLinks(html, sourceUrl)
    .filter((link) => link.download || FILE_LINK_PATTERN.test(link.href) || /\b(download|export|offline|pdf|csv|xlsx?)\b/i.test(link.text))
    .slice(0, 50);
}

function inferTitle({ preset, title, html, text, structuredData = [] }) {
  const articleNode = schemaNode(structuredData, ['NewsArticle', 'Article', 'BlogPosting']);
  const productNode = schemaNode(structuredData, ['Product']);
  const schemaTitle = preset === 'product-page'
    ? schemaText(productNode?.name)
    : schemaText(articleNode?.headline || articleNode?.name);
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html || '')?.[1];
  const htmlTitle = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html || '')?.[1];
  const firstLine = lines(text)[0];
  if (preset === 'pricing-table') return clip(h1 || htmlTitle || title || firstLine, 300) || null;
  return clip(schemaTitle || title || h1 || htmlTitle || firstLine, 300) || null;
}

function inferByline({ html, text, structuredData = [] }) {
  const articleNode = schemaNode(structuredData, ['NewsArticle', 'Article', 'BlogPosting']);
  const schemaAuthor = schemaAuthorName(articleNode);
  if (schemaAuthor) return clip(schemaAuthor, 200);
  const authorMeta = metaContent(html, ['author', 'article:author']);
  if (authorMeta) return clip(authorMeta, 200);
  const byline = /(?:^|\n)\s*(?:by|author|автор)\s+([^\n]+)/i.exec(String(text || ''))?.[1];
  if (byline) return clip(byline, 200);
  const bylineHtml = /class\s*=\s*["'][^"']*byline[^"']*["'][^>]*>([\s\S]*?)</i.exec(html || '')?.[1];
  return clip(stripTags(bylineHtml || '').replace(/^by\s+/i, ''), 200) || null;
}

function inferPublishedDate({ html, text, structuredData = [] }) {
  const articleNode = schemaNode(structuredData, ['NewsArticle', 'Article', 'BlogPosting']);
  const schemaPublished = schemaDate(articleNode?.datePublished || articleNode?.dateCreated);
  if (schemaPublished) return schemaPublished;
  const metaDate = metaContent(html, ['article:published_time', 'datePublished', 'date']);
  const timeDate = /<time\b[^>]*\bdatetime\s*=\s*(["'])(.*?)\1/i.exec(html || '')?.[2];
  const textDate = /\b(20\d{2}-\d{2}-\d{2})\b/.exec(text || '')?.[1];
  const value = metaDate || timeDate || textDate || '';
  return /^\d{4}-\d{2}-\d{2}/.exec(value)?.[0] || null;
}

function headings(html) {
  return Array.from(String(html || '').matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi))
    .map((match) => ({
      level: Number(match[1]),
      text: clip(stripTags(match[2]), 200),
    }))
    .filter((heading) => heading.text)
    .slice(0, 50);
}

function summaryLines(text) {
  return lines(text)
    .filter((line) => line.length >= 40)
    .filter((line) => !/\b(raw|stdout|artifact|download|export)\b/i.test(line))
    .slice(0, 3);
}

function keyValueFromText(text, keyPattern) {
  const pattern = new RegExp(`\\b${keyPattern}\\b\\s*[:#-]?\\s*([^\\n]+)`, 'i');
  return clip(pattern.exec(String(text || ''))?.[1] || '', 200) || null;
}

function dlValue(html, termPattern) {
  const pattern = new RegExp(`<dt\\b[^>]*>\\s*(?:${termPattern})\\s*<\\/dt>\\s*<dd\\b[^>]*>([\\s\\S]*?)<\\/dd>`, 'i');
  return clip(stripTags(pattern.exec(html || '')?.[1] || ''), 200) || null;
}

function inferSku({ html, text, structuredData = [] }) {
  const productNode = schemaNode(structuredData, ['Product']);
  return schemaText(productNode?.sku) || dlValue(html, 'SKU') || keyValueFromText(text, 'SKU');
}

function inferAvailability({ html, text, structuredData = [] }) {
  const productNode = schemaNode(structuredData, ['Product']);
  const schemaAvailability = normalizeSchemaAvailability(schemaOffers(productNode)[0]?.availability || productNode?.availability);
  return schemaAvailability || dlValue(html, 'Availability|Stock|Status') || keyValueFromText(text, 'Availability|Stock');
}

function priceHints(text) {
  return unique((String(text || '').match(/(?:[$€£]\s?\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s?(?:USD|EUR|GBP|RUB|₽|\/mo|per month))/gi) || [])
    .map((value) => clip(value, 80)))
    .slice(0, 25);
}

function currencyHints(text) {
  return unique((String(text || '').match(/[$€£₽]|\b(?:USD|EUR|GBP|RUB)\b/gi) || [])
    .map((value) => value.toUpperCase()))
    .slice(0, 10);
}

function tableRows(html) {
  const tables = [];
  for (const tableMatch of String(html || '').matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const rows = [];
    for (const rowMatch of tableMatch[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = Array.from(rowMatch[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi))
        .map((cell) => clip(stripTags(cell[1]), 300));
      if (cells.length) rows.push(cells);
    }
    if (rows.length) tables.push(rows);
  }
  return tables;
}

function pricingCards(html) {
  const plans = [];
  const cardPattern = /<article\b([^>]*)>([\s\S]*?)<\/article>/gi;
  for (const match of String(html || '').matchAll(cardPattern)) {
    const attrs = match[1] || '';
    if (!/\b(plan|tier|pricing-card|price-card)\b/i.test(attrs)) continue;
    const body = match[2] || '';
    const name = clip(stripTags(/<h[2-4]\b[^>]*>([\s\S]*?)<\/h[2-4]>/i.exec(body)?.[1] || htmlAttribute(attrs, 'aria-label')), 100);
    const priceHtml = /class\s*=\s*["'][^"']*(?:price|cost|rate)[^"']*["'][^>]*>([\s\S]*?)</i.exec(body)?.[1];
    const bodyText = stripTags(body);
    const price = clip(stripTags(priceHtml || '') || /(?:[$€£]\s?\d+(?:[.,]\d+)?(?:\/\w+)?|custom pricing|\d+(?:[.,]\d+)?\s?(?:USD|EUR|GBP|RUB|₽|\/mo|per month))/i.exec(bodyText)?.[0], 100);
    if (!name || !price) continue;
    const features = Array.from(body.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi))
      .map((item) => clip(stripTags(item[1]), 120))
      .filter(Boolean)
      .slice(0, 20);
    plans.push({ name, price, features });
  }
  return plans.slice(0, 50);
}

function isLinearPricingName(line) {
  if (!line || line.length > 60) return false;
  if (/[$€£₽]|\d+(?:[.,]\d+)?\s?(?:USD|EUR|GBP|RUB)|\/month|\/mo|per month/i.test(line)) return false;
  if (/^(get started|buy now|contact sales|popular option|no card required|billed annually|pay yearly|pay monthly|save \d+%?)$/i.test(line)) return false;
  if (/\b(pricing|faq|question|overview|resources|docs|login|sign up|contact us)\b/i.test(line)) return false;
  return /^[A-Z][A-Za-z0-9 &+_-]{1,58}$/.test(line);
}

function isLinearPricingBoundaryBeforePrice(line) {
  return /^(get started|buy now|contact sales|popular option)$/i.test(line);
}

function linearPriceAt(textLines, index) {
  const name = textLines[index];
  if (/^free$/i.test(name)) return { price: 'Free', priceIndex: index };
  for (let offset = 1; offset <= 4 && index + offset < textLines.length; offset += 1) {
    const line = textLines[index + offset];
    if (isLinearPricingBoundaryBeforePrice(line)) return null;
    if (/^custom pricing/i.test(line)) return { price: clip(line, 120), priceIndex: index + offset };
    const amount = /^(?:[$€£]\s?\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s?(?:USD|EUR|GBP|RUB|₽))$/i.exec(line)?.[0];
    if (!amount) continue;
    const next = textLines[index + offset + 1] || '';
    const suffix = /^\/\s?(month|mo|year|yr)$/i.test(next)
      ? next.replace(/\s+/g, '')
      : '';
    return {
      price: suffix ? `${clip(amount, 80)}${suffix}` : clip(amount, 80),
      priceIndex: index + offset + (suffix ? 1 : 0),
    };
  }
  return null;
}

function isLinearPricingFeature(line) {
  if (!line) return false;
  if (/^(get started|buy now|contact sales|popular option|pay yearly|pay monthly|save \d+%?)$/i.test(line)) return false;
  if (/^\/\s?(month|mo|year|yr)$/i.test(line)) return false;
  if (/^[$€£]\s?\d+(?:[.,]\d+)?$/i.test(line)) return false;
  return line.length <= 140;
}

function linearPricingPlans(text) {
  const textLines = lines(text);
  const plans = [];
  for (let index = 0; index < textLines.length; index += 1) {
    const name = textLines[index];
    if (!isLinearPricingName(name)) continue;
    const priceInfo = linearPriceAt(textLines, index);
    if (!priceInfo) continue;
    const features = [];
    for (let featureIndex = priceInfo.priceIndex + 1; featureIndex < textLines.length; featureIndex += 1) {
      const line = textLines[featureIndex];
      if (isLinearPricingName(line) && linearPriceAt(textLines, featureIndex)) break;
      if (isLinearPricingFeature(line)) features.push(line);
      if (features.length >= 20) break;
    }
    plans.push({
      name: clip(name, 100),
      price: clip(priceInfo.price, 120),
      features,
    });
    if (plans.length >= 50) break;
  }
  return plans;
}

function pricingPlans({ html, text }) {
  const plans = [];
  for (const rows of tableRows(html)) {
    const [header, ...body] = rows;
    const lowerHeader = (header || []).map((cell) => cell.toLowerCase());
    const planIndex = lowerHeader.findIndex((cell) => /\b(plan|tier|name)\b/i.test(cell));
    const priceIndex = lowerHeader.findIndex((cell) => /\b(price|cost|rate)\b/i.test(cell));
    const featureIndex = lowerHeader.findIndex((cell) => /\b(feature|include|benefit)\b/i.test(cell));
    for (const row of body) {
      const name = row[planIndex >= 0 ? planIndex : 0];
      const price = row[priceIndex >= 0 ? priceIndex : 1];
      if (!name || !price) continue;
      plans.push({
        name,
        price,
        features: row[featureIndex >= 0 ? featureIndex : 2]
          ? row[featureIndex >= 0 ? featureIndex : 2].split(/\s*,\s*/).filter(Boolean).slice(0, 20)
          : [],
      });
    }
  }

  if (plans.length) return plans.slice(0, 50);

  const cardPlans = pricingCards(html);
  if (cardPlans.length) return cardPlans;

  const linearPlans = linearPricingPlans(text);
  if (linearPlans.length) return linearPlans;

  for (const line of lines(text)) {
    const match = /^([A-Z][A-Za-z0-9 _-]{2,40})\s+-\s+(.+?(?:month|mo|pricing|custom|\$|€|£|₽|USD|EUR|RUB)[^-]*)\s+-\s*(.*)$/i.exec(line);
    if (!match) continue;
    plans.push({
      name: clip(match[1], 100),
      price: clip(match[2], 100),
      features: match[3] ? match[3].split(/\s*,\s*/).filter(Boolean).slice(0, 20) : [],
    });
  }
  return plans.slice(0, 50);
}

function extractArticle(input) {
  return {
    title: inferTitle({ preset: 'article', ...input }),
    byline: inferByline(input),
    publishedDate: inferPublishedDate(input),
    headings: headings(input.html),
    summary: summaryLines(input.text),
    canonicalUrl: canonicalUrl(input.html, input.sourceUrl),
  };
}

function extractProductPage(input) {
  const productNode = schemaNode(input.structuredData || [], ['Product']);
  return {
    title: inferTitle({ preset: 'product-page', ...input }),
    sku: inferSku(input),
    availability: inferAvailability(input),
    priceHints: unique([...schemaPriceHints(productNode), ...priceHints(input.text)]),
    downloadLinks: downloadLinks(input.html, input.sourceUrl),
    canonicalUrl: canonicalUrl(input.html, input.sourceUrl),
  };
}

function extractPricingTable(input) {
  return {
    plans: pricingPlans(input),
    currencyHints: currencyHints(input.text),
    downloadLinks: downloadLinks(input.html, input.sourceUrl),
    canonicalUrl: canonicalUrl(input.html, input.sourceUrl),
  };
}

function presetData(preset, input) {
  if (preset === 'article') return extractArticle(input);
  if (preset === 'product-page') return extractProductPage(input);
  if (preset === 'pricing-table') return extractPricingTable(input);
  throw new Error(`Unsupported structured extraction preset: ${preset}`);
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

function dataCounts(data = {}) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [
    key,
    Array.isArray(value) ? value.length : (value ? 1 : 0),
  ]));
}

export function extractStructuredPreset({
  preset,
  text = '',
  html = '',
  sourceUrl = '',
  title = '',
  rawArtifactPath = null,
  rawHtmlArtifactPath = null,
} = {}) {
  if (!STRUCTURED_EXTRACTION_PRESETS.includes(preset)) {
    throw new Error(`Unsupported structured extraction preset: ${preset || 'missing'}`);
  }
  const input = { text, html, sourceUrl, title, structuredData: jsonLdNodes(html) };
  const schema = PRESET_SCHEMAS[preset];
  return {
    outputContract: STRUCTURED_PRESET_OUTPUT_CONTRACT_VERSION,
    preset,
    schema,
    source: {
      url: sourceUrl || null,
      title: title || null,
    },
    data: presetData(preset, input),
    rawArtifactPath,
    rawHtmlArtifactPath,
  };
}

export async function buildStructuredPresetExtraction({
  bridgeCommand,
  target = {},
  options = {},
} = {}) {
  if (typeof bridgeCommand !== 'function') throw new Error('buildStructuredPresetExtraction requires bridgeCommand');
  if (!options.out) throw new Error('extract --preset requires --out <file>');
  const preset = options.preset;

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
  const extraction = extractStructuredPreset({
    preset,
    text: textResult.text || '',
    html: htmlResult.html || '',
    sourceUrl,
    title: textResult.title || textResult.tab?.title || htmlResult.title || htmlResult.tab?.title || '',
    rawArtifactPath: textEnvelope.artifactPath,
    rawHtmlArtifactPath: htmlEnvelope.artifactPath,
  });

  const artifactPath = path.resolve(options.out);
  await fs.mkdir(path.dirname(artifactPath), { recursive: true });
  await fs.writeFile(artifactPath, `${JSON.stringify(extraction, null, 2)}\n`);

  return {
    ok: true,
    outputContract: STRUCTURED_PRESET_OUTPUT_CONTRACT_VERSION,
    preset,
    schema: extraction.schema,
    artifactPath,
    rawArtifactPath: extraction.rawArtifactPath,
    rawHtmlArtifactPath: extraction.rawHtmlArtifactPath,
    counts: dataCounts(extraction.data),
    diagnostics: {
      text: envelopeSummary(textEnvelope),
      html: envelopeSummary(htmlEnvelope),
      fullPage: textEnvelope.diagnostics?.fullPage || null,
    },
  };
}
