const OFFSCREEN_URL = 'offscreen.html';

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

export async function startBridge() {
  try {
    await ensureOffscreen();
  } catch {
    // The extension action and alarm will retry; avoid throwing from event startup.
  }
}
