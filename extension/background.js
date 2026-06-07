const OFFSCREEN_URL = 'offscreen.html';
const DEFAULT_GROUP_TITLE = 'Codex Bridge';
const DEFAULT_GROUP_COLOR = 'purple';
const DEBUGGER_PROTOCOL_VERSION = '1.3';
const MAX_TRACE_EVENTS = 500;

const traceSessions = new Map();

function groupOptions(payload = {}) {
  return {
    title: String(payload.groupTitle || DEFAULT_GROUP_TITLE).trim() || DEFAULT_GROUP_TITLE,
    color: String(payload.groupColor || DEFAULT_GROUP_COLOR).trim() || DEFAULT_GROUP_COLOR,
  };
}

async function ensureOffscreen() {
  if (!chrome.offscreen) {
    throw new Error('chrome.offscreen API is unavailable');
  }

  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_URL);
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl],
  });

  if (contexts.length) return;

  const reason = chrome.offscreen.Reason?.BLOBS
    || chrome.offscreen.Reason?.DOM_SCRAPING
    || 'DOM_SCRAPING';

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [reason],
    justification: 'Maintain a local Codex bridge connection for user-authorized browser inspection.',
  });
}

async function startBridge() {
  try {
    await ensureOffscreen();
  } catch {
    // The extension action and alarm will retry; avoid throwing from event startup.
  }
}

chrome.runtime.onInstalled.addListener(startBridge);
chrome.runtime.onStartup.addListener(startBridge);
chrome.action.onClicked.addListener(startBridge);
chrome.alarms.create('codex-bridge-ensure-offscreen', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'codex-bridge-ensure-offscreen') startBridge();
});
startBridge();

if (chrome.debugger?.onEvent) {
  chrome.debugger.onEvent.addListener((source, method, params) => {
    recordDebuggerEvent(source, method, params);
  });

  chrome.debugger.onDetach.addListener((source, reason) => {
    const session = source?.tabId ? traceSessions.get(source.tabId) : null;
    if (session) {
      session.active = false;
      session.attached = false;
      session.detachedAt = new Date().toISOString();
      session.detachReason = reason;
    }
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'codex-bridge-command') return undefined;

  dispatch(message.action, message.payload || {})
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));

  return true;
});

