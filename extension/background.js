import {
  clickAtInPage,
  collectExtract,
  collectHTML,
  collectObserve,
  collectSnapshot,
  collectStorageSnapshot,
  collectText,
  elementClipForSelector,
  fillFormInPage,
  hoverInPage,
  listSelectOptionsInPage,
  pressKeyInPage,
  selectOptionInPage,
  waitForSelectorInPage,
} from './page-scripts.js';
import { extensionErrorCode, extensionErrorDetails } from './extension-errors.js';
import { startBridge } from './offscreen-lifecycle.js';
import { closeTabsWithGroupPersistenceMitigation } from './tab-cleanup.js';
import { groupInfo, tabInfo } from './tab-info.js';
import {
  recordDebuggerDetach,
  recordDebuggerEvent,
  sendDebuggerCommand,
  startTraceForTab,
  stopTraceForTab,
  traceEventsForTab,
  traceSummaryForTab,
  withDebugger,
} from './debugger-session.js';
import { requireConfirmed, requireSensitiveConfirmed } from './safety-gates.js';
import { groupOptions } from './workspace-policy.js';
import { keyEventPayload } from './keyboard-events.js';
import {
  ensureCodexGroupForTab,
  getCodexGroupTabs,
  getLastFocusedTab,
  getTargetTab,
  listTabGroups,
  storageGet,
  storageRemove,
  storageSet,
} from './workspace-tabs.js';

const MAX_USER_PROMPT_CHOICES = 8;

const pendingUserPrompts = new Map();

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
    recordDebuggerDetach(source, reason);
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'codex-bridge-get-user-prompt') {
    const prompt = pendingUserPrompts.get(message.requestId);
    sendResponse({
      ok: Boolean(prompt),
      prompt: prompt ? publicUserPrompt(prompt) : null,
    });
    return undefined;
  }

  if (message?.type === 'codex-bridge-user-answer') {
    completeUserPrompt(message.requestId, {
      value: message.value,
      text: message.text,
      choice: message.choice,
      canceled: Boolean(message.canceled),
      reason: message.reason,
    });
    sendResponse({ ok: true });
    return undefined;
  }

  if (message?.type !== 'codex-bridge-command') return undefined;

  dispatch(message.action, message.payload || {})
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({
      ok: false,
      code: extensionErrorCode(error),
      error: String(error?.message || error),
      details: extensionErrorDetails(error),
    }));

  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  for (const prompt of pendingUserPrompts.values()) {
    if (prompt.tabId === tabId) {
      completeUserPrompt(prompt.id, {
        canceled: true,
        reason: 'prompt tab closed',
      });
    }
  }
});

