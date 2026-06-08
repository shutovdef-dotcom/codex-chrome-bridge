export async function waitForTabComplete(tabId, timeoutMs = 25_000) {
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
