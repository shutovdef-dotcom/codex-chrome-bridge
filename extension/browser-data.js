import { requireConfirmed, requireSensitiveConfirmed } from './safety-gates.js';

export async function historySearch(payload) {
  requireConfirmed(payload, 'historySearch');
  if (!chrome.history) throw new Error('chrome.history API is unavailable; reload after granting the history permission');
  const results = await chrome.history.search({
    text: String(payload.query || ''),
    maxResults: Math.min(Math.max(Number(payload.limit || 25), 1), 200),
    startTime: payload.startTime ? Number(payload.startTime) : undefined,
    endTime: payload.endTime ? Number(payload.endTime) : undefined,
  });
  return {
    query: payload.query || '',
    results: results.map((item) => ({
      id: item.id,
      title: item.title,
      url: item.url,
      lastVisitTime: item.lastVisitTime,
      visitCount: item.visitCount,
      typedCount: item.typedCount,
    })),
  };
}

export async function bookmarksSearch(payload) {
  requireConfirmed(payload, 'bookmarksSearch');
  if (!chrome.bookmarks) throw new Error('chrome.bookmarks API is unavailable; reload after granting the bookmarks permission');
  const query = String(payload.query || '');
  const results = query ? await chrome.bookmarks.search(query) : await chrome.bookmarks.getTree();
  const flattened = flattenBookmarks(results).slice(0, Math.min(Math.max(Number(payload.limit || 50), 1), 200));
  return { query, results: flattened };
}

function flattenBookmarks(nodes, output = []) {
  for (const node of nodes || []) {
    if (node.url) {
      output.push({
        id: node.id,
        parentId: node.parentId,
        title: node.title,
        url: node.url,
        dateAdded: node.dateAdded,
      });
    }
    if (node.children) flattenBookmarks(node.children, output);
  }
  return output;
}

export async function cookiesList(payload) {
  requireConfirmed(payload, 'cookiesList');
  if (!chrome.cookies) throw new Error('chrome.cookies API is unavailable; reload after granting the cookies permission');
  if (payload.includeValues) requireSensitiveConfirmed(payload, 'cookiesList includeValues');
  if (!payload.url && !payload.domain && !payload.name) requireSensitiveConfirmed(payload, 'cookiesList without url/domain/name');
  const query = {};
  if (payload.url) query.url = payload.url;
  if (payload.domain) query.domain = payload.domain;
  if (payload.name) query.name = payload.name;
  const cookies = await chrome.cookies.getAll(query);
  const limit = Math.min(Math.max(Number(payload.limit || 50), 1), 500);
  return {
    query,
    count: cookies.length,
    cookies: cookies.slice(0, limit).map((cookie) => ({
      name: cookie.name,
      value: payload.includeValues ? cookie.value : undefined,
      domain: cookie.domain,
      path: cookie.path,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite,
      session: cookie.session,
      expirationDate: cookie.expirationDate,
      storeId: cookie.storeId,
    })),
  };
}

export async function fetchUrl(payload) {
  requireConfirmed(payload, 'fetchUrl');
  if (!payload.url) throw new Error('fetchUrl requires url');
  if (payload.credentials === 'include') requireSensitiveConfirmed(payload, 'fetchUrl credentials=include');
  const response = await fetch(payload.url, {
    method: String(payload.method || 'GET').toUpperCase(),
    headers: payload.headers && typeof payload.headers === 'object' ? payload.headers : undefined,
    body: payload.body === undefined ? undefined : String(payload.body),
    credentials: payload.credentials === 'include' ? 'include' : 'omit',
  });
  const text = await response.text();
  const maxChars = Math.min(Math.max(Number(payload.maxChars || 20_000), 100), 200_000);
  return {
    url: response.url,
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    headers: Object.fromEntries(Array.from(response.headers.entries()).slice(0, 100)),
    text: text.slice(0, maxChars),
    truncated: text.length > maxChars,
    length: text.length,
  };
}
