import { DEFAULT_GROUP_TITLE, groupOptions } from './workspace-policy.js';

function errorMessage(error) {
  return String(error?.message || error);
}

function normalizedString(value) {
  return String(value || '').trim();
}

function integerSet(values) {
  return new Set(values.filter((value) => Number.isInteger(value) && value >= 0));
}

function titleSet(values) {
  return new Set(values.map(normalizedString).filter(Boolean));
}

function savedState(group, propertyName = 'saved') {
  if (!group || typeof group !== 'object') return { supported: false };
  if (!Object.prototype.hasOwnProperty.call(group, propertyName)) return { supported: false };
  return {
    supported: true,
    saved: Boolean(group[propertyName]),
  };
}

export async function disableSavedTabGroupIfSupported(groupOrGroupId) {
  if (!chrome.tabGroups) {
    return { supported: false, attempted: false, reason: 'chrome.tabGroups unavailable' };
  }

  const groupId = Number.isInteger(groupOrGroupId) ? groupOrGroupId : groupOrGroupId?.id;
  if (!Number.isInteger(groupId) || groupId < 0) {
    return { supported: false, attempted: false, reason: 'missing group id' };
  }

  let group = Number.isInteger(groupOrGroupId) ? null : groupOrGroupId;
  if (!group) {
    try {
      group = await chrome.tabGroups.get(groupId);
    } catch (error) {
      return { groupId, supported: false, attempted: false, error: errorMessage(error) };
    }
  }

  const state = savedState(group, 'saved');
  if (!state.supported) return { groupId, supported: false, attempted: false };
  if (!state.saved) return { groupId, supported: true, attempted: false, saved: false };

  try {
    const updated = await chrome.tabGroups.update(groupId, { saved: false });
    const updatedState = savedState(updated, 'saved');
    return {
      groupId,
      supported: true,
      attempted: true,
      saved: updatedState.supported ? updatedState.saved : false,
      disabled: updatedState.supported ? !updatedState.saved : true,
    };
  } catch (error) {
    return {
      groupId,
      supported: true,
      attempted: true,
      disabled: false,
      error: errorMessage(error),
    };
  }
}

export async function disableSavedTabGroupsForTabs(tabs = []) {
  const groupIds = [...new Set(tabs
    .filter((tab) => Number.isInteger(tab.groupId) && tab.groupId >= 0)
    .map((tab) => tab.groupId))];

  const results = [];
  for (const groupId of groupIds) {
    results.push(await disableSavedTabGroupIfSupported(groupId));
  }
  return results;
}

async function managedGroupContext() {
  const stored = await chrome.storage.local.get([
    'codexGroupId',
    'codexGroupTitle',
    'codexWorkspaceGroupTitle',
  ]).catch(() => ({}));
  const options = await groupOptions().catch(() => ({ title: DEFAULT_GROUP_TITLE }));

  return {
    groupIds: integerSet([stored.codexGroupId]),
    groupTitles: titleSet([
      DEFAULT_GROUP_TITLE,
      stored.codexGroupTitle,
      stored.codexWorkspaceGroupTitle,
      options.title,
    ]),
  };
}

async function isManagedCodexGroup(group) {
  if (!group || typeof group !== 'object') return false;
  const context = await managedGroupContext();
  const title = normalizedString(group.title);
  if (context.groupTitles.has(title)) return true;
  return !title && context.groupIds.has(group.id);
}

export async function handleManagedTabGroupChange(group) {
  if (!(await isManagedCodexGroup(group))) {
    return { managed: false, groupId: group?.id };
  }

  const result = await disableSavedTabGroupIfSupported(group);
  return { ...result, managed: true };
}

export async function enforceManagedTabGroupPersistence() {
  if (!chrome.tabGroups?.query) {
    return { supported: false, inspected: 0, managed: 0, results: [] };
  }

  let groups;
  try {
    groups = await chrome.tabGroups.query({});
  } catch (error) {
    return {
      supported: false,
      inspected: 0,
      managed: 0,
      results: [],
      error: errorMessage(error),
    };
  }

  let results = [];
  for (const group of groups) {
    try {
      results = [...results, await handleManagedTabGroupChange(group)];
    } catch (error) {
      results = [...results, {
        groupId: group?.id,
        managed: null,
        error: errorMessage(error),
      }];
    }
  }

  return {
    supported: true,
    inspected: groups.length,
    managed: results.filter((result) => result?.managed !== false).length,
    results,
  };
}

function handleManagedTabGroupChangeEvent(group) {
  handleManagedTabGroupChange(group).catch(() => {});
}

export function installTabGroupPersistenceListeners() {
  if (!chrome.tabGroups?.onCreated?.addListener || !chrome.tabGroups?.onUpdated?.addListener) {
    return { installed: false, supported: false };
  }

  if (!chrome.tabGroups.onCreated.hasListener?.(handleManagedTabGroupChangeEvent)) {
    chrome.tabGroups.onCreated.addListener(handleManagedTabGroupChangeEvent);
  }
  if (!chrome.tabGroups.onUpdated.hasListener?.(handleManagedTabGroupChangeEvent)) {
    chrome.tabGroups.onUpdated.addListener(handleManagedTabGroupChangeEvent);
  }

  return { installed: true, supported: true };
}