async function dispatch(action, payload) {
  switch (action) {
    case 'tabs':
      return listTabs(payload);
    case 'group':
      return groupStatus(payload);
    case 'ensureTab':
      return ensureCodexTab(payload);
    case 'open':
      return openTab(payload);
    case 'activateTab':
      return activateTab(payload);
    case 'closeTab':
      return closeTab(payload);
    case 'closeGroup':
      return closeGroup(payload);
    case 'goBack':
      return goBack(payload);
    case 'goForward':
      return goForward(payload);
    case 'reloadTab':
      return reloadTab(payload);
    case 'waitForSelector':
      return waitForSelector(payload);
    case 'snapshot':
      return snapshot(payload);
    case 'text':
      return pageText(payload);
    case 'html':
      return pageHTML(payload);
    case 'screenshot':
      return screenshot(payload);
    case 'scroll':
      return scroll(payload);
    case 'click':
      return click(payload);
    case 'clickAt':
      return clickAt(payload);
    case 'hover':
      return hover(payload);
    case 'type':
      return typeInto(payload);
    case 'press':
      return pressKey(payload);
    case 'select':
      return selectOption(payload);
    case 'traceStart':
      return traceStart(payload);
    case 'traceEvents':
      return traceEvents(payload);
    case 'traceStop':
      return traceStop(payload);
    case 'historySearch':
      return historySearch(payload);
    case 'bookmarksSearch':
      return bookmarksSearch(payload);
    case 'cookiesList':
      return cookiesList(payload);
    case 'storageSnapshot':
      return storageSnapshot(payload);
    case 'fetchUrl':
      return fetchUrl(payload);
    case 'evalPage':
      return evalPage(payload);
    case 'reloadExtension':
      return reloadExtension();
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

async function reloadExtension() {
  setTimeout(() => chrome.runtime.reload(), 100);
  return {
    reloading: true,
    message: 'Codex Chrome Bridge extension reload requested',
  };
}

async function listTabs(payload = {}) {
  const tabs = await chrome.tabs.query({});
  const groups = await listTabGroups();
  const options = groupOptions(payload);
  const codexGroups = groups.filter((group) => group.title === options.title);
  const codexGroupIds = new Set(codexGroups.map((group) => group.id));
  const scoped = !payload.includeAll;
  const visibleTabs = scoped
    ? tabs.filter((tab) => codexGroupIds.has(tab.groupId))
    : tabs;

  return {
    scope: scoped ? 'codex-group' : 'all-tabs',
    configuredGroup: options,
    groups: scoped ? codexGroups : groups,
    tabs: visibleTabs.map((tab) => tabInfo(tab, { groups })),
  };
}

async function listTabGroups(query = {}) {
  if (!chrome.tabGroups) return [];
  const groups = await chrome.tabGroups.query(query);
  return groups.map(groupInfo);
}

async function storageGet(keys) {
  return chrome.storage.local.get(keys);
}

async function storageSet(values) {
  return chrome.storage.local.set(values);
}

async function storageRemove(keys) {
  return chrome.storage.local.remove(keys);
}

async function getStoredCodexTab(payload = {}) {
  const { codexTabId, codexWindowId } = await storageGet(['codexTabId', 'codexWindowId']);

  if (codexTabId) {
    try {
      const tab = await chrome.tabs.get(codexTabId);
      if (!codexWindowId || tab.windowId === codexWindowId) return tab;
    } catch {
      // Fall through to group recovery below.
    }
  }

  const tabs = await getCodexGroupTabs(payload);
  if (!tabs.length) return null;

  const tab = tabs.find((candidate) => candidate.active) || tabs[0];
  await storageSet({ codexTabId: tab.id, codexWindowId: tab.windowId });
  return tab;
}

async function getTargetTab(payload = {}, options = {}) {
  if (payload.tabId) {
    const tab = await chrome.tabs.get(Number(payload.tabId));
    if (!payload.allowExternal) {
      await assertCodexScopedTab(tab, payload);
    }
    return tab;
  }

  const stored = await getStoredCodexTab(payload);
  if (stored) {
    await ensureCodexGroupForTab(stored, payload);
    return chrome.tabs.get(stored.id);
  }

  if (!options.create) {
    throw new Error('No tabId supplied and no Codex tab has been created yet');
  }

  const created = await chrome.windows.create({
    url: options.url || payload.url || 'about:blank',
    focused: Boolean(payload.active),
    width: 1280,
    height: 900,
    left: 80,
    top: 80,
    type: 'normal',
  });

  const tab = created.tabs?.[0];
  if (!tab?.id) throw new Error('Failed to create a Codex tab');

  await storageSet({ codexTabId: tab.id, codexWindowId: tab.windowId });
  await ensureCodexGroupForTab(tab, payload);
  return chrome.tabs.get(tab.id);
}

async function getStoredCodexGroup(payload = {}, windowId) {
  if (!chrome.tabGroups) return null;
  const options = groupOptions(payload);
  const stored = await storageGet(['codexGroupId', 'codexGroupWindowId']);

  if (stored.codexGroupId) {
    try {
      const group = await chrome.tabGroups.get(stored.codexGroupId);
      if ((!windowId || group.windowId === windowId) && group.title === options.title) {
        return group;
      }
    } catch {
      // Browser-session group IDs are not durable; recover by title below.
    }
  }

  const groups = await chrome.tabGroups.query(windowId ? { windowId } : {});
  return groups.find((group) => group.title === options.title) || null;
}

async function getCodexGroupTabs(payload = {}) {
  const options = groupOptions(payload);
  const groups = await listTabGroups();
  const groupIds = new Set(groups
    .filter((group) => group.title === options.title)
    .map((group) => group.id));
  if (!groupIds.size) return [];
  const tabs = await chrome.tabs.query({});
  return tabs.filter((tab) => groupIds.has(tab.groupId));
}

async function ensureCodexGroupForTab(tab, payload = {}) {
  if (!chrome.tabGroups || !chrome.tabs.group) {
    throw new Error('chrome.tabGroups API is unavailable; reload the extension after granting the tabGroups permission');
  }

  const options = groupOptions(payload);
  let group = await getStoredCodexGroup(payload, tab.windowId);
  let groupId = group?.id;

  if (!groupId && Number.isInteger(tab.groupId) && tab.groupId >= 0) {
    try {
      const existing = await chrome.tabGroups.get(tab.groupId);
      if (existing.windowId === tab.windowId && existing.title === options.title) {
        groupId = existing.id;
      }
    } catch {
      groupId = null;
    }
  }

  if (groupId) {
    await chrome.tabs.group({ groupId, tabIds: [tab.id] });
  } else {
    groupId = await chrome.tabs.group({ tabIds: [tab.id] });
  }

  group = await chrome.tabGroups.update(groupId, {
    title: options.title,
    color: options.color,
    collapsed: false,
  });

  await storageSet({
    codexGroupId: group.id,
    codexGroupWindowId: group.windowId,
    codexGroupTitle: options.title,
    codexGroupColor: options.color,
    codexTabId: tab.id,
    codexWindowId: tab.windowId,
  });

  return group;
}

async function assertCodexScopedTab(tab, payload = {}) {
  const options = groupOptions(payload);
  const group = await getStoredCodexGroup(payload, tab.windowId);
  if (group && tab.groupId === group.id) return;

  const groups = await listTabGroups({ windowId: tab.windowId });
  const match = groups.find((candidate) => candidate.id === tab.groupId && candidate.title === options.title);
  if (match) return;

  throw new Error(`Tab ${tab.id} is outside the "${options.title}" group; pass allowExternal=true only for an explicitly user-approved tab`);
}

async function ensureCodexTab(payload) {
  const tab = await getTargetTab(payload, {
    create: true,
    url: payload.url || 'about:blank',
  });
  let group = await ensureCodexGroupForTab(tab, payload);

  if (payload.url && tab.url !== payload.url) {
    await chrome.tabs.update(tab.id, { url: payload.url, active: Boolean(payload.active) });
    const loaded = await waitForTabComplete(tab.id);
    group = await ensureCodexGroupForTab(loaded, payload);
    await storageSet({ codexTabId: loaded.id, codexWindowId: loaded.windowId });
    return tabInfo(loaded, { group });
  }

  if (payload.active) {
    await chrome.tabs.update(tab.id, { active: true });
  }

  await storageSet({ codexTabId: tab.id, codexWindowId: tab.windowId });
  return tabInfo(await chrome.tabs.get(tab.id), { group });
}

async function waitForTabComplete(tabId, timeoutMs = 25_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === 'complete') return tab;
    await delay(200);
  }
  return chrome.tabs.get(tabId);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function openTab(payload) {
  if (!payload.url) throw new Error('open requires url');
  if (payload.newTab && payload.tabId) throw new Error('open cannot use newTab and tabId together');
  if (payload.newTab) return createGroupedTab(payload);

  const target = await getTargetTab(payload, { create: true, url: payload.url });
  let group = await ensureCodexGroupForTab(target, payload);
  await chrome.tabs.update(target.id, { url: payload.url, active: Boolean(payload.active) });
  const tab = await waitForTabComplete(target.id);
  group = await ensureCodexGroupForTab(tab, payload);
  await storageSet({ codexTabId: tab.id, codexWindowId: tab.windowId });
  return tabInfo(tab, { group });
}

async function createGroupedTab(payload) {
  const options = groupOptions(payload);
  let tabs = await getCodexGroupTabs(payload);
  let tab;

  if (tabs.length) {
    const lastTab = tabs.reduce((latest, current) => (
      current.windowId === latest.windowId && current.index > latest.index ? current : latest
    ), tabs[0]);
    tab = await chrome.tabs.create({
      windowId: lastTab.windowId,
      index: lastTab.index + 1,
      url: payload.url,
      active: Boolean(payload.active),
    });
  } else {
    const created = await chrome.windows.create({
      url: payload.url,
      focused: Boolean(payload.active),
      width: 1280,
      height: 900,
      left: 80,
      top: 80,
      type: 'normal',
    });
    tab = created.tabs?.[0];
  }

  if (!tab?.id) throw new Error('Failed to create a grouped Codex tab');
  const group = await ensureCodexGroupForTab(tab, { ...payload, groupTitle: options.title, groupColor: options.color });
  const loaded = await waitForTabComplete(tab.id);
  await storageSet({ codexTabId: loaded.id, codexWindowId: loaded.windowId });
  return tabInfo(loaded, { group });
}

async function groupStatus(payload = {}) {
  const options = groupOptions(payload);
  const groups = await listTabGroups();
  const codexGroups = groups.filter((group) => group.title === options.title);
  const groupIds = new Set(codexGroups.map((group) => group.id));
  const tabs = (await chrome.tabs.query({})).filter((tab) => groupIds.has(tab.groupId));

  return {
    configuredGroup: options,
    groups: codexGroups,
    tabs: tabs.map((tab) => tabInfo(tab, { groups: codexGroups })),
  };
}

function requireConfirmed(payload, action) {
  if (!payload.confirmed) throw new Error(`${action} requires confirmed=true`);
}

function requireSensitiveConfirmed(payload, action) {
  if (!payload.confirmSensitive) {
    throw new Error(`${action} requires confirmSensitive=true because it can expose private browser data`);
  }
}

async function activateTab(payload) {
  const tab = await getTargetTab(payload);
  await chrome.tabs.update(tab.id, { active: true });
  if (payload.focusWindow) {
    await chrome.windows.update(tab.windowId, { focused: true });
  }
  return tabInfo(await chrome.tabs.get(tab.id));
}

async function closeTab(payload) {
  requireConfirmed(payload, 'closeTab');
  const tab = await getTargetTab(payload);
  await chrome.tabs.remove(tab.id);
  const { codexTabId } = await storageGet(['codexTabId']);
  if (codexTabId === tab.id) {
    await storageRemove(['codexTabId', 'codexWindowId']);
  }
  return { closed: true, tab: tabInfo(tab) };
}

async function closeGroup(payload) {
  requireConfirmed(payload, 'closeGroup');
  const tabs = await getCodexGroupTabs(payload);
  if (!tabs.length) return { closed: 0, tabs: [] };
  await chrome.tabs.remove(tabs.map((tab) => tab.id));
  await storageRemove(['codexTabId', 'codexWindowId', 'codexGroupId', 'codexGroupWindowId']);
  return { closed: tabs.length, tabs: tabs.map((tab) => tabInfo(tab)) };
}

async function goBack(payload) {
  const tab = await getTargetTab(payload);
  await chrome.tabs.goBack(tab.id);
  const loaded = await waitForTabComplete(tab.id, Number(payload.timeoutMs || 25_000));
  return tabInfo(loaded);
}

async function goForward(payload) {
  const tab = await getTargetTab(payload);
  await chrome.tabs.goForward(tab.id);
  const loaded = await waitForTabComplete(tab.id, Number(payload.timeoutMs || 25_000));
  return tabInfo(loaded);
}

async function reloadTab(payload) {
  const tab = await getTargetTab(payload);
  await chrome.tabs.reload(tab.id, { bypassCache: Boolean(payload.bypassCache) });
  const loaded = await waitForTabComplete(tab.id, Number(payload.timeoutMs || 25_000));
  return tabInfo(loaded);
}

async function waitForSelector(payload) {
  if (!payload.selector) throw new Error('waitForSelector requires selector');
  const tab = await getTargetTab(payload);
  const result = await execute(tab.id, waitForSelectorInPage, [{
    selector: payload.selector,
    timeoutMs: Number(payload.timeoutMs || 10_000),
    visible: payload.visible !== false,
  }]);
  return { tab: tabInfo(await chrome.tabs.get(tab.id)), ...result };
}

function debuggerTarget(tabId) {
  return { tabId };
}

async function attachDebugger(tabId) {
  const session = traceSessions.get(tabId);
  if (session?.active && session?.attached) return { detachAfter: false };
  await chrome.debugger.attach(debuggerTarget(tabId), DEBUGGER_PROTOCOL_VERSION);
  return { detachAfter: true };
}

async function detachDebugger(tabId) {
  await chrome.debugger.detach(debuggerTarget(tabId));
}

async function sendDebuggerCommand(tabId, method, params = {}) {
  return chrome.debugger.sendCommand(debuggerTarget(tabId), method, params);
}

async function withDebugger(tabId, fn) {
  if (!chrome.debugger) throw new Error('chrome.debugger API is unavailable; reload the extension after granting the debugger permission');
  const { detachAfter } = await attachDebugger(tabId);
  try {
    return await fn();
  } finally {
    if (detachAfter) {
      await detachDebugger(tabId).catch(() => {});
    }
  }
}

function pushTraceEvent(tabId, event) {
  const session = traceSessions.get(tabId);
  if (!session?.active || !event) return;
  if (!session.includeExtensionEvents && String(event.url || '').startsWith('chrome-extension://')) return;
  session.events.push({
    ...event,
    capturedAt: new Date().toISOString(),
  });
  if (session.events.length > session.maxEvents) {
    session.events.splice(0, session.events.length - session.maxEvents);
  }
}

function recordDebuggerEvent(source, method, params = {}) {
  const tabId = source?.tabId;
  if (!tabId) return;

  if (method === 'Runtime.consoleAPICalled') {
    pushTraceEvent(tabId, {
      kind: 'console',
      level: params.type,
      text: (params.args || []).map((arg) => arg.description || arg.value || arg.type).join(' '),
      url: params.stackTrace?.callFrames?.[0]?.url,
      lineNumber: params.stackTrace?.callFrames?.[0]?.lineNumber,
    });
    return;
  }

  if (method === 'Log.entryAdded') {
    const entry = params.entry || {};
    pushTraceEvent(tabId, {
      kind: 'log',
      level: entry.level,
      source: entry.source,
      text: entry.text,
      url: entry.url,
      lineNumber: entry.lineNumber,
    });
    return;
  }

  if (method === 'Network.requestWillBeSent') {
    const request = params.request || {};
    pushTraceEvent(tabId, {
      kind: 'network.request',
      requestId: params.requestId,
      method: request.method,
      url: request.url,
      resourceType: params.type,
      initiatorType: params.initiator?.type,
    });
    return;
  }

  if (method === 'Network.responseReceived') {
    const response = params.response || {};
    const session = traceSessions.get(tabId);
    if (session?.responseInfo) {
      session.responseInfo.set(params.requestId, {
        url: response.url,
        status: response.status,
        mimeType: response.mimeType,
        resourceType: params.type,
      });
    }
    pushTraceEvent(tabId, {
      kind: 'network.response',
      requestId: params.requestId,
      url: response.url,
      status: response.status,
      statusText: response.statusText,
      mimeType: response.mimeType,
      resourceType: params.type,
      fromDiskCache: response.fromDiskCache,
      fromServiceWorker: response.fromServiceWorker,
    });
    return;
  }

  if (method === 'Network.loadingFinished') {
    captureRelevantResponseBody(tabId, params.requestId);
    return;
  }

  if (method === 'Network.loadingFailed') {
    pushTraceEvent(tabId, {
      kind: 'network.failed',
      requestId: params.requestId,
      resourceType: params.type,
      errorText: params.errorText,
      canceled: params.canceled,
    });
  }
}

async function captureRelevantResponseBody(tabId, requestId) {
  const session = traceSessions.get(tabId);
  const info = session?.responseInfo?.get(requestId);
  if (!session?.active || !info) return;

  const url = String(info.url || '');
  const isFileManagerRequest =
    url.includes('/filemanager/')
    || url.includes('/fmd/api/')
    || url.includes('/fmi/');
  const isJson = String(info.mimeType || '').includes('json');
  if (!isFileManagerRequest || !isJson) return;

  try {
    const body = await sendDebuggerCommand(tabId, 'Network.getResponseBody', { requestId });
    pushTraceEvent(tabId, {
      kind: 'network.body',
      requestId,
      url: info.url,
      status: info.status,
      mimeType: info.mimeType,
      base64Encoded: Boolean(body.base64Encoded),
      body: String(body.body || '').slice(0, 20_000),
    });
  } catch (error) {
    pushTraceEvent(tabId, {
      kind: 'network.body.error',
      requestId,
      url: info.url,
      error: String(error?.message || error),
    });
  } finally {
    session.responseInfo?.delete(requestId);
  }
}

async function traceStart(payload) {
  requireConfirmed(payload, 'traceStart');
  const tab = await getTargetTab(payload);
  if (traceSessions.get(tab.id)?.active) {
    return traceSummary(tab.id, tab);
  }

  await chrome.debugger.attach(debuggerTarget(tab.id), DEBUGGER_PROTOCOL_VERSION);
  const session = {
    tabId: tab.id,
    attached: true,
    active: true,
    startedAt: new Date().toISOString(),
    maxEvents: Math.min(Math.max(Number(payload.maxEvents || MAX_TRACE_EVENTS), 50), 2_000),
    includeExtensionEvents: Boolean(payload.includeExtensionEvents),
    responseInfo: new Map(),
    events: [],
  };
  traceSessions.set(tab.id, session);

  try {
    if (payload.network !== false) await sendDebuggerCommand(tab.id, 'Network.enable');
    if (payload.console !== false) {
      await sendDebuggerCommand(tab.id, 'Runtime.enable');
      await sendDebuggerCommand(tab.id, 'Log.enable');
    }
  } catch (error) {
    traceSessions.delete(tab.id);
    await detachDebugger(tab.id).catch(() => {});
    throw error;
  }

  return traceSummary(tab.id, tab);
}

function traceSummary(tabId, tab = null) {
  const session = traceSessions.get(tabId);
  return {
    active: Boolean(session?.active),
    tab: tab ? tabInfo(tab) : { id: tabId },
    startedAt: session?.startedAt,
    eventCount: session?.events?.length || 0,
    maxEvents: session?.maxEvents || MAX_TRACE_EVENTS,
  };
}

async function traceEvents(payload) {
  const tab = await getTargetTab(payload);
  const session = traceSessions.get(tab.id);
  if (!session) return { active: false, tab: tabInfo(tab), events: [] };
  const limit = Math.min(Math.max(Number(payload.limit || 100), 1), session.maxEvents);
  return {
    ...traceSummary(tab.id, tab),
    events: session.events.slice(-limit),
  };
}

async function traceStop(payload) {
  const tab = await getTargetTab(payload);
  const session = traceSessions.get(tab.id);
  if (!session) return { active: false, tab: tabInfo(tab), events: [] };
  session.active = false;
  session.attached = false;
  session.stoppedAt = new Date().toISOString();
  await detachDebugger(tab.id).catch(() => {});
  traceSessions.delete(tab.id);
  const limit = Math.min(Math.max(Number(payload.limit || 100), 1), session.maxEvents);
  return {
    active: false,
    tab: tabInfo(tab),
    startedAt: session.startedAt,
    stoppedAt: session.stoppedAt,
    eventCount: session.events.length,
    events: session.events.slice(-limit),
  };
}

async function execute(tabId, func, args = []) {
  const frames = await chrome.scripting.executeScript({
    target: { tabId },
    func,
    args,
    world: 'MAIN',
  });
  return frames?.[0]?.result;
}

async function evalPage(payload) {
  const tab = await getTargetTab(payload);
  const code = String(payload.code || '');
  if (!code.trim()) throw new Error('evalPage requires code');
  const result = await execute(tab.id, async (source) => {
    const fn = new Function(`return (async () => { ${source} })();`);
    return await fn();
  }, [code]);
  return { tab: tabInfo(tab), result };
}

async function snapshot(payload) {
  const tab = await getTargetTab(payload);
  const result = await execute(tab.id, collectSnapshot, [payload]);
  return { tab: tabInfo(tab), ...result };
}

async function pageText(payload) {
  const tab = await getTargetTab(payload);
  const result = await execute(tab.id, collectText, [payload]);
  return { tab: tabInfo(tab), ...result };
}

async function pageHTML(payload) {
  const tab = await getTargetTab(payload);
  const result = await execute(tab.id, collectHTML, [payload]);
  return { tab: tabInfo(tab), ...result };
}

async function screenshot(payload) {
  const tab = await getTargetTab(payload);

  if (payload.fullPage || payload.selector) {
    const result = await withDebugger(tab.id, async () => {
      await sendDebuggerCommand(tab.id, 'Page.enable');
      let clip;
      if (payload.selector) {
        const rect = await execute(tab.id, elementClipForSelector, [payload.selector]);
        clip = {
          x: rect.x,
          y: rect.y,
          width: Math.max(rect.width, 1),
          height: Math.max(rect.height, 1),
          scale: 1,
        };
      }

      const capture = await sendDebuggerCommand(tab.id, 'Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: Boolean(payload.fullPage || payload.selector),
        ...(clip ? { clip } : {}),
      });

      return `data:image/png;base64,${capture.data}`;
    });

    const latest = await chrome.tabs.get(tab.id);
    return {
      tab: tabInfo(latest),
      dataUrl: result,
      selector: payload.selector,
      fullPage: Boolean(payload.fullPage),
      capturedAt: new Date().toISOString(),
    };
  }

  await chrome.tabs.update(tab.id, { active: true });
  await delay(300);
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  const latest = await chrome.tabs.get(tab.id);
  return {
    tab: tabInfo(latest),
    dataUrl,
    capturedAt: new Date().toISOString(),
  };
}

