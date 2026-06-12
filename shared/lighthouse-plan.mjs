import os from 'node:os';
import path from 'node:path';

export const LIGHTHOUSE_PLAN_OUTPUT_CONTRACT_VERSION = 'lighthouse-plan/v1';

function clean(value) {
  return String(value || '').trim();
}

function safeTempPath(basename) {
  return path.join(os.tmpdir(), basename);
}

function resolveUrl(value) {
  const input = clean(value);
  if (!input) throw new Error('lighthouse-plan requires --url <http(s)://...>');
  let parsed;
  try {
    parsed = new URL(input);
  } catch (error) {
    throw new Error(`Invalid --url: ${error?.message || error}`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('lighthouse-plan only supports http:// or https:// URLs');
  }
  return parsed.toString();
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

export function buildLighthousePlan({
  url,
  out,
  summaryOut,
  chromePath,
  chromeFlags,
  emulatedFormFactor,
  onlyCategories,
} = {}) {
  const resolvedUrl = resolveUrl(url);
  const reportPath = path.resolve(out || safeTempPath('chrome-bridge-lighthouse-report.json'));
  const summaryPath = path.resolve(summaryOut || safeTempPath('chrome-bridge-lighthouse-summary.json'));
  const categories = clean(onlyCategories);
  const flags = clean(chromeFlags);
  const formFactor = clean(emulatedFormFactor) || 'desktop';
  const chromeBinary = clean(chromePath);

  const commandParts = [
    'npx lighthouse',
    shellQuote(resolvedUrl),
    '--output json',
    `--output-path ${shellQuote(reportPath)}`,
    `--emulated-form-factor ${shellQuote(formFactor)}`,
  ];
  if (categories) {
    commandParts.push(`--only-categories ${shellQuote(categories)}`);
  }
  if (chromeBinary) {
    commandParts.push(`--chrome-path ${shellQuote(chromeBinary)}`);
  }
  if (flags) {
    commandParts.push(`--chrome-flags ${shellQuote(flags)}`);
  }

  const lighthouseCommand = commandParts.join(' ');
  const followUpCommand = `chrome-bridge lighthouse-ingest --report ${shellQuote(reportPath)} --out ${shellQuote(summaryPath)}`;

  return {
    ok: true,
    action: 'lighthouse-plan',
    outputContract: LIGHTHOUSE_PLAN_OUTPUT_CONTRACT_VERSION,
    mode: 'handoff-only',
    url: resolvedUrl,
    reportPath,
    summaryPath,
    lighthouseCommand,
    followUpCommand,
    finalCommands: [
      lighthouseCommand,
      followUpCommand,
    ],
    notes: [
      'Chrome MCP Bridge does not run Lighthouse directly in this workflow.',
      'Run the generated Lighthouse command yourself, then ingest the saved JSON report with the follow-up command.',
      'Keep the raw Lighthouse report local; use the ingested summary for compact agent output.',
    ],
    privacy: {
      runsLighthouseDirectly: false,
      rawReportInStdout: false,
    },
  };
}
