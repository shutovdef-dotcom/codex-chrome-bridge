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

function pushHint(hints, hint) {
  if (!hint?.id) return;
  hints.push({
    heuristic: true,
    severity: 'info',
    ...hint,
  });
}

function derivedHints(performance = {}, trace = {}, lighthouse = {}) {
  const hints = [];
  const navigation = performance?.navigation || {};
  const resources = performance?.resources || {};
  const longTasks = performance?.longTasks || {};
  const network = trace?.eventSummary?.network || {};
  const consoleSummary = trace?.eventSummary?.console || {};

  if (Number(resources.count || 0) >= 150) {
    pushHint(hints, {
      id: 'large-resource-count',
      severity: 'warn',
      message: 'Page loaded a large number of resources, which can slow navigation and increase render cost.',
      evidence: { resourceCount: resources.count },
    });
  }

  if (Number(navigation.domContentLoadedMs || 0) >= 2_500 || Number(navigation.loadEventMs || 0) >= 4_000) {
    pushHint(hints, {
      id: 'slow-navigation',
      severity: 'warn',
      message: 'Navigation timing looks slow. Review critical resources and server response time before deeper debugging.',
      evidence: {
        domContentLoadedMs: navigation.domContentLoadedMs ?? null,
        loadEventMs: navigation.loadEventMs ?? null,
        responseEndMs: navigation.responseEndMs ?? null,
      },
    });
  }

  if (Number(longTasks.count || 0) > 0) {
    pushHint(hints, {
      id: 'long-tasks',
      severity: 'warn',
      message: 'Long tasks were detected, which may indicate main-thread blocking work.',
      evidence: {
        count: longTasks.count,
        totalDurationMs: longTasks.totalDurationMs ?? null,
        maxDurationMs: longTasks.maxDurationMs ?? null,
      },
    });
  }

  if (Number(network.failedCount || 0) > 0) {
    pushHint(hints, {
      id: 'failed-requests',
      severity: 'warn',
      message: 'Network failures were observed. Inspect failing requests before assuming a frontend-only issue.',
      evidence: {
        failedCount: network.failedCount,
        statusCounts: network.statusCounts || {},
      },
    });
  }

  if (Number(network.thirdPartyRequestCount || resources.thirdPartyRequestCount || 0) >= 20) {
    pushHint(hints, {
      id: 'third-party-requests',
      severity: 'info',
      message: 'The page depends on many third-party requests, which can affect reliability and performance.',
      evidence: {
        thirdPartyRequestCount: network.thirdPartyRequestCount ?? resources.thirdPartyRequestCount ?? null,
      },
    });
  }

  if (Number(consoleSummary.byLevel?.error || 0) > 0) {
    pushHint(hints, {
      id: 'console-errors',
      severity: 'warn',
      message: 'Console errors were recorded during the trace window.',
      evidence: {
        errorCount: consoleSummary.byLevel.error,
      },
    });
  }

  if (Number(resources.renderBlockingCandidateCount || 0) > 0) {
    pushHint(hints, {
      id: 'render-blocking-candidates',
      severity: 'info',
      message: 'Potential render-blocking resources were detected.',
      evidence: {
        renderBlockingCandidateCount: resources.renderBlockingCandidateCount,
      },
    });
  }

  if (
    hints.some((hint) => ['slow-navigation', 'large-resource-count', 'long-tasks', 'failed-requests'].includes(hint.id))
    && lighthouse?.commandTemplate
  ) {
    pushHint(hints, {
      id: 'run-lighthouse-next',
      severity: 'info',
      message: 'Run Lighthouse next to confirm whether the observed heuristics match actionable performance audits.',
      evidence: {
        commandTemplate: lighthouse.commandTemplate,
      },
    });
  }

  return hints;
}

export function summarizeDiagnosticsOutput(result = {}, { artifactPath = null } = {}) {
  const trace = summarizedTrace(result.trace);
  const performance = summarizedPerformance(result.performance);
  const lighthouse = result.lighthouse || null;
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
    trace,
    performance,
    lighthouse,
    hints: derivedHints(performance, trace, lighthouse),
  };
}