async function scroll(payload) {
  const tab = await getTargetTab(payload);
  return execute(tab.id, ({ x, y }) => {
    window.scrollBy(Number(x || 0), Number(y || 0));
    return {
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
    };
  }, [{ x: payload.x || 0, y: payload.y || 0 }]);
}

async function click(payload) {
  if (!payload.confirmed) throw new Error('click requires confirmed=true');
  if (!payload.selector) throw new Error('click requires selector');
  const tab = await getTargetTab(payload);
  return execute(tab.id, ({ selector }) => {
    const element = document.querySelector(selector);
    if (!element) throw new Error(`No element matches selector: ${selector}`);
    element.click();
    return { clicked: selector, url: location.href, title: document.title };
  }, [{ selector: payload.selector }]);
}

async function clickAt(payload) {
  requireConfirmed(payload, 'clickAt');
  const tab = await getTargetTab(payload);
  const x = Number(payload.x);
  const y = Number(payload.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('clickAt requires numeric x and y');

  if (payload.trusted) {
    return withDebugger(tab.id, async () => {
      await sendDebuggerCommand(tab.id, 'Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x,
        y,
        button: payload.button || 'left',
        clickCount: 1,
      });
      await sendDebuggerCommand(tab.id, 'Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x,
        y,
        button: payload.button || 'left',
        clickCount: 1,
      });
      return { clicked: { x, y, trusted: true }, tab: tabInfo(await chrome.tabs.get(tab.id)) };
    });
  }

  const result = await execute(tab.id, clickAtInPage, [{ x, y, button: payload.button || 'left' }]);
  return { tab: tabInfo(await chrome.tabs.get(tab.id)), ...result };
}

