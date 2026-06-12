export const DIAGNOSTICS_OUTPUT_CONTRACT_VERSION = 'diagnostics-summary/v1';

function clonePlain(value) {
  if (!value || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value));
}

function summarizedTrace(trace = {}) {
  const {
    events: _events,
    tab: _tab,
    ...rest
  } = trace || {};
  return clonePlain(rest || {});
}

function summarizedPerformance(performance = {}) {
  const value = clonePlain(performance || {});
  if (value?.resources) {
    delete value.resources.entries;
    delete value.resources.urls;
  }
  return value;
}

export function summarizeDiagnosticsOutput(result = {}, { artifactPath = null } = {}) {
  return {
    ok: true,
    outputContract: DIAGNOSTICS_OUTPUT_CONTRACT_VERSION,
    action: 'diagnostics',
    artifactPath,
    tab: result.tab || null,
    generatedAt: result.generatedAt || null,
    privacy: {
      rawConsoleText: false,
      rawNetworkUrls: false,
      requestBodies: false,
      responseBodies: false,
      ...(result.privacy || {}),
    },
    page: result.page || null,
    trace: summarizedTrace(result.trace),
    performance: summarizedPerformance(result.performance),
    lighthouse: result.lighthouse || null,
  };
}
