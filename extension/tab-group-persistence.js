function errorMessage(error) {
  return String(error?.message || error);
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