async function hover(payload) {
  const tab = await getTargetTab(payload);
  const x = payload.x === undefined ? undefined : Number(payload.x);
  const y = payload.y === undefined ? undefined : Number(payload.y);

  if (payload.trusted) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('trusted hover requires numeric x and y');
    return withDebugger(tab.id, async () => {
      await sendDebuggerCommand(tab.id, 'Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x,
        y,
      });
      return { hovered: { x, y, trusted: true }, tab: tabInfo(await chrome.tabs.get(tab.id)) };
    });
  }

  const result = await execute(tab.id, hoverInPage, [{
    selector: payload.selector,
    x,
    y,
  }]);
  return { tab: tabInfo(await chrome.tabs.get(tab.id)), ...result };
}

async function typeInto(payload) {
  if (!payload.confirmed) throw new Error('type requires confirmed=true');
  if (!payload.selector) throw new Error('type requires selector');
  if (typeof payload.text !== 'string') throw new Error('type requires text');
  const tab = await getTargetTab(payload);

  if (payload.trusted) {
    await execute(tab.id, ({ selector }) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`No element matches selector: ${selector}`);
      element.focus();
      return true;
    }, [{ selector: payload.selector }]);
    return withDebugger(tab.id, async () => {
      await sendDebuggerCommand(tab.id, 'Input.insertText', { text: payload.text });
      return { typed: payload.selector, length: payload.text.length, trusted: true, tab: tabInfo(await chrome.tabs.get(tab.id)) };
    });
  }

  return execute(tab.id, ({ selector, text }) => {
    const element = document.querySelector(selector);
    if (!element) throw new Error(`No element matches selector: ${selector}`);
    element.focus();
    element.value = text;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return { typed: selector, length: text.length, url: location.href, title: document.title };
  }, [{ selector: payload.selector, text: payload.text }]);
}