async function dispatch(action, payload) {
  switch (action) {
    case 'windows':
      return listWindows(payload);
    case 'tabs':
      return listTabs(payload);
    case 'group':
      return groupStatus(payload);
    case 'workspace':
      return workspaceStatus(payload);
    case 'setWorkspace':
      return setWorkspace(payload);
    case 'clearWorkspace':
      return clearWorkspace(payload);
    case 'ensureTab':
      return ensureCodexTab(payload);
    case 'adoptTab':
      return adoptTab(payload);
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
    case 'observe':
      return observe(payload);
    case 'findElements':
      return findElements(payload);
    case 'extractPage':
      return extractPage(payload);
    case 'snapshot':
      return snapshot(payload);
    case 'text':
      return pageText(payload);
    case 'html':
      return pageHTML(payload);
    case 'screenshot':
      return screenshot(payload);
    case 'printPdf':
      return printPdf(payload);
    case 'listSelectOptions':
      return listSelectOptions(payload);
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
    case 'fillForm':
      return fillForm(payload);
    case 'handleDialog':
      return handleDialog(payload);
    case 'uploadFile':
      return uploadFile(payload);
    case 'traceStart':
      return traceStart(payload);
    case 'traceSummary':
      return traceSummaryCommand(payload);
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
    case 'askUser':
      return askUser(payload);
    case 'reloadExtension':
      return reloadExtension(payload);
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

async function reloadExtension(payload = {}) {
  requireConfirmed(payload, 'reloadExtension');
  setTimeout(() => chrome.runtime.reload(), 100);
  return {
    reloading: true,
    message: 'Codex Chrome Bridge extension reload requested',
  };
}

async function listTabs(payload = {}) {
  if (payload.includeAll) requireConfirmed(payload, 'tabs includeAll');
  const tabs = await chrome.tabs.query({});
  const groups = await listTabGroups();
  const options = await groupOptions(payload);
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

async function listWindows(payload = {}) {
  if (payload.includeAll) requireConfirmed(payload, 'windows includeAll');
  const windows = await chrome.windows.getAll({
    populate: true,
    windowTypes: ['normal'],
  });
  const groups = await listTabGroups();
  const options = await groupOptions(payload);
  const scoped = !payload.includeAll;

  const windowInfos = windows.map((window) => {
    const windowGroups = groups.filter((group) => group.windowId === window.id);
    const codexGroups = windowGroups.filter((group) => group.title === options.title);
    const visibleGroups = scoped ? codexGroups : windowGroups;
    const visibleGroupIds = new Set(visibleGroups.map((group) => group.id));
    const visibleTabs = scoped
      ? (window.tabs || []).filter((tab) => visibleGroupIds.has(tab.groupId))
      : (window.tabs || []);

    return {
      id: window.id,
      focused: window.focused,
      top: window.top,
      left: window.left,
      width: window.width,
      height: window.height,
      state: window.state,
      type: window.type,
      groups: visibleGroups.map(groupInfo),
      tabs: visibleTabs.map((tab) => tabInfo(tab, { groups: visibleGroups })),
      tabCount: visibleTabs.length,
    };
  }).filter((window) => !scoped || window.groups.length || window.tabs.length);

  return {
    scope: scoped ? 'codex-group' : 'all-windows',
    configuredGroup: options,
    windowCount: windowInfos.length,
    tabCount: windowInfos.reduce((sum, window) => sum + window.tabCount, 0),
    windows: windowInfos,
  };
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

async function adoptTab(payload = {}) {
  requireConfirmed(payload, 'adoptTab');
  const tab = payload.tabId
    ? await chrome.tabs.get(Number(payload.tabId))
    : await getLastFocusedTab();
  const group = await ensureCodexGroupForTab(tab, payload);
  const latest = await chrome.tabs.get(tab.id);
  await storageSet({ codexTabId: latest.id, codexWindowId: latest.windowId });
  return {
    adopted: true,
    tab: tabInfo(latest, { group }),
  };
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
  const options = await groupOptions(payload);
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
  const options = await groupOptions(payload);
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

async function workspaceStatus(payload = {}) {
  const includeTabs = Boolean(payload.includeTabs);
  const status = await groupStatus({ ...payload, includeTabs });
  return {
    workspace: status.configuredGroup,
    policy: {
      mode: status.configuredGroup.policyMode,
      externalTabs: status.configuredGroup.externalTabs,
      mutationConfirmation: 'required',
      sensitiveConfirmation: 'required',
    },
    groups: status.groups,
    tabs: includeTabs ? status.tabs : undefined,
    counts: {
      groups: status.groups.length,
      tabs: status.tabs.length,
    },
  };
}

async function setWorkspace(payload = {}) {
  requireConfirmed(payload, 'setWorkspace');
  const options = await groupOptions(payload);
  await storageSet({
    codexWorkspaceName: options.workspace,
    codexWorkspaceGroupTitle: options.title,
    codexWorkspaceGroupColor: options.color,
    codexWorkspacePolicyMode: options.policyMode,
  });

  const { codexTabId } = await storageGet(['codexTabId']);
  if (codexTabId) {
    try {
      const tab = await chrome.tabs.get(codexTabId);
      await ensureCodexGroupForTab(tab, {
        groupTitle: options.title,
        groupColor: options.color,
      });
    } catch {
      await storageRemove(['codexTabId', 'codexWindowId', 'codexGroupId', 'codexGroupWindowId']);
    }
  }

  return workspaceStatus({ includeTabs: true });
}

async function clearWorkspace(payload = {}) {
  requireConfirmed(payload, 'clearWorkspace');
  await storageRemove([
    'codexWorkspaceName',
    'codexWorkspaceGroupTitle',
    'codexWorkspaceGroupColor',
    'codexWorkspacePolicyMode',
    'codexGroupId',
    'codexGroupWindowId',
  ]);
  return workspaceStatus({ includeTabs: true });
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
  const cleanup = await closeTabsWithGroupPersistenceMitigation([tab]);
  const { codexTabId } = await storageGet(['codexTabId']);
  if (codexTabId === tab.id) {
    await storageRemove(['codexTabId', 'codexWindowId']);
  }
  return {
    closed: true,
    tab: tabInfo(tab),
    tabGroupPersistenceMitigation: cleanup,
  };
}

async function closeGroup(payload) {
  requireConfirmed(payload, 'closeGroup');
  const tabs = await getCodexGroupTabs(payload);
  if (!tabs.length) return { closed: 0, tabs: [] };
  const cleanup = await closeTabsWithGroupPersistenceMitigation(tabs);
  await storageRemove(['codexTabId', 'codexWindowId', 'codexGroupId', 'codexGroupWindowId']);
  return {
    closed: tabs.length,
    tabs: tabs.map((tab) => tabInfo(tab)),
    tabGroupPersistenceMitigation: cleanup,
  };
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

async function traceStart(payload) {
  requireConfirmed(payload, 'traceStart');
  const tab = await getTargetTab(payload);
  return startTraceForTab(tab, payload);
}

async function traceEvents(payload) {
  const tab = await getTargetTab(payload);
  return traceEventsForTab(tab, payload);
}

async function traceSummaryCommand(payload) {
  const tab = await getTargetTab(payload);
  return traceSummaryForTab(tab.id, tab);
}

async function traceStop(payload) {
  const tab = await getTargetTab(payload);
  return stopTraceForTab(tab, payload);
}

async function execute(tabId, func, args = [], options = {}) {
  const frames = await chrome.scripting.executeScript({
    target: { tabId },
    func,
    args,
    world: options.world || 'ISOLATED',
  });
  return frames?.[0]?.result;
}

async function observe(payload) {
  const tab = await getTargetTab(payload);
  const result = await execute(tab.id, collectObserve, [payload]);
  return { tab: tabInfo(tab), ...result };
}

async function findElements(payload) {
  const tab = await getTargetTab(payload);
  const result = await execute(tab.id, collectObserve, [payload]);
  return { tab: tabInfo(tab), ...result, filters: elementFilters(payload) };
}

function elementFilters(payload = {}) {
  return Object.fromEntries(['role', 'text', 'nearText', 'placeholder', 'href', 'actionKind', 'risk']
    .filter((key) => payload[key] !== undefined)
    .map((key) => [key, payload[key]]));
}

async function extractPage(payload) {
  const tab = await getTargetTab(payload);
  const result = await execute(tab.id, collectExtract, [payload]);
  return { tab: tabInfo(tab), ...result };
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

async function printPdf(payload = {}) {
  const tab = await getTargetTab(payload);
  const dataUrl = await withDebugger(tab.id, async () => {
    await sendDebuggerCommand(tab.id, 'Page.enable');
    const pdf = await sendDebuggerCommand(tab.id, 'Page.printToPDF', {
      landscape: Boolean(payload.landscape),
      printBackground: payload.printBackground !== false,
      preferCSSPageSize: payload.preferCssPageSize !== false,
      pageRanges: typeof payload.pageRanges === 'string' ? payload.pageRanges : undefined,
      scale: payload.scale === undefined ? undefined : Math.min(Math.max(Number(payload.scale), 0.1), 2),
    });
    return `data:application/pdf;base64,${pdf.data}`;
  });
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

  if (payload.trusted === true) {
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

async function listSelectOptions(payload) {
  if (!payload.selector) throw new Error('listSelectOptions requires selector');
  const tab = await getTargetTab(payload);
  const result = await execute(tab.id, listSelectOptionsInPage, [{
    selector: payload.selector,
  }]);
  return { tab: tabInfo(await chrome.tabs.get(tab.id)), ...result };
}

async function fillForm(payload) {
  const dryRun = payload.dryRun !== false;
  if (!dryRun) requireConfirmed(payload, 'fillForm');
  if (!payload.fields || typeof payload.fields !== 'object') throw new Error('fillForm requires fields object');
  const tab = await getTargetTab(payload);
  const result = await execute(tab.id, fillFormInPage, [{
    fields: payload.fields,
    dryRun,
  }]);
  return { tab: tabInfo(await chrome.tabs.get(tab.id)), ...result };
}

async function handleDialog(payload) {
  requireConfirmed(payload, 'handleDialog');
  const tab = await getTargetTab(payload);
  return withDebugger(tab.id, async () => {
    await sendDebuggerCommand(tab.id, 'Page.enable');
    await sendDebuggerCommand(tab.id, 'Page.handleJavaScriptDialog', {
      accept: payload.accept !== false,
      promptText: typeof payload.promptText === 'string' ? payload.promptText : undefined,
    });
    return {
      handled: true,
      accepted: payload.accept !== false,
      tab: tabInfo(await chrome.tabs.get(tab.id)),
    };
  });
}

async function uploadFile(payload) {
  requireConfirmed(payload, 'uploadFile');
  if (!payload.selector) throw new Error('uploadFile requires selector');
  const files = Array.isArray(payload.files)
    ? payload.files.map(String)
    : (payload.file ? [String(payload.file)] : []);
  if (!files.length) throw new Error('uploadFile requires file or files');
  const tab = await getTargetTab(payload);
  return withDebugger(tab.id, async () => {
    await sendDebuggerCommand(tab.id, 'DOM.enable');
    const documentResult = await sendDebuggerCommand(tab.id, 'DOM.getDocument', {
      depth: -1,
      pierce: true,
    });
    const rootNodeId = documentResult?.root?.nodeId;
    if (!rootNodeId) throw new Error('Failed to read DOM root for uploadFile');
    const queryResult = await sendDebuggerCommand(tab.id, 'DOM.querySelector', {
      nodeId: rootNodeId,
      selector: payload.selector,
    });
    if (!queryResult?.nodeId) throw new Error(`No element matches selector: ${payload.selector}`);
    await sendDebuggerCommand(tab.id, 'DOM.setFileInputFiles', {
      nodeId: queryResult.nodeId,
      files,
    });
    return {
      uploaded: true,
      selector: payload.selector,
      fileCount: files.length,
      tab: tabInfo(await chrome.tabs.get(tab.id)),
    };
  });
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

function normalizePromptChoices(choices = []) {
  if (!Array.isArray(choices)) return [];
  return choices.slice(0, MAX_USER_PROMPT_CHOICES).map((choice, index) => {
    if (choice && typeof choice === 'object') {
      const value = choice.value === undefined ? String(index + 1) : String(choice.value);
      const label = choice.label === undefined ? value : String(choice.label);
      return { value, label };
    }
    return {
      value: String(choice),
      label: String(choice),
    };
  });
}

function publicUserPrompt(prompt) {
  return {
    id: prompt.id,
    question: prompt.question,
    choices: prompt.choices,
    allowText: prompt.allowText,
    createdAt: prompt.createdAt,
  };
}

async function askUser(payload = {}) {
  const question = String(payload.question || '').trim();
  if (!question) throw new Error('askUser requires question');

  const id = crypto.randomUUID();
  const choices = normalizePromptChoices(payload.choices);
  const timeoutMs = Math.min(Math.max(Number(payload.timeoutMs || 300_000), 5_000), 1_800_000);
  const allowText = payload.allowText !== false;
  const closeOnAnswer = payload.closeOnAnswer !== false;
  const previous = await storageGet(['codexTabId', 'codexWindowId']);
  const promptUrl = chrome.runtime.getURL(`ask.html?id=${encodeURIComponent(id)}`);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      completeUserPrompt(id, {
        canceled: true,
        reason: 'timeout',
      });
    }, timeoutMs);

    pendingUserPrompts.set(id, {
      id,
      question,
      choices,
      allowText,
      closeOnAnswer,
      createdAt: new Date().toISOString(),
      timeout,
      tabId: null,
      previous,
      resolve,
      group: null,
    });

    createPromptTab(promptUrl, payload, previous)
      .then(({ tab, group }) => {
        const prompt = pendingUserPrompts.get(id);
        if (!prompt) {
          closeTabsWithGroupPersistenceMitigation([tab], { ignoreMissing: true }).catch(() => {});
          return;
        }
        prompt.tabId = tab.id;
        prompt.group = groupInfo(group);
      })
      .catch((error) => {
        pendingUserPrompts.delete(id);
        clearTimeout(timeout);
        restoreStoredCodexTarget(previous).catch(() => {});
        reject(error);
      });
  });
}

async function createPromptTab(url, payload, previous = {}) {
  const tabs = await getCodexGroupTabs(payload);
  let tab;

  if (tabs.length) {
    const active = tabs.find((candidate) => candidate.active) || tabs[0];
    tab = await chrome.tabs.create({
      windowId: active.windowId,
      index: active.index + 1,
      url,
      active: true,
    });
  } else {
    const created = await chrome.windows.create({
      url,
      focused: true,
      width: 720,
      height: 520,
      left: 120,
      top: 120,
      type: 'normal',
    });
    tab = created.tabs?.[0];
  }

  if (!tab?.id) throw new Error('Failed to create user prompt tab');
  const group = await ensureCodexGroupForTab(tab, payload);
  const loaded = await waitForTabComplete(tab.id);
  await restoreStoredCodexTarget(previous);
  return { tab: loaded, group };
}

async function restoreStoredCodexTarget(previous = {}) {
  if (previous.codexTabId) {
    await storageSet({
      codexTabId: previous.codexTabId,
      codexWindowId: previous.codexWindowId,
    });
    return;
  }
  await storageRemove(['codexTabId', 'codexWindowId']);
}

function completeUserPrompt(requestId, answer = {}) {
  const prompt = pendingUserPrompts.get(requestId);
  if (!prompt) return false;

  pendingUserPrompts.delete(requestId);
  clearTimeout(prompt.timeout);

  const respondedAt = new Date().toISOString();
  const result = {
    id: prompt.id,
    question: prompt.question,
    canceled: Boolean(answer.canceled),
    reason: answer.reason || null,
    answer: answer.canceled ? null : {
      value: answer.value === undefined ? null : String(answer.value),
      text: answer.text === undefined ? null : String(answer.text),
      choice: answer.choice || null,
    },
    tabId: prompt.tabId,
    group: prompt.group,
    createdAt: prompt.createdAt,
    respondedAt,
  };

  prompt.resolve(result);

  if (prompt.closeOnAnswer && prompt.tabId) {
    closeTabsWithGroupPersistenceMitigation([prompt.tabId], { ignoreMissing: true }).catch(() => {});
  }
  restoreStoredCodexTarget(prompt.previous).catch(() => {});
  return true;
}
