import {
  clickAtInPage,
  dragDropInPage,
  fillFormInPage,
  hoverInPage,
  pressKeyInPage,
  resolveObservedElementTarget,
  selectOptionInPage,
} from './page-scripts.js';
import { execute } from './page-execution.js';
import { sendDebuggerCommand, withDebugger } from './debugger-session.js';
import { requireConfirmed } from './safety-gates.js';
import { keyEventPayload } from './keyboard-events.js';
import { tabInfo } from './tab-info.js';
import { getTargetTab } from './workspace-tabs.js';

export async function scroll(payload) {
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

export async function click(payload) {
  if (!payload.confirmed) throw new Error('click requires confirmed=true');
  if (!payload.selector && !payload.elementRef) throw new Error('click requires selector or elementRef');
  const tab = await getTargetTab(payload);
  const target = await resolveElementTarget(tab.id, payload);
  return execute(tab.id, ({ selector }) => {
    const element = document.querySelector(selector);
    if (!element) throw new Error(`No element matches selector: ${selector}`);
    element.click();
    return { clicked: selector, url: location.href, title: document.title };
  }, [{ selector: target.selector }]);
}

export async function clickAt(payload) {
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

export async function hover(payload) {
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

  const target = payload.elementRef
    ? await resolveElementTarget(tab.id, payload)
    : { selector: payload.selector, elementRef: null };
  const result = await execute(tab.id, hoverInPage, [{
    selector: target.selector,
    x,
    y,
  }]);
  return { tab: tabInfo(await chrome.tabs.get(tab.id)), elementRef: target.elementRef, ...result };
}

export async function dragDrop(payload) {
  requireConfirmed(payload, 'dragDrop');
  const tab = await getTargetTab(payload);
  const source = await resolveDragPoint(tab.id, payload, {
    selectorKey: 'selector',
    elementRefKey: 'elementRef',
    xKey: 'x',
    yKey: 'y',
    label: 'source',
  });
  const target = await resolveDragPoint(tab.id, payload, {
    selectorKey: 'targetSelector',
    elementRefKey: 'targetElementRef',
    xKey: 'targetX',
    yKey: 'targetY',
    label: 'target',
  });

  if (payload.trusted) {
    return withDebugger(tab.id, async () => {
      await sendDebuggerCommand(tab.id, 'Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: source.x,
        y: source.y,
      });
      await sendDebuggerCommand(tab.id, 'Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: source.x,
        y: source.y,
        button: 'left',
        clickCount: 1,
      });
      await sendDebuggerCommand(tab.id, 'Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: target.x,
        y: target.y,
        button: 'left',
      });
      await sendDebuggerCommand(tab.id, 'Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: target.x,
        y: target.y,
        button: 'left',
        clickCount: 1,
      });
      return {
        dragged: true,
        trusted: true,
        source,
        target,
        tab: tabInfo(await chrome.tabs.get(tab.id)),
      };
    });
  }

  const result = await execute(tab.id, dragDropInPage, [{
    selector: source.selector,
    x: source.x,
    y: source.y,
    targetSelector: target.selector,
    targetX: target.x,
    targetY: target.y,
  }]);
  return { tab: tabInfo(await chrome.tabs.get(tab.id)), ...result };
}

export async function typeInto(payload) {
  if (!payload.confirmed) throw new Error('type requires confirmed=true');
  if (!payload.selector && !payload.elementRef) throw new Error('type requires selector or elementRef');
  if (typeof payload.text !== 'string') throw new Error('type requires text');
  const tab = await getTargetTab(payload);
  const target = await resolveElementTarget(tab.id, payload);

  if (payload.trusted) {
    await execute(tab.id, ({ selector }) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`No element matches selector: ${selector}`);
      element.focus();
      return true;
    }, [{ selector: target.selector }]);
    return withDebugger(tab.id, async () => {
      await sendDebuggerCommand(tab.id, 'Input.insertText', { text: payload.text });
      return { typed: target.selector, elementRef: target.elementRef, length: payload.text.length, trusted: true, tab: tabInfo(await chrome.tabs.get(tab.id)) };
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
  }, [{ selector: target.selector, text: payload.text }]);
}