async function pressKey(payload) {
  requireConfirmed(payload, 'press');
  const tab = await getTargetTab(payload);
  const key = String(payload.key || '');
  if (!key) throw new Error('press requires key');

  if (payload.selector) {
    await execute(tab.id, ({ selector }) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`No element matches selector: ${selector}`);
      element.focus();
      return true;
    }, [{ selector: payload.selector }]);
  }

  if (payload.trusted !== false) {
    return withDebugger(tab.id, async () => {
      const event = keyEventPayload(key, payload);
      await sendDebuggerCommand(tab.id, 'Input.dispatchKeyEvent', { ...event, type: 'keyDown' });
      if (event.text) {
        await sendDebuggerCommand(tab.id, 'Input.dispatchKeyEvent', { ...event, type: 'char' });
      }
      await sendDebuggerCommand(tab.id, 'Input.dispatchKeyEvent', { ...event, type: 'keyUp' });
      return { pressed: key, trusted: true, tab: tabInfo(await chrome.tabs.get(tab.id)) };
    });
  }

  const result = await execute(tab.id, pressKeyInPage, [{
    key,
    code: payload.code,
    ctrlKey: Boolean(payload.ctrlKey),
    metaKey: Boolean(payload.metaKey),
    altKey: Boolean(payload.altKey),
    shiftKey: Boolean(payload.shiftKey),
  }]);
  return { tab: tabInfo(await chrome.tabs.get(tab.id)), ...result };
}

