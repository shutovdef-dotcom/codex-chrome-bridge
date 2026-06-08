function tabIdForClose(input) {
  const tabId = Number(input && typeof input === 'object' ? input.id : input);
  return Number.isInteger(tabId) && tabId >= 0 ? tabId : null;
}

export async function closeTabsWithGroupPersistenceMitigation(tabInputs, options = {}) {
  const inputs = Array.isArray(tabInputs) ? tabInputs : [tabInputs];
  const seen = new Set();
  const tabs = [];
  const missingTabIds = [];

  for (const input of inputs) {
    const tabId = tabIdForClose(input);
    if (tabId === null || seen.has(tabId)) continue;
    seen.add(tabId);

    if (input && typeof input === 'object' && Number.isInteger(input.groupId)) {
      tabs.push(input);
      continue;
    }

    try {
      tabs.push(await chrome.tabs.get(tabId));
    } catch (error) {
      if (!options.ignoreMissing) throw error;
      missingTabIds.push(tabId);
    }
  }

  const tabIds = tabs.map((tab) => tab.id);
  const groupedTabIds = tabs
    .filter((tab) => Number.isInteger(tab.groupId) && tab.groupId >= 0)
    .map((tab) => tab.id);
  let ungroupedBeforeClose = false;
  let ungroupError = null;

  if (groupedTabIds.length && chrome.tabs.ungroup) {
    try {
      await chrome.tabs.ungroup(groupedTabIds);
      ungroupedBeforeClose = true;
    } catch (error) {
      ungroupError = String(error?.message || error);
    }
  }

  if (tabIds.length) {
    await chrome.tabs.remove(tabIds);
  }

  return {
    closedTabIds: tabIds,
    missingTabIds,
    ungroupedBeforeClose,
    ungroupedTabIds: ungroupedBeforeClose ? groupedTabIds : [],
    ungroupUnavailable: Boolean(groupedTabIds.length) && !chrome.tabs.ungroup,
    ungroupError,
  };
}
