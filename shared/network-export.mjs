import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_ARTIFACT_DIR, recordArtifactIndex } from './output-envelope.mjs';

export const NETWORK_EXPORT_OUTPUT_CONTRACT_VERSION = 'network-export/v1';

const SENSITIVE_QUERY_KEY = /(token|auth|key|secret|session|code|sig|signature|jwt|password|passwd|credential)/i;
const SENSITIVE_HEADER_KEY = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|x-auth-token)$/i;

function clean(value) {
  return String(value || '').trim();
}

function asBool(value) {
  return value === true;
}

function toPositiveInt(value, fallback, min = 1, max = 2_000) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function defaultArtifactBaseName() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function resolvedOutputPaths({ out, requestsOut, harOut, artifactDir } = {}) {
  const baseDir = path.resolve(artifactDir || DEFAULT_ARTIFACT_DIR);
  const baseName = defaultArtifactBaseName();
  const summaryPath = path.resolve(out || path.join(baseDir, `${baseName}-network-export-summary.json`));
  const requestsPath = path.resolve(requestsOut || path.join(baseDir, `${baseName}-network-export-requests.jsonl`));
  const harPath = harOut ? path.resolve(harOut) : null;
  return { baseDir, summaryPath, requestsPath, harPath };
}

function redactHeaders(headers = {}, report = {}) {
  const output = {};
  for (const [key, value] of Object.entries(headers || {})) {
    if (SENSITIVE_HEADER_KEY.test(key)) {
      report.headerRedactions = (report.headerRedactions || 0) + 1;
      output[key] = '[redacted]';
      continue;
    }
    output[key] = value;
  }
  return output;
}

function redactUrl(input, report = {}) {
  const value = clean(input);
  if (!value) {
    return {
      rawUrlPresent: false,
      url: null,
      origin: null,
      pathname: null,
      queryKeys: [],
    };
  }

  try {
    const parsed = new URL(value);
    parsed.username = '';
    parsed.password = '';
    const queryKeys = [];
    for (const [key, entry] of parsed.searchParams.entries()) {
      queryKeys.push(key);
      if (SENSITIVE_QUERY_KEY.test(key)) {
        report.queryValueRedactions = (report.queryValueRedactions || 0) + 1;
        parsed.searchParams.set(key, '[redacted]');
      }
    }
    const redactedUrl = parsed.toString().replace(/%5Bredacted%5D/gi, '[redacted]');
    return {
      rawUrlPresent: true,
      url: redactedUrl,
      origin: parsed.origin,
      pathname: parsed.pathname,
      queryKeys,
    };
  } catch {
    report.unparsedUrls = (report.unparsedUrls || 0) + 1;
    return {
      rawUrlPresent: true,
      url: '[unparsed-url]',
      origin: null,
      pathname: null,
      queryKeys: [],
    };
  }
}

function traceEventsList(trace = {}) {
  return Array.isArray(trace.events) ? trace.events : [];
}