async function selectOption(payload) {
  requireConfirmed(payload, 'select');
  if (!payload.selector) throw new Error('select requires selector');
  const tab = await getTargetTab(payload);
  const result = await execute(tab.id, selectOptionInPage, [{
    selector: payload.selector,
    value: payload.value,
    label: payload.label,
    index: payload.index === undefined ? undefined : Number(payload.index),
  }]);
  return { tab: tabInfo(await chrome.tabs.get(tab.id)), ...result };
}

function keyEventPayload(key, payload = {}) {
  const text = key.length === 1 ? key : undefined;
  const modifiers = [
    payload.altKey ? 1 : 0,
    payload.ctrlKey ? 2 : 0,
    payload.metaKey ? 4 : 0,
    payload.shiftKey ? 8 : 0,
  ].reduce((sum, value) => sum + value, 0);
  const code = payload.code || keyCodeFor(key);
  return {
    key,
    code,
    text,
    unmodifiedText: text,
    modifiers,
    windowsVirtualKeyCode: virtualKeyCodeFor(key),
    nativeVirtualKeyCode: virtualKeyCodeFor(key),
  };
}

function keyCodeFor(key) {
  const named = {
    Enter: 'Enter',
    Escape: 'Escape',
    Tab: 'Tab',
    Backspace: 'Backspace',
    Delete: 'Delete',
    ArrowUp: 'ArrowUp',
    ArrowDown: 'ArrowDown',
    ArrowLeft: 'ArrowLeft',
    ArrowRight: 'ArrowRight',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
  };
  if (named[key]) return named[key];
  if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`;
  if (/^[0-9]$/.test(key)) return `Digit${key}`;
  return key;
}

function virtualKeyCodeFor(key) {
  const named = {
    Enter: 13,
    Escape: 27,
    Tab: 9,
    Backspace: 8,
    Delete: 46,
    ArrowUp: 38,
    ArrowDown: 40,
    ArrowLeft: 37,
    ArrowRight: 39,
    Home: 36,
    End: 35,
    PageUp: 33,
    PageDown: 34,
  };
  if (named[key]) return named[key];
  if (key.length === 1) return key.toUpperCase().charCodeAt(0);
  return 0;
}

async function historySearch(payload) {
  requireConfirmed(payload, 'historySearch');
  if (!chrome.history) throw new Error('chrome.history API is unavailable; reload after granting the history permission');
  const results = await chrome.history.search({
    text: String(payload.query || ''),
    maxResults: Math.min(Math.max(Number(payload.limit || 25), 1), 200),
    startTime: payload.startTime ? Number(payload.startTime) : undefined,
    endTime: payload.endTime ? Number(payload.endTime) : undefined,
  });
  return {
    query: payload.query || '',
    results: results.map((item) => ({
      id: item.id,
      title: item.title,
      url: item.url,
      lastVisitTime: item.lastVisitTime,
      visitCount: item.visitCount,
      typedCount: item.typedCount,
    })),
  };
}

async function bookmarksSearch(payload) {
  requireConfirmed(payload, 'bookmarksSearch');
  if (!chrome.bookmarks) throw new Error('chrome.bookmarks API is unavailable; reload after granting the bookmarks permission');
  const query = String(payload.query || '');
  const results = query ? await chrome.bookmarks.search(query) : await chrome.bookmarks.getTree();
  const flattened = flattenBookmarks(results).slice(0, Math.min(Math.max(Number(payload.limit || 50), 1), 200));
  return { query, results: flattened };
}

function flattenBookmarks(nodes, output = []) {
  for (const node of nodes || []) {
    if (node.url) {
      output.push({
        id: node.id,
        parentId: node.parentId,
        title: node.title,
        url: node.url,
        dateAdded: node.dateAdded,
      });
    }
    if (node.children) flattenBookmarks(node.children, output);
  }
  return output;
}

async function cookiesList(payload) {
  requireConfirmed(payload, 'cookiesList');
  if (!chrome.cookies) throw new Error('chrome.cookies API is unavailable; reload after granting the cookies permission');
  if (payload.includeValues) requireSensitiveConfirmed(payload, 'cookiesList includeValues');
  if (!payload.url && !payload.domain && !payload.name) requireSensitiveConfirmed(payload, 'cookiesList without url/domain/name');
  const query = {};
  if (payload.url) query.url = payload.url;
  if (payload.domain) query.domain = payload.domain;
  if (payload.name) query.name = payload.name;
  const cookies = await chrome.cookies.getAll(query);
  const limit = Math.min(Math.max(Number(payload.limit || 50), 1), 500);
  return {
    query,
    count: cookies.length,
    cookies: cookies.slice(0, limit).map((cookie) => ({
      name: cookie.name,
      value: payload.includeValues ? cookie.value : undefined,
      domain: cookie.domain,
      path: cookie.path,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite,
      session: cookie.session,
      expirationDate: cookie.expirationDate,
      storeId: cookie.storeId,
    })),
  };
}

async function storageSnapshot(payload) {
  requireConfirmed(payload, 'storageSnapshot');
  if (payload.includeValues) requireSensitiveConfirmed(payload, 'storageSnapshot includeValues');
  const tab = await getTargetTab(payload);
  const result = await execute(tab.id, collectStorageSnapshot, [{
    includeValues: Boolean(payload.includeValues),
    maxValueChars: Math.min(Math.max(Number(payload.maxValueChars || 500), 50), 5_000),
  }]);
  return { tab: tabInfo(tab), ...result };
}

async function fetchUrl(payload) {
  requireConfirmed(payload, 'fetchUrl');
  if (!payload.url) throw new Error('fetchUrl requires url');
  if (payload.credentials === 'include') requireSensitiveConfirmed(payload, 'fetchUrl credentials=include');
  const response = await fetch(payload.url, {
    method: String(payload.method || 'GET').toUpperCase(),
    headers: payload.headers && typeof payload.headers === 'object' ? payload.headers : undefined,
    body: payload.body === undefined ? undefined : String(payload.body),
    credentials: payload.credentials === 'include' ? 'include' : 'omit',
  });
  const text = await response.text();
  const maxChars = Math.min(Math.max(Number(payload.maxChars || 20_000), 100), 200_000);
  return {
    url: response.url,
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    headers: Object.fromEntries(Array.from(response.headers.entries()).slice(0, 100)),
    text: text.slice(0, maxChars),
    truncated: text.length > maxChars,
    length: text.length,
  };
}

function groupInfo(group) {
  return {
    id: group.id,
    windowId: group.windowId,
    title: group.title,
    color: group.color,
    collapsed: group.collapsed,
  };
}

function tabInfo(tab, options = {}) {
  const groups = options.groups || [];
  const group = options.group || groups.find((candidate) => candidate.id === tab.groupId) || null;
  return {
    id: tab.id,
    windowId: tab.windowId,
    index: tab.index,
    active: tab.active,
    groupId: Number.isInteger(tab.groupId) ? tab.groupId : undefined,
    group: group ? groupInfo(group) : null,
    title: tab.title,
    url: tab.url,
    status: tab.status,
  };
}

function collectText(options = {}) {
  const maxChars = Number(options.maxChars || 50_000);
  const text = (document.body?.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
  return {
    url: location.href,
    title: document.title,
    text: text.slice(0, maxChars),
    truncated: text.length > maxChars,
    length: text.length,
  };
}

function collectHTML(options = {}) {
  const maxChars = Number(options.maxChars || 100_000);
  const element = options.selector ? document.querySelector(options.selector) : document.documentElement;
  if (!element) throw new Error(`No element matches selector: ${options.selector}`);
  const html = options.outer === false ? element.innerHTML : element.outerHTML;
  return {
    url: location.href,
    title: document.title,
    selector: options.selector || 'html',
    html: html.slice(0, maxChars),
    truncated: html.length > maxChars,
    length: html.length,
  };
}

async function waitForSelectorInPage(options = {}) {
  const selector = String(options.selector || '');
  const timeoutMs = Number(options.timeoutMs || 10_000);
  const visible = options.visible !== false;
  const started = Date.now();

  const isVisible = (element) => {
    if (!visible) return true;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.visibility !== 'hidden'
      && style.display !== 'none'
      && rect.width > 0
      && rect.height > 0;
  };

  while (Date.now() - started < timeoutMs) {
    const element = document.querySelector(selector);
    if (element && isVisible(element)) {
      const rect = element.getBoundingClientRect();
      return {
        matched: true,
        selector,
        waitedMs: Date.now() - started,
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        text: String(element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 500),
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Timed out waiting for selector: ${selector}`);
}

