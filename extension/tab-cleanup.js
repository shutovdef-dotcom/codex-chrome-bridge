import { disableSavedTabGroupsForTabs } from './tab-group-persistence.js';

function tabIdForClose(input) {
  const tabId = Number(input && typeof input === 'object' ? input.id : input);
  return Number.isInteger(tabId) && tabId >= 0 ? tabId : null;
}

function savedClosedGroupChipPrevention(groupedTabIds, ungroupedBeforeClose) {
  const attempted = groupedTabIds.length > 0;
  return {
    attempted,
    method: attempted ? 'ungroup-before-close' : 'not-needed',
    prevented: attempted && ungroupedBeforeClose,
    groupedTabIds,
  };
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
  const savedGroupPersistence = await disableSavedTabGroupsForTabs(tabs);
  let ungroupedBeforeClose = false;

  if (groupedTabIds.length) {
    if (!chrome.tabs.ungroup) {
      throw new Error('Unable to ungroup tabs before close: chrome.tabs.ungroup is unavailable');
    }

    try {
      await chrome.tabs.ungroup(groupedTabIds);
      ungroupedBeforeClose = true;
    } catch (error) {
      throw new Error(`Unable to ungroup tabs before close: ${String(error?.message || error)}`);
    }
  }

  if (tabIds.length) {
    await chrome.tabs.remove(tabIds);
  }

  return {
    closedTabIds: tabIds,
    missingTabIds,
    savedGroupPersistence,
    savedClosedGroupChipPrevention: savedClosedGroupChipPrevention(groupedTabIds, ungroupedBeforeClose),
    ungroupedBeforeClose,
    ungroupedTabIds: ungroupedBeforeClose ? groupedTabIds : [],
    ungroupUnavailable: false,
    ungroupError: null,
  };
}
