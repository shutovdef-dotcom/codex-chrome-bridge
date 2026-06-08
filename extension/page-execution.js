export async function execute(tabId, func, args = [], options = {}) {
  const frames = await chrome.scripting.executeScript({
    target: { tabId },
    func,
    args,
    world: options.world || 'ISOLATED',
  });
  return frames?.[0]?.result;
}
