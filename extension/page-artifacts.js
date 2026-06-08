import { elementClipForSelector } from './page-scripts.js';
import { execute } from './page-execution.js';
import { sendDebuggerCommand, withDebugger } from './debugger-session.js';
import { tabInfo } from './tab-info.js';
import { getTargetTab } from './workspace-tabs.js';

export async function screenshot(payload) {
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
  await new Promise((resolve) => setTimeout(resolve, 300));
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  const latest = await chrome.tabs.get(tab.id);
  return {
    tab: tabInfo(latest),
    dataUrl,
    capturedAt: new Date().toISOString(),
  };
}

export async function printPdf(payload = {}) {
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
