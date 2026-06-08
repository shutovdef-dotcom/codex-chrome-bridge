import { DEFAULT_GROUP_TITLE, groupOptions } from './workspace-policy.js';

const BRIDGE_MANAGED_TITLE_PREFIXES = [
  `${DEFAULT_GROUP_TITLE} `,
  `${DEFAULT_GROUP_TITLE}-`,
  `${DEFAULT_GROUP_TITLE}:`,
  `${DEFAULT_GROUP_TITLE}/`,
  `${DEFAULT_GROUP_TITLE}#`,
];
const rememberedManagedTabs = new Map();

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

function isBridgeManagedTitle(title) {
  const normalized = normalizedString(title);
  return normalized === DEFAULT_GROUP_TITLE
    || BRIDGE_MANAGED_TITLE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
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
    'codexManagedGroupTitles',
    'codexWorkspaceGroupTitle',
  ]).catch(() => ({}));
  const options = await groupOptions().catch(() => ({ title: DEFAULT_GROUP_TITLE }));
  const rememberedTitles = Array.isArray(stored.codexManagedGroupTitles)
    ? stored.codexManagedGroupTitles
    : [];

  return {
    groupIds: integerSet([stored.codexGroupId]),
    groupTitles: titleSet([
      DEFAULT_GROUP_TITLE,
      ...rememberedTitles,
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
  if (context.groupTitles.has(title) || isBridgeManagedTitle(title)) return true;
  return !title && context.groupIds.has(group.id);
}

function rememberManagedTab(tab, group) {
  if (!Number.isInteger(tab?.id) || !Number.isInteger(group?.id) || group.id < 0) return;
  rememberedManagedTabs.set(tab.id, {
    groupId: group.id,
    windowId: Number.isInteger(group.windowId) ? group.windowId : tab.windowId,
  });
}

function forgetManagedGroupTabs(groupId) {
  for (const [tabId, membership] of rememberedManagedTabs.entries()) {
    if (membership.groupId === groupId) {
      rememberedManagedTabs.delete(tabId);
    }
  }
}

async function rememberManagedGroupTabs(group) {
  if (!Number.isInteger(group?.id) || !chrome.tabs?.query) return { remembered: 0 };
  const query = Number.isInteger(group.windowId) ? { windowId: group.windowId } : {};
  const tabs = await chrome.tabs.query(query).catch(() => []);
  let remembered = 0;
  for (const tab of tabs) {
    if (tab.groupId !== group.id) continue;
    rememberManagedTab(tab, group);
    remembered += 1;
  }
  return { remembered };
}

export async function rememberManagedTabGroupMembership(tab) {
  if (!Number.isInteger(tab?.id)) return { remembered: false, reason: 'missing tab id' };
  if (!Number.isInteger(tab.groupId) || tab.groupId < 0) {
    rememberedManagedTabs.delete(tab.id);
    return { remembered: false, reason: 'ungrouped tab' };
  }
  if (!chrome.tabGroups?.get) return { remembered: false, reason: 'chrome.tabGroups unavailable' };

  let group;
  try {
    group = await chrome.tabGroups.get(tab.groupId);
  } catch (error) {
    rememberedManagedTabs.delete(tab.id);
    return { remembered: false, error: errorMessage(error) };
  }

  if (!(await isManagedCodexGroup(group))) {
    rememberedManagedTabs.delete(tab.id);
    return { remembered: false, groupId: group.id, managed: false };
  }

  rememberManagedTab(tab, group);
  return { remembered: true, groupId: group.id, windowId: group.windowId, managed: true };
}

export async function handleManagedTabGroupChange(group) {
  if (!(await isManagedCodexGroup(group))) {
    forgetManagedGroupTabs(group?.id);
    return { managed: false, groupId: group?.id };
  }

  const result = await disableSavedTabGroupIfSupported(group);
  const membership = await rememberManagedGroupTabs(group);
  return { ...result, ...membership, managed: true };
}

export async function handleManagedTabGroupRemoved(group) {
  const managed = await isManagedCodexGroup(group);
  const savedGroupPersistence = managed
    ? await disableSavedTabGroupIfSupported(group)
    : undefined;
  if (group) forgetManagedGroupTabs(group.id);
  return { groupId: group?.id, managed, savedGroupPersistence };
}

async function handleManagedTabRemoved(tabId, removeInfo = {}) {
  const membership = rememberedManagedTabs.get(tabId);
  rememberedManagedTabs.delete(tabId);
  if (!membership) return { managed: false };

  const result = removeInfo.isWindowClosing
    ? { attempted: false, reason: 'window closing' }
    : await disableSavedTabGroupIfSupported(membership.groupId);

  return {
    managed: true,
    groupId: membership.groupId,
    windowId: membership.windowId,
    savedGroupPersistence: result,
  };
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

function handleManagedTabGroupRemovedEvent(group) {
  handleManagedTabGroupRemoved(group).catch(() => {});
}

function handleTabUpdatedEvent(_tabId, changeInfo, tab) {
  if (!Object.prototype.hasOwnProperty.call(changeInfo || {}, 'groupId')) return;
  rememberManagedTabGroupMembership(tab).catch(() => {});
}

function handleTabRemovedEvent(tabId, removeInfo) {
  handleManagedTabRemoved(tabId, removeInfo).catch(() => {});
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
  if (
    chrome.tabGroups.onRemoved?.addListener
    && !chrome.tabGroups.onRemoved.hasListener?.(handleManagedTabGroupRemovedEvent)
  ) {
    chrome.tabGroups.onRemoved.addListener(handleManagedTabGroupRemovedEvent);
  }
  if (
    chrome.tabs?.onUpdated?.addListener
    && !chrome.tabs.onUpdated.hasListener?.(handleTabUpdatedEvent)
  ) {
    chrome.tabs.onUpdated.addListener(handleTabUpdatedEvent);
  }
  if (
    chrome.tabs?.onRemoved?.addListener
    && !chrome.tabs.onRemoved.hasListener?.(handleTabRemovedEvent)
  ) {
    chrome.tabs.onRemoved.addListener(handleTabRemovedEvent);
  }

  return { installed: true, supported: true };
}
