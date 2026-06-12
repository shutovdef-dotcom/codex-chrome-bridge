import {
  collectDiagnostics,
  collectExtract,
  collectHTML,
  collectObserve,
  collectSnapshot,
  collectStorageSnapshot,
  collectText,
  listSelectOptionsInPage,
  resolveObservedElementTarget,
  waitForSelectorInPage,
} from './page-scripts.js';
import { traceSummaryForTab } from './debugger-session.js';
import { execute } from './page-execution.js';
import { requireConfirmed, requireSensitiveConfirmed } from './safety-gates.js';
import { tabInfo } from './tab-info.js';
import { getTargetTab } from './workspace-tabs.js';

export async function waitForSelector(payload) {
  if (!payload.selector && !payload.elementRef) throw new Error('waitForSelector requires selector or elementRef');
  const tab = await getTargetTab(payload);
  const target = await resolveElementTarget(tab.id, payload);
  const result = await execute(tab.id, waitForSelectorInPage, [{
    selector: target.selector,
    timeoutMs: Number(payload.timeoutMs || 10_000),
    visible: payload.visible !== false,
  }]);
  return { tab: tabInfo(await chrome.tabs.get(tab.id)), elementRef: target.elementRef, ...result };
}

export async function observe(payload) {
  const tab = await getTargetTab(payload);
  const result = await execute(tab.id, collectObserve, [payload]);
  return { tab: tabInfo(tab), ...result };
}

export async function findElements(payload) {
  const tab = await getTargetTab(payload);
  const result = await execute(tab.id, collectObserve, [payload]);
  return { tab: tabInfo(tab), ...result, filters: elementFilters(payload) };
}

function elementFilters(payload = {}) {
  return Object.fromEntries(['role', 'text', 'nearText', 'placeholder', 'href', 'actionKind', 'risk']
    .filter((key) => payload[key] !== undefined)
    .map((key) => [key, payload[key]]));
}

export async function extractPage(payload) {
  const tab = await getTargetTab(payload);
  const result = await execute(tab.id, collectExtract, [payload]);
  return { tab: tabInfo(tab), ...result };
}

export async function snapshot(payload) {
  const tab = await getTargetTab(payload);
  const result = await execute(tab.id, collectSnapshot, [payload]);
  return { tab: tabInfo(tab), ...result };
}

export async function pageText(payload) {
  const tab = await getTargetTab(payload);
  const result = await execute(tab.id, collectText, [payload]);
  return { tab: tabInfo(tab), ...result };
}

export async function pageHTML(payload) {
  const tab = await getTargetTab(payload);
  const target = await resolveElementTarget(tab.id, payload, { defaultSelector: payload.selector ? undefined : 'html' });
  const result = await execute(tab.id, collectHTML, [{ ...payload, selector: target.selector }]);
  if (target.elementRef) result.elementRef = target.elementRef;
  return { tab: tabInfo(tab), ...result };
}

export async function diagnostics(payload) {
  const tab = await getTargetTab(payload);
  const result = await execute(tab.id, collectDiagnostics, [payload]);
  return {
    tab: tabInfo(tab),
    generatedAt: new Date().toISOString(),
    privacy: {
      rawConsoleText: false,
      rawNetworkUrls: false,
      requestBodies: false,
      responseBodies: false,
    },
    trace: traceSummaryForTab(tab.id, tab),
    ...result,
  };
}

export async function listSelectOptions(payload) {
  if (!payload.selector && !payload.elementRef) throw new Error('listSelectOptions requires selector or elementRef');
  const tab = await getTargetTab(payload);
  const target = await resolveElementTarget(tab.id, payload);
  const result = await execute(tab.id, listSelectOptionsInPage, [{
    selector: target.selector,
  }]);
  return { tab: tabInfo(await chrome.tabs.get(tab.id)), elementRef: target.elementRef, ...result };
}

async function resolveElementTarget(tabId, payload = {}, options = {}) {
  if (!payload.elementRef) {
    return {
      selector: payload.selector || options.defaultSelector,
      elementRef: null,
    };
  }
  return execute(tabId, resolveObservedElementTarget, [{
    selector: payload.selector,
    elementRef: payload.elementRef,
    defaultSelector: options.defaultSelector,
  }]);
}

export async function storageSnapshot(payload) {
  requireConfirmed(payload, 'storageSnapshot');
  if (payload.includeValues) requireSensitiveConfirmed(payload, 'storageSnapshot includeValues');
  const tab = await getTargetTab(payload);
  const result = await execute(tab.id, collectStorageSnapshot, [{
    includeValues: Boolean(payload.includeValues),
    maxValueChars: Math.min(Math.max(Number(payload.maxValueChars || 500), 50), 5_000),
  }]);
  return { tab: tabInfo(tab), ...result };
}