function buildRequestRecords(trace = {}, options = {}) {
  const events = traceEventsList(trace).slice(-toPositiveInt(options.limit, 200, 1, 2_000));
  const report = {
    queryValueRedactions: 0,
    headerRedactions: 0,
    unparsedUrls: 0,
    headersRequested: asBool(options.includeHeaders),
    bodiesRequested: asBool(options.includeBodies),
    headersCaptured: false,
    bodiesCaptured: false,
  };
  const byRequestId = new Map();

  for (const event of events) {
    if (!String(event.kind || '').startsWith('network.')) continue;
    const requestId = clean(event.requestId) || `missing-${byRequestId.size + 1}`;
    const current = byRequestId.get(requestId) || {
      requestId,
      request: null,
      response: null,
      failure: null,
      resourceType: event.resourceType || null,
      lastCapturedAt: null,
    };

    current.resourceType = current.resourceType || event.resourceType || null;
    current.lastCapturedAt = event.capturedAt || current.lastCapturedAt;

    if (event.kind === 'network.request') {
      current.request = {
        method: event.method || null,
        initiatorType: event.initiatorType || null,
        ...redactUrl(event.url, report),
        headers: options.includeHeaders ? redactHeaders(event.headers || {}, report) : undefined,
      };
      if (event.headers && options.includeHeaders) report.headersCaptured = true;
    }

    if (event.kind === 'network.response') {
      current.response = {
        status: Number.isFinite(Number(event.status)) ? Number(event.status) : null,
        statusText: event.statusText || null,
        mimeType: event.mimeType || null,
        fromDiskCache: Boolean(event.fromDiskCache),
        fromServiceWorker: Boolean(event.fromServiceWorker),
        ...redactUrl(event.url, report),
        headers: options.includeHeaders ? redactHeaders(event.headers || {}, report) : undefined,
      };
      if (event.headers && options.includeHeaders) report.headersCaptured = true;
    }

    if (event.kind === 'network.failed') {
      current.failure = {
        errorText: event.errorText || null,
        canceled: Boolean(event.canceled),
      };
    }

    byRequestId.set(requestId, current);
  }

  const pageOrigin = (() => {
    try {
      return trace?.tab?.url ? new URL(trace.tab.url).origin : null;
    } catch {
      return null;
    }
  })();

  const records = [...byRequestId.values()].map((entry) => {
    const urlMeta = entry.response?.url ? entry.response : entry.request;
    const thirdParty = Boolean(pageOrigin && urlMeta?.origin && urlMeta.origin !== pageOrigin);
    return {
      requestId: entry.requestId,
      capturedAt: entry.lastCapturedAt,
      resourceType: entry.resourceType,
      thirdParty,
      request: entry.request,
      response: entry.response,
      failure: entry.failure,
    };
  });

  const summary = {
    requestCount: records.length,
    failedCount: records.filter((entry) => entry.failure || (entry.response?.status || 0) >= 400).length,
    thirdPartyRequestCount: records.filter((entry) => entry.thirdParty).length,
    statusCounts: {},
    resourceTypes: {},
  };

  for (const record of records) {
    const status = record.response?.status;
    if (status !== null && status !== undefined) {
      const key = String(status);
      summary.statusCounts[key] = (summary.statusCounts[key] || 0) + 1;
    }
    const resourceType = String(record.resourceType || 'unknown');
    summary.resourceTypes[resourceType] = (summary.resourceTypes[resourceType] || 0) + 1;
  }

  return { records, summary, report };
}

function jsonlLine(record) {
  return `${JSON.stringify(record)}\n`;
}

function harLike(trace = {}, records = []) {
  return {
    log: {
      version: '1.2',
      creator: {
        name: 'Chrome MCP Bridge',
        version: '0.4.1',
      },
      browser: {
        name: 'Google Chrome',
        version: null,
      },
      pages: [
        {
          id: `tab-${trace?.tab?.id ?? 'unknown'}`,
          title: trace?.tab?.title || null,
          pageTimings: {},
        },
      ],
      entries: records.map((record) => ({
        pageref: `tab-${trace?.tab?.id ?? 'unknown'}`,
        startedDateTime: record.capturedAt || null,
        request: {
          method: record.request?.method || 'GET',
          url: record.request?.url || record.response?.url || null,
          headers: record.request?.headers
            ? Object.entries(record.request.headers).map(([name, value]) => ({ name, value }))
            : [],
          queryString: Array.isArray(record.request?.queryKeys)
            ? record.request.queryKeys.map((name) => ({ name, value: '[redacted-or-omitted]' }))
            : [],
        },
        response: {
          status: record.response?.status ?? 0,
          statusText: record.response?.statusText || '',
          headers: record.response?.headers
            ? Object.entries(record.response.headers).map(([name, value]) => ({ name, value }))
            : [],
          content: {
            mimeType: record.response?.mimeType || '',
            size: -1,
          },
        },
        cache: {},
        timings: {},
      })),
    },
  };
}

