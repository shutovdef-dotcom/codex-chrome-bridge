import { elementClipForSelector, resolveObservedElementTarget } from './page-scripts.js';
import { execute } from './page-execution.js';
import { sendDebuggerCommand, withDebugger } from './debugger-session.js';
import { withUserFocusPreserved } from './focus-context.js';
import { tabInfo } from './tab-info.js';
import { getTargetTab } from './workspace-tabs.js';

const DEFAULT_SCREENSHOT_MAX_PIXELS = 80_000_000;

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function screenshotFallback(payload = {}) {
  return payload.fallback === 'error' ? 'error' : 'viewport';
}

function contentSizeFromLayoutMetrics(metrics = {}) {
  const contentSize = metrics.contentSize || {};
  const layoutViewport = metrics.layoutViewport || {};
  const visualViewport = metrics.visualViewport || {};
  return {
    pageWidth: Math.ceil(Math.max(contentSize.width || 0, layoutViewport.clientWidth || 0, visualViewport.clientWidth || 0, 1)),
    pageHeight: Math.ceil(Math.max(contentSize.height || 0, layoutViewport.clientHeight || 0, visualViewport.clientHeight || 0, 1)),
    viewportWidth: Math.ceil(Math.max(visualViewport.clientWidth || 0, layoutViewport.clientWidth || 0, 1)),
    viewportHeight: Math.ceil(Math.max(visualViewport.clientHeight || 0, layoutViewport.clientHeight || 0, 1)),
  };
}

function captureTargetMetrics({ payload = {}, clip = null, layoutMetrics = {} } = {}) {
  const contentSize = contentSizeFromLayoutMetrics(layoutMetrics);
  const captureMode = payload.selector ? 'selector' : (payload.fullPage ? 'fullPage' : 'viewport');
  const width = Math.ceil(clip?.width || (payload.fullPage ? contentSize.pageWidth : contentSize.viewportWidth));
  const height = Math.ceil(clip?.height || (payload.fullPage ? contentSize.pageHeight : contentSize.viewportHeight));
  return {
    captureMode,
    width: Math.max(width, 1),
    height: Math.max(height, 1),
    estimatedPixels: Math.max(width, 1) * Math.max(height, 1),
    page: {
      width: contentSize.pageWidth,
      height: contentSize.pageHeight,
    },
    viewport: {
      width: contentSize.viewportWidth,
      height: contentSize.viewportHeight,
    },
  };
}

export async function screenshot(payload) {
  const tab = await getTargetTab(payload);

  if (payload.fullPage || payload.selector || payload.elementRef) {
    const captureResult = await withDebugger(tab.id, async () => {
      await sendDebuggerCommand(tab.id, 'Page.enable');
      const layoutMetrics = await sendDebuggerCommand(tab.id, 'Page.getLayoutMetrics');
      let clip;
      let target;
      if (payload.selector || payload.elementRef) {
        target = await execute(tab.id, resolveObservedElementTarget, [{
          selector: payload.selector,
          elementRef: payload.elementRef,
        }]);
        const rect = await execute(tab.id, elementClipForSelector, [target.selector]);
        clip = {
          x: rect.x,
          y: rect.y,
          width: Math.max(rect.width, 1),
          height: Math.max(rect.height, 1),
          scale: 1,
        };
      }

      const maxPixels = positiveNumber(payload.maxPixels, DEFAULT_SCREENSHOT_MAX_PIXELS);
      const targetMetrics = captureTargetMetrics({ payload, clip, layoutMetrics });
      const fallback = screenshotFallback(payload);
      const tooLarge = targetMetrics.estimatedPixels > maxPixels;
      const sizeGuard = {
        triggered: tooLarge,
        fallback,
        reason: tooLarge ? 'estimated-pixels-exceeded' : null,
        maxPixels,
        estimatedPixels: targetMetrics.estimatedPixels,
        requestedCaptureMode: targetMetrics.captureMode,
        captureMode: tooLarge && fallback === 'viewport' ? 'viewport' : targetMetrics.captureMode,
        target: {
          width: targetMetrics.width,
          height: targetMetrics.height,
        },
        page: targetMetrics.page,
        viewport: targetMetrics.viewport,
      };

      if (tooLarge && fallback === 'error') {
        const error = new Error(`Screenshot too large: estimated ${targetMetrics.estimatedPixels} pixels exceeds --max-pixels ${maxPixels}`);
        error.details = { sizeGuard };
        throw error;
      }

      const capture = await sendDebuggerCommand(tab.id, 'Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: tooLarge ? false : Boolean(payload.fullPage || payload.selector),
        ...(!tooLarge && clip ? { clip } : {}),
      });

      return {
        dataUrl: `data:image/png;base64,${capture.data}`,
        sizeGuard,
        fullPage: Boolean(payload.fullPage) && !tooLarge,
        selector: target?.selector,
        elementRef: target?.elementRef,
      };
    });

    const latest = await chrome.tabs.get(tab.id);
    return {
      tab: tabInfo(latest),
      dataUrl: captureResult.dataUrl,
      selector: captureResult.sizeGuard.triggered ? undefined : captureResult.selector,
      elementRef: captureResult.sizeGuard.triggered ? undefined : captureResult.elementRef,
      fullPage: captureResult.fullPage,
      requestedFullPage: Boolean(payload.fullPage),
      sizeGuard: captureResult.sizeGuard,
      capturedAt: new Date().toISOString(),
    };
  }

  const captureViewportScreenshot = async () => {
    await chrome.tabs.update(tab.id, { active: true });
    await new Promise((resolve) => setTimeout(resolve, 300));
    return chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  };

  const dataUrl = payload.active
    ? await captureViewportScreenshot()
    : await withUserFocusPreserved(captureViewportScreenshot);
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
