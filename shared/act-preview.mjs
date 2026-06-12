function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function lower(value) {
  return clean(value).toLowerCase();
}

function tokenizeIntent(intent) {
  return lower(intent)
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter(Boolean);
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function quoted(value) {
  return JSON.stringify(String(value));
}

function extractQuotedText(intent) {
  const match = /"([^"]{1,200})"/.exec(String(intent || ''));
  if (match) return clean(match[1]);
  const singleMatch = /'([^']{1,200})'/.exec(String(intent || ''));
  return singleMatch ? clean(singleMatch[1]) : '';
}

function detectScenario(intent) {
  const text = lower(intent);
  if (/\b(download|export|csv|xlsx|pdf|report|invoice)\b/.test(text)) return 'download';
  if (/\b(price|pricing|plans?|billing)\b/.test(text)) return 'pricing';
  if (/\b(search|find|lookup|query)\b/.test(text)) return 'search';
  if (/\b(log[ -]?in|login|sign[ -]?in|sign in)\b/.test(text)) return 'login';
  if (/\b(delete|remove|publish|pay|buy|checkout|submit|send|confirm)\b/.test(text)) return 'high-risk';
  return 'generic';
}

function desiredActionsForScenario(scenario) {
  switch (scenario) {
    case 'download':
      return ['click', 'navigate', 'interact'];
    case 'pricing':
      return ['navigate', 'click'];
    case 'search':
      return ['type', 'click'];
    case 'login':
      return ['click', 'navigate', 'type'];
    case 'high-risk':
      return ['click', 'interact', 'type', 'select'];
    default:
      return ['click', 'navigate', 'type', 'select', 'toggle', 'interact'];
  }
}

function extractInputValue(intent, scenario) {
  const quotedText = extractQuotedText(intent);
  if (quotedText) return quotedText;
  if (scenario === 'search') {
    const match = /\bsearch(?:\s+for)?\s+(.+)$/i.exec(String(intent || ''));
    if (match) return clean(match[1]).replace(/[.?!]+$/, '');
  }
  return '';
}

function riskPenalty(risk, riskTolerance) {
  if (risk !== 'likely_mutation') return 0;
  if (riskTolerance === 'read-only') return 30;
  if (riskTolerance === 'confirmed-interaction') return 8;
  return 0;
}

function scoreCandidate(candidate, context) {
  const haystack = lower([
    candidate.label,
    candidate.text,
    candidate.placeholder,
    candidate.nearbyText,
    candidate.href,
    candidate.name,
  ].join(' '));
  let score = Number(candidate.score || 0);
  const reasons = [];

  if (context.desiredActions.includes(candidate.action)) {
    score += 18;
    reasons.push(`matches desired action ${candidate.action}`);
  }

  for (const keyword of context.keywords) {
    if (!keyword) continue;
    if (haystack.includes(keyword)) {
      score += 10;
      reasons.push(`matches keyword ${keyword}`);
    }
  }

  if (context.scenario === 'search' && candidate.action === 'type') {
    score += 16;
    reasons.push('supports search-style text input');
  }
  if (context.scenario === 'pricing' && candidate.action === 'navigate') {
    score += 12;
    reasons.push('looks like a safe pricing navigation target');
  }
  if (context.scenario === 'download' && /\b(download|export|csv|xlsx|pdf|report)\b/.test(haystack)) {
    score += 18;
    reasons.push('looks like a download or export control');
  }
  if (context.scenario === 'login' && /\b(log[ -]?in|login|sign[ -]?in|sign in)\b/.test(haystack)) {
    score += 18;
    reasons.push('looks like a login entry point');
  }

  if (candidate.disabled) {
    score -= 60;
    reasons.push('appears disabled');
  }

  const penalty = riskPenalty(candidate.risk, context.riskTolerance);
  if (penalty > 0) {
    score -= penalty;
    reasons.push(`penalized for risk ${candidate.risk} under ${context.riskTolerance}`);
  }

  return {
    score,
    reasons: uniqueStrings(reasons),
  };
}

function commandProposalForCandidate(candidate, context) {
  const selector = candidate.selector;
  if (!selector) return { cli: null, mcp: null, needsUserInput: true };

  if (candidate.action === 'type') {
    const textValue = context.inputValue || '<text>';
    return {
      cli: `chrome-bridge type --selector ${quoted(selector)} --text ${quoted(textValue)} --confirm`,
      mcp: {
        tool: 'chrome_bridge_type',
        arguments: {
          selector,
          text: textValue,
          confirmed: true,
        },
      },
      needsUserInput: !context.inputValue,
    };
  }

  if (candidate.action === 'select') {
    return {
      cli: `chrome-bridge select-options --selector ${quoted(selector)}`,
      mcp: {
        tool: 'chrome_bridge_select_options',
        arguments: {
          selector,
        },
      },
      needsUserInput: true,
    };
  }

  return {
    cli: `chrome-bridge click --selector ${quoted(selector)} --confirm`,
    mcp: {
      tool: 'chrome_bridge_click',
      arguments: {
        selector,
        confirmed: true,
      },
    },
    needsUserInput: false,
  };
}