function ensureSensitivePermission(options = {}) {
  if ((options.includeHeaders || options.includeBodies) && !options.confirmSensitive) {
    throw new Error('network-export requires --confirm-sensitive when --include-headers or --include-bodies is requested');
  }
}

export async function buildNetworkExport(trace = {}, options = {}) {
  ensureSensitivePermission(options);
  const { baseDir, summaryPath, requestsPath, harPath } = resolvedOutputPaths(options);
  const { records, summary, report } = buildRequestRecords(trace, options);

  await fs.mkdir(path.dirname(summaryPath), { recursive: true });
  await fs.mkdir(path.dirname(requestsPath), { recursive: true });
  if (harPath) await fs.mkdir(path.dirname(harPath), { recursive: true });

  const pageOrigin = (() => {
    try {
      return trace?.tab?.url ? new URL(trace.tab.url).origin : null;
    } catch {
      return null;
    }
  })();

  const exportSummary = {
    ok: true,
    action: 'network-export',
    outputContract: NETWORK_EXPORT_OUTPUT_CONTRACT_VERSION,
    generatedAt: new Date().toISOString(),
    traceActive: Boolean(trace.active),
    tab: trace?.tab ? {
      id: trace.tab.id ?? null,
      title: trace.tab.title ?? null,
      origin: pageOrigin,
    } : null,
    artifactDir: baseDir,
    summaryPath,
    requestsPath,
    harPath,
    requestCount: summary.requestCount,
    failedCount: summary.failedCount,
    thirdPartyRequestCount: summary.thirdPartyRequestCount,
    statusCounts: summary.statusCounts,
    resourceTypes: summary.resourceTypes,
    failures: records
      .filter((record) => record.failure || (record.response?.status || 0) >= 400)
      .slice(0, 20)
      .map((record) => ({
        requestId: record.requestId,
        url: record.request?.url || record.response?.url || null,
        status: record.response?.status ?? null,
        errorText: record.failure?.errorText || null,
      })),
    redaction: {
      queryValueRedactions: report.queryValueRedactions,
      headerRedactions: report.headerRedactions,
      unparsedUrls: report.unparsedUrls,
      rawUrlsInStdout: false,
      rawHeadersInStdout: false,
      headersRequested: report.headersRequested,
      headersCaptured: report.headersCaptured,
      bodiesRequested: report.bodiesRequested,
      bodiesCaptured: report.bodiesCaptured,
    },
    warnings: [
      report.headersRequested && !report.headersCaptured ? 'Header capture was requested, but the current trace session did not retain request/response headers.' : null,
      report.bodiesRequested ? 'Body capture was requested, but Chrome MCP Bridge does not retain request or response bodies in this workflow.' : null,
      !trace.active && summary.requestCount === 0 ? 'No active trace session or recent network events were available. Run trace-start first, then reproduce the issue before exporting.' : null,
    ].filter(Boolean),
    nextActions: !trace.active && summary.requestCount === 0
      ? [
        'chrome-bridge trace-start --confirm',
        'reproduce the failing page flow',
        'chrome-bridge network-export',
      ]
      : [],
  };

  await fs.writeFile(summaryPath, `${JSON.stringify(exportSummary, null, 2)}\n`);
  await fs.writeFile(requestsPath, records.map((record) => jsonlLine(record)).join(''));
  if (harPath) {
    await fs.writeFile(harPath, `${JSON.stringify(harLike(trace, records), null, 2)}\n`);
  }

  await recordArtifactIndex({
    generatedAt: exportSummary.generatedAt,
    action: 'network-export',
    contentType: 'application/json',
    artifactPath: summaryPath,
    tabId: trace?.tab?.id ?? null,
    url: trace?.tab?.url ?? null,
    title: trace?.tab?.title ?? null,
    charCount: JSON.stringify(exportSummary).length,
    byteCount: (await fs.stat(summaryPath)).size,
    sha256: null,
  }, {
    artifactDir: baseDir,
  });

  return exportSummary;
}
