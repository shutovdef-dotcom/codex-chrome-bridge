#!/usr/bin/env node

const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function eventTarget() {
  const listeners = new Set();
  return {
    addListener(listener) {
      listeners.add(listener);
    },
    hasListener(listener) {
      return listeners.has(listener);
    },
    listenerCount() {
      return listeners.size;
    },
  };
}

function createFakeChrome() {
  const groups = new Map([
    [101, { id: 101, title: 'Codex Bridge Session A', color: 'purple', windowId: 1, saved: true }],
    [202, { id: 202, title: 'Unrelated', color: 'blue', windowId: 1, saved: true }],
    [303, { id: 303, title: 'Codex Bridge Session B', color: 'purple', windowId: 1 }],
    [404, { id: 404, title: 'Project Runtime Session', color: 'cyan', windowId: 1, saved: true }],
    [505, { id: 505, title: 'Project Write Session', color: 'cyan', windowId: 1, saved: true }],
  ]);
  const tabs = new Map([
    [11, { id: 11, windowId: 1, groupId: 101 }],
    [12, { id: 12, windowId: 1, groupId: 101 }],
    [21, { id: 21, windowId: 1, groupId: 202 }],
    [31, { id: 31, windowId: 1, groupId: 303 }],
    [32, { id: 32, windowId: 1, groupId: 303 }],
    [41, { id: 41, windowId: 1, groupId: 404 }],
    [51, { id: 51, windowId: 1, groupId: -1 }],
  ]);
  const localValues = { codexManagedGroupTitles: ['Codex Bridge Session A'] };
  const sessionValues = { codexManagedGroupIds: [404] };
  const updates = [];
  const savedClosedGroupChips = [];
  const localSets = [];
  const sessionSets = [];
  const groupCalls = [];

  function storageGet(keys, values) {
    const result = {};
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      if (Object.prototype.hasOwnProperty.call(values, key)) result[key] = values[key];
    }
    return result;
  }

  return {
    updates,
    localSets,
    sessionSets,
    groupCalls,
    storage: {
      local: {
        async get(keys) {
          return storageGet(keys, localValues);
        },
        async set(values) {
          localSets.push({ ...values });
          Object.assign(localValues, values);
        },
      },
      session: {
        async get(keys) {
          return storageGet(keys, sessionValues);
        },
        async set(values) {
          sessionSets.push({ ...values });
          Object.assign(sessionValues, values);
        },
      },
    },
    tabs: {
      onUpdated: eventTarget(),
      onRemoved: eventTarget(),
      async get(tabId) {
        const tab = tabs.get(tabId);
        if (!tab) throw new Error(`Missing tab ${tabId}`);
        return { ...tab };
      },
      async query(query = {}) {
        return [...tabs.values()].filter((tab) => (
          !Number.isInteger(query.windowId) || tab.windowId === query.windowId
        ));
      },
      async group(options = {}) {
        const tabIds = Array.isArray(options.tabIds) ? options.tabIds : [options.tabIds];
        const groupId = Number.isInteger(options.groupId) ? options.groupId : 606;
        groupCalls.push({ ...options, tabIds });
        if (!groups.has(groupId)) {
          groups.set(groupId, { id: groupId, title: '', color: 'grey', windowId: 1, saved: true });
        }
        for (const tabId of tabIds) {
          const tab = tabs.get(tabId);
          if (tab) tabs.set(tabId, { ...tab, groupId });
        }
        return groupId;
      },
      async ungroup(tabIds) {
        const ids = Array.isArray(tabIds) ? tabIds : [tabIds];
        for (const tabId of ids) {
          const tab = tabs.get(tabId);
          if (tab) tabs.set(tabId, { ...tab, groupId: -1 });
        }
      },
      async remove(tabIds) {
        const ids = Array.isArray(tabIds) ? tabIds : [tabIds];
        for (const tabId of ids) {
          const tab = tabs.get(tabId);
          const group = Number.isInteger(tab?.groupId) ? groups.get(tab.groupId) : null;
          if (group && group.saved !== false) {
            savedClosedGroupChips.push({ groupId: group.id, title: group.title });
          }
          tabs.delete(tabId);
        }
      },
    },
    tabGroups: {
      onCreated: eventTarget(),
      onUpdated: eventTarget(),
      onRemoved: eventTarget(),
      async get(groupId) {
        const group = groups.get(groupId);
        if (!group) throw new Error(`Missing group ${groupId}`);
        return { ...group };
      },
      async query() {
        return [...groups.values()].map((group) => ({ ...group }));
      },
      async update(groupId, patch) {
        const group = groups.get(groupId);
        if (!group) throw new Error(`Missing group ${groupId}`);
        const updated = { ...group, ...patch };
        groups.set(groupId, updated);
        updates.push({ groupId, patch });
        return { ...updated };
      },
    },
    savedClosedGroupChips,
  };
}

globalThis.chrome = createFakeChrome();

const {
  handleManagedTabGroupChange,
  handleManagedTabGroupRemoved,
  installTabGroupPersistenceListeners,
  rememberManagedTabGroupMembership,
} = await import('../extension/tab-group-persistence.js');
const {
  closeTabsWithGroupPersistenceMitigation,
} = await import('../extension/tab-cleanup.js');
const {
  ensureCodexGroupForTab,
} = await import('../extension/workspace-tabs.js');