function elementClipForSelector(selector) {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`No element matches selector: ${selector}`);
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) throw new Error(`Element has empty bounds: ${selector}`);
  return {
    x: Math.round(rect.left + window.scrollX),
    y: Math.round(rect.top + window.scrollY),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

function clickAtInPage(options = {}) {
  const x = Number(options.x);
  const y = Number(options.y);
  const element = document.elementFromPoint(x, y);
  if (!element) throw new Error(`No element at coordinates ${x},${y}`);
  const eventOptions = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: x,
    clientY: y,
    button: options.button === 'right' ? 2 : 0,
  };
  element.dispatchEvent(new MouseEvent('mouseover', eventOptions));
  element.dispatchEvent(new MouseEvent('mousemove', eventOptions));
  element.dispatchEvent(new MouseEvent('mousedown', eventOptions));
  element.dispatchEvent(new MouseEvent('mouseup', eventOptions));
  element.dispatchEvent(new MouseEvent('click', eventOptions));
  return {
    clicked: { x, y, trusted: false },
    tag: element.tagName.toLowerCase(),
    text: String(element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 300),
    url: location.href,
    title: document.title,
  };
}

function hoverInPage(options = {}) {
  let element = null;
  let x = Number(options.x);
  let y = Number(options.y);

  if (options.selector) {
    element = document.querySelector(options.selector);
    if (!element) throw new Error(`No element matches selector: ${options.selector}`);
    const rect = element.getBoundingClientRect();
    x = Number.isFinite(x) ? x : rect.left + rect.width / 2;
    y = Number.isFinite(y) ? y : rect.top + rect.height / 2;
  } else {
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('hover requires selector or numeric x and y');
    element = document.elementFromPoint(x, y);
    if (!element) throw new Error(`No element at coordinates ${x},${y}`);
  }

  const eventOptions = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: x,
    clientY: y,
  };
  element.dispatchEvent(new MouseEvent('mouseover', eventOptions));
  element.dispatchEvent(new MouseEvent('mouseenter', eventOptions));
  element.dispatchEvent(new MouseEvent('mousemove', eventOptions));
  return {
    hovered: { x: Math.round(x), y: Math.round(y), trusted: false },
    tag: element.tagName.toLowerCase(),
    text: String(element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 300),
  };
}

