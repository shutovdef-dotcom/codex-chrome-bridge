export function groupInfo(group) {
  return {
    id: group.id,
    windowId: group.windowId,
    title: group.title,
    color: group.color,
    collapsed: group.collapsed,
  };
}

export function tabInfo(tab, options = {}) {
  const groups = options.groups || [];
  const group = options.group || groups.find((candidate) => candidate.id === tab.groupId) || null;
  return {
    id: tab.id,
    windowId: tab.windowId,
    index: tab.index,
    active: tab.active,
    groupId: Number.isInteger(tab.groupId) ? tab.groupId : undefined,
    group: group ? groupInfo(group) : null,
    title: tab.title,
    url: tab.url,
    status: tab.status,
  };
}
