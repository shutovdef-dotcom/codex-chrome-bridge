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
  ]);
  const tabs = new Map([
    [11, { id: 11, windowId: 1, groupId: 101 }],
    [12, { id: 12, windowId: 1, groupId: 101 }],
    [21, { id: 21, windowId: 1, groupId: 202 }],
  ]);
  const updates = [];

  return {
    updates,
    storage: {
      local: {
        async get(keys) {
          const result = {};
          for (const key of keys) {
            if (key === 'codexManagedGroupTitles') result[key] = ['Codex Bridge Session A'];
          }
          return result;
        },
      },
    },
    tabs: {
      onUpdated: eventTarget(),
      onRemoved: eventTarget(),
      async query(query = {}) {
        return [...tabs.values()].filter((tab) => (
          !Number.isInteger(query.windowId) || tab.windowId === query.windowId
        ));
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
  };
}

globalThis.chrome = createFakeChrome();

const {
  handleManagedTabGroupChange,
  handleManagedTabGroupRemoved,
  installTabGroupPersistenceListeners,
  rememberManagedTabGroupMembership,
} = await import('../extension/tab-group-persistence.js');

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

if (failures.length) {
  for (const failure of failures) process.stderr.write(`- ${failure}\n`);
  process.exit(1);
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  listenerChecks: 5,
  managedChangeRemembered: managedChange.remembered,
  removalMetadata: Boolean(removed.savedGroupPersistence),
}, null, 2)}\n`);
