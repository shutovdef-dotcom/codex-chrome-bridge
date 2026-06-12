import { execute } from './page-execution.js';
import { resolveObservedElementTarget } from './page-scripts.js';
import { requireConfirmed } from './safety-gates.js';
import { tabInfo } from './tab-info.js';
import { getTargetTab } from './workspace-tabs.js';

const DEFAULT_DOWNLOAD_TIMEOUT_MS = 60_000;
const MIN_DOWNLOAD_TIMEOUT_MS = 1_000;
const MAX_DOWNLOAD_TIMEOUT_MS = 180_000;

function clampDownloadTimeout(value) {
  if (!Number.isFinite(value)) return DEFAULT_DOWNLOAD_TIMEOUT_MS;
  return Math.min(MAX_DOWNLOAD_TIMEOUT_MS, Math.max(MIN_DOWNLOAD_TIMEOUT_MS, Math.round(value)));
}

function fileExtension(filename) {
  const value = String(filename || '');
  const index = value.lastIndexOf('.');
  if (index < 0 || index === value.length - 1) return null;
  return value.slice(index + 1).toLowerCase();
}

function downloadPath(item) {
  return item?.filename || item?.fileSystemPath || null;
}

async function cancelDownload(id) {
  if (!chrome.downloads?.cancel || !Number.isInteger(id)) return;
  try {
    await chrome.downloads.cancel(id);
  } catch {
    // Best-effort cleanup only.
  }
}

async function eraseDownload(id) {
  if (!chrome.downloads?.erase || !Number.isInteger(id)) return;
  try {
    await chrome.downloads.erase({ id });
  } catch {
    // Best-effort cleanup only.
  }
}

async function clickSelectorForDownload(tabId, selector) {
  return execute(tabId, ({ selector: targetSelector }) => {
    const element = document.querySelector(targetSelector);
    if (!element) throw new Error(`No element matches selector: ${targetSelector}`);
    element.click();
    return {
      clicked: targetSelector,
      url: location.href,
      title: document.title,
    };
  }, [{ selector }]);
}

async function downloadItemById(id) {
  if (!chrome.downloads?.search || !Number.isInteger(id)) return null;
  const [item] = await chrome.downloads.search({ id });
  return item || null;
}

function isDownloadForTab(item, tabId) {
  return Number.isInteger(item?.tabId) && item.tabId === tabId;
}

function localDownloadSummary(item, elapsedMs, tab) {
  const localPath = downloadPath(item);
  const fileName = localPath ? localPath.split(/[/\\]/).pop() : (item?.filename ? String(item.filename).split(/[/\\]/).pop() : null);
  return {
    ok: true,
    tab: tabInfo(tab),
    downloadId: item.id,
    state: item.state,
    danger: item.danger,
    exists: item.exists,
    localPath,
    fileName,
    extension: fileExtension(fileName),
    mime: item.mime || null,
    fileSize: Number.isFinite(item.fileSize) ? item.fileSize : null,
    bytesReceived: Number.isFinite(item.bytesReceived) ? item.bytesReceived : null,
    totalBytes: Number.isFinite(item.totalBytes) ? item.totalBytes : null,
    startedAt: item.startTime || null,
    endedAt: item.endTime || null,
    elapsedMs,
    privacy: {
      rawUrl: false,
      finalUrl: false,
      fileContents: false,
    },
  };
}

function armSingleDownloadWait(tabId, timeoutMs) {
  if (!chrome.downloads?.onCreated || !chrome.downloads?.onChanged) {
    throw new Error('chrome.downloads API is unavailable; reload the extension after granting the downloads permission');
  }

  let cancelWait = null;
  const promise = new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let settled = false;
    const createdIds = new Set();
    const extraIds = new Set();
    let primaryId = null;

    const cleanup = () => {
      clearTimeout(timer);
      chrome.downloads.onCreated.removeListener(onCreated);
      chrome.downloads.onChanged.removeListener(onChanged);
    };

    const finish = (fn) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const rejectWithCleanup = (error) => {
      finish(() => reject(error));
    };

    cancelWait = () => {
      rejectWithCleanup(new Error('download was canceled before completion'));
    };

    const failForMultipleDownloads = async () => {
      await Promise.all([...extraIds].map(async (id) => {
        await cancelDownload(id);
        await eraseDownload(id);
      }));
      rejectWithCleanup(new Error('download triggered more than one file; bulk download is not allowed'));
    };

    const resolveIfComplete = async (id) => {
      const item = await downloadItemById(id);
      if (!item) {
        rejectWithCleanup(new Error('download completed but metadata could not be loaded'));
        return;
      }
      if (item.state === 'interrupted') {
        rejectWithCleanup(new Error(`download interrupted: ${item.error || 'unknown error'}`));
        return;
      }
      if (item.state !== 'complete') return;
      finish(() => resolve({
        item,
        elapsedMs: Date.now() - startedAt,
      }));
    };

    const onCreated = (item) => {
      if (!isDownloadForTab(item, tabId)) return;
      createdIds.add(item.id);
      if (primaryId === null) {
        primaryId = item.id;
        return;
      }
      extraIds.add(item.id);
      void failForMultipleDownloads();
    };

    const onChanged = (delta) => {
      const id = delta?.id;
      if (!Number.isInteger(id) || !createdIds.has(id)) return;
      if (delta.state?.current === 'interrupted') {
        rejectWithCleanup(new Error(`download interrupted: ${delta.error?.current || 'unknown error'}`));
        return;
      }
      if (id === primaryId && delta.state?.current === 'complete') {
        void resolveIfComplete(id);
      }
    };

    const timer = setTimeout(() => {
      rejectWithCleanup(new Error(`download did not complete within ${timeoutMs}ms`));
    }, timeoutMs);

    chrome.downloads.onCreated.addListener(onCreated);
    chrome.downloads.onChanged.addListener(onChanged);
  });

  return {
    promise,
    cancel() {
      if (typeof cancelWait === 'function') cancelWait();
    },
  };
}

export async function download(payload) {
  requireConfirmed(payload, 'download');
  if (!payload.selector && !payload.elementRef) throw new Error('download requires selector or elementRef');

  const timeoutMs = clampDownloadTimeout(Number(payload.downloadTimeoutMs));
  const tab = await getTargetTab(payload);
  const target = await resolveElementTarget(tab.id, payload);
  const waitForDownload = armSingleDownloadWait(tab.id, timeoutMs);

  let clickResult;
  try {
    clickResult = await clickSelectorForDownload(tab.id, target.selector);
  } catch (error) {
    waitForDownload.cancel();
    await waitForDownload.promise.catch(() => {});
    throw error;
  }

  const { item, elapsedMs } = await waitForDownload.promise;
  const refreshedTab = await chrome.tabs.get(tab.id);
  return {
    ...localDownloadSummary(item, elapsedMs, refreshedTab),
    selector: target.selector,
    elementRef: target.elementRef,
    clicked: clickResult?.clicked || target.selector,
  };
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