const listenerInstall = installTabGroupPersistenceListeners();
check(listenerInstall.installed === true, 'tab-group persistence listeners must install against fake Chrome');
check(chrome.tabGroups.onCreated.listenerCount() === 1, 'must register tabGroups.onCreated listener');
check(chrome.tabGroups.onUpdated.listenerCount() === 1, 'must register tabGroups.onUpdated listener');
check(chrome.tabGroups.onRemoved.listenerCount() === 1, 'must register tabGroups.onRemoved listener');
check(chrome.tabs.onUpdated.listenerCount() === 1, 'must register tabs.onUpdated listener');
check(chrome.tabs.onRemoved.listenerCount() === 1, 'must register tabs.onRemoved listener');

const managedChange = await handleManagedTabGroupChange({
  id: 101,
  title: 'Codex Bridge Session A',
  color: 'purple',
  windowId: 1,
  saved: true,
});
check(managedChange.managed === true, 'managed group change must be recognized');
check(managedChange.disabled === true, 'managed group change must disable saved state');
check(managedChange.remembered === 2, 'managed group change must remember managed member tabs');

const unrelatedChange = await handleManagedTabGroupChange({
  id: 202,
  title: 'Unrelated',
  color: 'blue',
  windowId: 1,
  saved: true,
});
check(unrelatedChange.managed === false, 'unrelated group change must not be treated as managed');

const managedByStoredIdChange = await handleManagedTabGroupChange({
  id: 404,
  title: 'Project Runtime Session',
  color: 'cyan',
  windowId: 1,
  saved: true,
});
check(managedByStoredIdChange.managed === true, 'custom session group remembered by id must be recognized');
check(managedByStoredIdChange.disabled === true, 'custom session group remembered by id must disable saved state');
check(managedByStoredIdChange.remembered === 1, 'custom session group remembered by id must remember member tabs');

let sessionGroupIdWriteChecks = 0;
const ensuredCustomGroup = await ensureCodexGroupForTab(
  { id: 51, windowId: 1, groupId: -1 },
  { groupTitle: 'Project Write Session', groupColor: 'cyan' },
);
check(ensuredCustomGroup.id === 505, 'workspace grouping must reuse the custom target group');
check(
  chrome.groupCalls.some((call) => call.groupId === 505 && call.tabIds.includes(51)),
  'workspace grouping must place the tab into the custom target group',
);
check(
  chrome.sessionSets.some((entry) => entry.codexManagedGroupIds?.includes(505)),
  'workspace grouping must remember custom managed group ids in Chrome session storage',
);
check(
  chrome.localSets.every((entry) => !Object.prototype.hasOwnProperty.call(entry, 'codexManagedGroupIds')),
  'workspace grouping must not persist browser-session group ids in local storage',
);
sessionGroupIdWriteChecks = 4;

const membership = await rememberManagedTabGroupMembership({ id: 11, windowId: 1, groupId: 101 });
check(membership.remembered === true, 'managed tab membership update must be remembered');

const removed = await handleManagedTabGroupRemoved({
  id: 101,
  title: 'Codex Bridge Session A',
  color: 'purple',
  windowId: 1,
  saved: true,
});
check(removed.managed === true, 'managed group removal must be recognized');
check(
  removed.savedGroupPersistence?.disabled === true,
  'managed group removal must expose saved-group persistence metadata',
);

chrome.updates.length = 0;
await handleManagedTabGroupChange({
  id: 202,
  title: 'Codex Bridge Session A',
  color: 'purple',
  windowId: 1,
  saved: true,
});
await handleManagedTabGroupChange({
  id: 202,
  title: 'Unrelated',
  color: 'blue',
  windowId: 1,
  saved: true,
});
chrome.updates.length = 0;
await handleManagedTabGroupRemoved({
  id: 202,
  title: 'Unrelated',
  color: 'blue',
  windowId: 1,
  saved: true,
});
check(
  chrome.updates.every((entry) => entry.groupId !== 202),
  'unmanaged group removal must not disable saved state after stale membership is forgotten',
);

chrome.savedClosedGroupChips.length = 0;
const cleanup = await closeTabsWithGroupPersistenceMitigation([
  { id: 31, windowId: 1, groupId: 303 },
  { id: 32, windowId: 1, groupId: 303 },
]);
check(cleanup.ungroupedBeforeClose === true, 'bridge cleanup must ungroup managed tabs before close');
check(cleanup.savedClosedGroupChipPrevention?.prevented === true, 'bridge cleanup must report saved closed group chip prevention');
check(cleanup.savedClosedGroupChipPrevention?.method === 'ungroup-before-close', 'bridge cleanup must report ungroup-before-close chip prevention');
check(chrome.savedClosedGroupChips.length === 0, 'bridge cleanup must not create fake saved closed group chips');

if (failures.length) {
  for (const failure of failures) process.stderr.write(`- ${failure}\n`);
  process.exit(1);
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  listenerChecks: 5,
  managedChangeRemembered: managedChange.remembered,
  sessionGroupIdWriteChecks,
  removalMetadata: Boolean(removed.savedGroupPersistence),
  savedClosedGroupChipPrevention: cleanup.savedClosedGroupChipPrevention,
}, null, 2)}\n`);