function pressKeyInPage(options = {}) {
  const eventOptions = {
    key: options.key,
    code: options.code || options.key,
    bubbles: true,
    cancelable: true,
    ctrlKey: Boolean(options.ctrlKey),
    metaKey: Boolean(options.metaKey),
    altKey: Boolean(options.altKey),
    shiftKey: Boolean(options.shiftKey),
  };
  const target = document.activeElement || document.body;
  target.dispatchEvent(new KeyboardEvent('keydown', eventOptions));
  target.dispatchEvent(new KeyboardEvent('keyup', eventOptions));
  return {
    pressed: options.key,
    trusted: false,
    activeTag: target?.tagName?.toLowerCase?.() || null,
    url: location.href,
    title: document.title,
  };
}

function selectOptionInPage(options = {}) {
  const select = document.querySelector(options.selector);
  if (!select) throw new Error(`No element matches selector: ${options.selector}`);
  if (select.tagName.toLowerCase() !== 'select') throw new Error(`Element is not a select: ${options.selector}`);

  let option = null;
  if (options.value !== undefined) {
    option = Array.from(select.options).find((candidate) => candidate.value === String(options.value));
  } else if (options.label !== undefined) {
    option = Array.from(select.options).find((candidate) => candidate.label === String(options.label) || candidate.text === String(options.label));
  } else if (Number.isInteger(options.index)) {
    option = select.options[options.index];
  }

  if (!option) throw new Error('No matching option found');
  select.value = option.value;
  select.dispatchEvent(new Event('input', { bubbles: true }));
  select.dispatchEvent(new Event('change', { bubbles: true }));
  return {
    selected: {
      selector: options.selector,
      value: option.value,
      label: option.label || option.text,
      index: option.index,
    },
    url: location.href,
    title: document.title,
  };
}

function collectStorageSnapshot(options = {}) {
  const maxValueChars = Number(options.maxValueChars || 500);
  const serialize = (storage) => Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter(Boolean)
    .map((key) => {
      const value = storage.getItem(key);
      return {
        key,
        value: options.includeValues ? String(value).slice(0, maxValueChars) : undefined,
        truncated: options.includeValues ? String(value).length > maxValueChars : undefined,
      };
    });

  return {
    url: location.href,
    title: document.title,
    localStorage: serialize(window.localStorage),
    sessionStorage: serialize(window.sessionStorage),
  };
}

function collectSnapshot(options = {}) {
  const maxChars = Number(options.maxChars || 50_000);
  const text = (document.body?.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
  const isVisible = (element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.visibility !== 'hidden'
      && style.display !== 'none'
      && rect.width > 0
      && rect.height > 0;
  };
  const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const selectorFor = (element) => {
    if (element.id) return `#${CSS.escape(element.id)}`;
    const testId = element.getAttribute('data-testid') || element.getAttribute('data-test');
    if (testId) return `[data-testid="${CSS.escape(testId)}"]`;
    const aria = element.getAttribute('aria-label');
    if (aria) return `${element.tagName.toLowerCase()}[aria-label="${CSS.escape(aria)}"]`;
    const href = element.getAttribute('href');
    if (href && element.tagName.toLowerCase() === 'a') {
      return `a[href="${CSS.escape(href)}"]`;
    }
    return element.tagName.toLowerCase();
  };
  const elementInfo = (element) => {
    const rect = element.getBoundingClientRect();
    return {
      tag: element.tagName.toLowerCase(),
      selector: selectorFor(element),
      text: clean(element.innerText || element.textContent).slice(0, 300),
      ariaLabel: element.getAttribute('aria-label'),
      role: element.getAttribute('role'),
      href: element.getAttribute('href'),
      type: element.getAttribute('type'),
      name: element.getAttribute('name'),
      placeholder: element.getAttribute('placeholder'),
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    };
  };

  const headings = Array.from(document.querySelectorAll('h1,h2,h3'))
    .filter(isVisible)
    .slice(0, 80)
    .map((element) => ({
      level: element.tagName.toLowerCase(),
      text: clean(element.innerText || element.textContent),
    }));

  const elements = Array.from(document.querySelectorAll('a,button,input,textarea,select,[role="button"],[role="link"],[tabindex]'))
    .filter(isVisible)
    .slice(0, 250)
    .map(elementInfo);

  const tables = Array.from(document.querySelectorAll('table'))
    .filter(isVisible)
    .slice(0, 10)
    .map((table) => Array.from(table.querySelectorAll('tr'))
      .slice(0, 25)
      .map((row) => Array.from(row.querySelectorAll('th,td'))
        .slice(0, 12)
        .map((cell) => clean(cell.innerText || cell.textContent).slice(0, 200))));

  const jsonLd = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
    .slice(0, 20)
    .map((script) => script.textContent?.slice(0, 5000) || '');

  return {
    url: location.href,
    title: document.title,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      devicePixelRatio: window.devicePixelRatio,
    },
    headings,
    elements,
    tables,
    jsonLd,
    text: text.slice(0, maxChars),
    textLength: text.length,
    truncated: text.length > maxChars,
  };
}