export async function pressKey(payload) {
  requireConfirmed(payload, 'press');
  const tab = await getTargetTab(payload);
  const key = String(payload.key || '');
  if (!key) throw new Error('press requires key');

  const target = payload.elementRef
    ? await resolveElementTarget(tab.id, payload)
    : { selector: payload.selector, elementRef: null };
  if (target.selector) {
    await execute(tab.id, ({ selector }) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`No element matches selector: ${selector}`);
      element.focus();
      return true;
    }, [{ selector: target.selector }]);
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

export async function selectOption(payload) {
  requireConfirmed(payload, 'select');
  if (!payload.selector && !payload.elementRef) throw new Error('select requires selector or elementRef');
  const tab = await getTargetTab(payload);
  const target = await resolveElementTarget(tab.id, payload);
  const result = await execute(tab.id, selectOptionInPage, [{
    selector: target.selector,
    value: payload.value,
    label: payload.label,
    index: payload.index === undefined ? undefined : Number(payload.index),
  }]);
  return { tab: tabInfo(await chrome.tabs.get(tab.id)), elementRef: target.elementRef, ...result };
}

export async function fillForm(payload) {
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

export async function handleDialog(payload) {
  requireConfirmed(payload, 'handleDialog');
  const tab = await getTargetTab(payload);
  return withDebugger(tab.id, async () => {
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

export async function uploadFile(payload) {
  requireConfirmed(payload, 'uploadFile');
  if (!payload.selector && !payload.elementRef) throw new Error('uploadFile requires selector or elementRef');
  const files = Array.isArray(payload.files)
    ? payload.files.map(String)
    : (payload.file ? [String(payload.file)] : []);
  if (!files.length) throw new Error('uploadFile requires file or files');
  const tab = await getTargetTab(payload);
  const target = await resolveElementTarget(tab.id, payload);
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
      selector: target.selector,
    });
    if (!queryResult?.nodeId) throw new Error(`No element matches selector: ${target.selector}`);
    await sendDebuggerCommand(tab.id, 'DOM.setFileInputFiles', {
      nodeId: queryResult.nodeId,
      files,
    });
    return {
      uploaded: true,
      selector: target.selector,
      elementRef: target.elementRef,
      fileCount: files.length,
      tab: tabInfo(await chrome.tabs.get(tab.id)),
    };
  });
}

async function resolveElementTarget(tabId, payload = {}) {
  if (!payload.elementRef) {
    return {
      selector: payload.selector,
      elementRef: null,
    };
  }
  return execute(tabId, resolveObservedElementTarget, [{
    selector: payload.selector,
    elementRef: payload.elementRef,
  }]);
}

async function resolveDragPoint(tabId, payload = {}, options = {}) {
  const selector = payload[options.selectorKey];
  const elementRef = payload[options.elementRefKey];
  if (selector || elementRef) {
    const target = await execute(tabId, resolveObservedElementTarget, [{
      selector,
      elementRef,
    }]);
    const point = await execute(tabId, ({ resolvedSelector, label }) => {
      const element = document.querySelector(resolvedSelector);
      if (!element) throw new Error(`No element matches ${label} selector: ${resolvedSelector}`);
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) throw new Error(`${label} element has empty bounds: ${resolvedSelector}`);
      return {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
      };
    }, [{ resolvedSelector: target.selector, label: options.label }]);
    return {
      selector: target.selector,
      elementRef: target.elementRef,
      x: point.x,
      y: point.y,
    };
  }

  const x = Number(payload[options.xKey]);
  const y = Number(payload[options.yKey]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error(`dragDrop requires ${options.label} selector, elementRef, or coordinates`);
  }
  return {
    selector: null,
    elementRef: null,
    x,
    y,
  };
}
