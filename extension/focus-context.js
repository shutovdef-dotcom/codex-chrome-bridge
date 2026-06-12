function chromeId(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

export async function captureUserFocusContext() {
  const [activeTab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  const tabId = chromeId(activeTab?.id);
  const windowId = chromeId(activeTab?.windowId);
  if (tabId === null || windowId === null) return null;

  return {
    tabId,
    windowId,
  };
}

export async function restoreUserFocusContext(context) {
  const tabId = chromeId(context?.tabId);
  const windowId = chromeId(context?.windowId);
  if (tabId === null || windowId === null) return;

  try {
    await chrome.windows.update(windowId, { focused: true });
  } catch {
    return;
  }

  try {
    await chrome.tabs.update(tabId, { active: true });
  } catch {
    // The original tab may have been closed or moved while background work was running.
  }
}

export async function withUserFocusPreserved(action) {
  const context = await captureUserFocusContext();
  try {
    return await action();
  } finally {
    await restoreUserFocusContext(context);
  }
}
