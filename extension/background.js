import {
  clickAtInPage,
  fillFormInPage,
  hoverInPage,
  pressKeyInPage,
  selectOptionInPage,
} from './page-scripts.js';
import { extensionErrorCode, extensionErrorDetails } from './extension-errors.js';
import { startBridge } from './offscreen-lifecycle.js';
import { execute } from './page-execution.js';
import { printPdf, screenshot } from './page-artifacts.js';
import {
  activateTab,
  adoptTab,
  clearWorkspace,
  closeGroup,
  closeTab,
  ensureCodexTab,
  goBack,
  goForward,
  groupStatus,
  listTabs,
  listWindows,
  openTab,
  reloadTab,
  setWorkspace,
  workspaceStatus,
} from './navigation-actions.js';
import {
  extractPage,
  findElements,
  listSelectOptions,
  observe,
  pageHTML,
  pageText,
  snapshot,
  storageSnapshot,
  waitForSelector,
} from './page-read-actions.js';
import { tabInfo } from './tab-info.js';
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
import { requireConfirmed } from './safety-gates.js';
import { keyEventPayload } from './keyboard-events.js';
import {
  askUser,
  completeUserPrompt,
  handlePromptTabRemoved,
  userPromptResponse,
} from './user-prompts.js';
import {
  bookmarksSearch,
  cookiesList,
  fetchUrl,
  historySearch,
} from './browser-data.js';
import {
  getTargetTab,
} from './workspace-tabs.js';

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
    sendResponse(userPromptResponse(message.requestId));
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
  handlePromptTabRemoved(tabId);
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