function possibleSideEffects(candidate) {
  if (candidate.risk === 'safe_nav' || candidate.action === 'navigate') {
    return ['navigation'];
  }
  if (candidate.action === 'type' || candidate.action === 'select' || candidate.action === 'toggle') {
    return ['form state change'];
  }
  if (candidate.risk === 'likely_mutation') {
    return ['possible submit or account mutation'];
  }
  return ['page interaction'];
}

function confidenceForScore(score) {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(0.99, Math.round((score / 120) * 1000) / 1000));
}

export function buildActPreviewPlan(input = {}) {
  const intent = clean(input.intent);
  if (!intent) throw new Error('act-preview requires a non-empty intent');

  const observed = Array.isArray(input.observed?.elements) ? input.observed.elements : [];
  const scenario = detectScenario(intent);
  const keywords = uniqueStrings([
    ...tokenizeIntent(intent).filter((token) => token.length >= 3),
    ...({
      login: ['login', 'log in', 'sign in'],
      pricing: ['pricing', 'plans', 'price'],
      search: ['search'],
      download: ['download', 'export', 'report'],
      'high-risk': ['delete', 'remove', 'publish', 'pay', 'buy', 'submit'],
    }[scenario] || []),
  ]);
  const riskTolerance = input.riskTolerance || 'confirmed-interaction';
  const selectorPreference = input.selectorPreference || 'stable';
  const context = {
    scenario,
    keywords,
    desiredActions: desiredActionsForScenario(scenario),
    riskTolerance,
    inputValue: extractInputValue(intent, scenario),
  };

  const ranked = observed
    .filter((candidate) => clean(candidate.selector))
    .map((candidate) => {
      const score = scoreCandidate(candidate, context);
      const command = commandProposalForCandidate(candidate, context);
      return {
        ...candidate,
        previewScore: score.score,
        previewReasons: score.reasons,
        command,
      };
    })
    .filter((candidate) => {
      if (candidate.disabled) return false;
      if (riskTolerance === 'read-only' && candidate.risk === 'likely_mutation') return false;
      return candidate.previewScore > 0;
    })
    .sort((a, b) => b.previewScore - a.previewScore || (b.score || 0) - (a.score || 0) || (a.index || 0) - (b.index || 0))
    .slice(0, Math.max(1, Math.min(Number(input.maxCandidates || 5), 20)))
    .map((candidate, index) => ({
      id: `candidate-${index + 1}`,
      action: candidate.action,
      selector: candidate.selector,
      label: candidate.label || candidate.text || candidate.placeholder || '',
      role: candidate.role,
      risk: candidate.risk,
      confidence: confidenceForScore(candidate.previewScore),
      score: candidate.previewScore,
      reasons: candidate.previewReasons,
      requiredConfirmation: true,
      askUserFirst: candidate.command.needsUserInput || candidate.risk === 'likely_mutation' || candidate.confidence < 0.35,
      possibleSideEffects: possibleSideEffects(candidate),
      exactCommand: candidate.command.cli,
      exactMcpCall: candidate.command.mcp,
      inputHint: candidate.command.needsUserInput ? 'Provide the final text/value before applying this action.' : null,
      element: {
        tag: candidate.tag,
        text: candidate.text,
        placeholder: candidate.placeholder,
        href: candidate.href,
        disabled: candidate.disabled,
        rect: candidate.rect,
      },
    }));

  const recommended = ranked[0] || null;
  const askUserFirst = !recommended || recommended.askUserFirst;
  const nextRead = askUserFirst ? 'chrome-bridge snapshot' : 'chrome-bridge observe';

  return {
    ok: true,
    action: 'act-preview',
    mode: 'read-only',
    intent,
    scenario,
    riskTolerance,
    selectorPreference,
    page: {
      url: input.observed?.url || input.url || null,
      title: input.observed?.title || input.title || null,
      tabId: input.observed?.tab?.id || input.tabId || null,
    },
    observedCount: observed.length,
    candidateCount: ranked.length,
    candidates: ranked,
    recommended,
    askUserFirst,
    nextReadRecommendation: nextRead,
    notes: [
      'act-preview is deterministic and read-only.',
      'No page mutation happens during preview.',
      askUserFirst
        ? 'Preview confidence is limited or the action still needs user input, so ask the user before applying anything.'
        : 'If the user approves, execute exactly one low-level action and then read the page again.',
    ],
  };
}
