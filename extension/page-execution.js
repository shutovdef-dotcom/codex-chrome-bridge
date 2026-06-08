export async function execute(tabId, func, args = [], options = {}) {
  const frames = await chrome.scripting.executeScript({
    target: { tabId },
    func,
    args,
    world: options.world || 'ISOLATED',
  });
  const frame = frames?.[0];
  if (frame?.error) {
    throw new Error(frame.error.message || String(frame.error));
  }
  return frame?.result;
}
