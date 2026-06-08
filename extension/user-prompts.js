import { closeTabsWithGroupPersistenceMitigation } from './tab-cleanup.js';
import { groupInfo } from './tab-info.js';
import { waitForTabComplete } from './tab-loading.js';
import {
  chromeId,
  ensureCodexGroupForTab,
  getCodexGroupTabs,
  storageGet,
  storageRemove,
  storageSet,
} from './workspace-tabs.js';

const MAX_USER_PROMPT_CHOICES = 8;
const pendingUserPrompts = new Map();

function normalizePromptChoices(choices = []) {
  if (!Array.isArray(choices)) return [];
  return choices.slice(0, MAX_USER_PROMPT_CHOICES).map((choice, index) => {
    if (choice && typeof choice === 'object') {
      const value = choice.value === undefined ? String(index + 1) : String(choice.value);
      const label = choice.label === undefined ? value : String(choice.label);
      return { value, label };
    }
    return {
      value: String(choice),
      label: String(choice),
    };
  });
}

function publicUserPrompt(prompt) {
  return {
    id: prompt.id,
    question: prompt.question,
    choices: prompt.choices,
    allowText: prompt.allowText,
    createdAt: prompt.createdAt,
  };
}

export function userPromptResponse(requestId) {
  const prompt = pendingUserPrompts.get(requestId);
  return {
    ok: Boolean(prompt),
    prompt: prompt ? publicUserPrompt(prompt) : null,
  };
}

export function handlePromptTabRemoved(tabId) {
  for (const prompt of pendingUserPrompts.values()) {
    if (prompt.tabId === tabId) {
      completeUserPrompt(prompt.id, {
        canceled: true,
        reason: 'prompt tab closed',
      });
    }
  }
}

export async function askUser(payload = {}) {
  const question = String(payload.question || '').trim();
  if (!question) throw new Error('askUser requires question');

  const id = crypto.randomUUID();
  const choices = normalizePromptChoices(payload.choices);
  const timeoutMs = Math.min(Math.max(Number(payload.timeoutMs || 300_000), 5_000), 1_800_000);
  const allowText = payload.allowText !== false;
  const closeOnAnswer = payload.closeOnAnswer !== false;
  const previous = await storageGet(['codexTabId', 'codexWindowId']);
  const promptUrl = chrome.runtime.getURL(`ask.html?id=${encodeURIComponent(id)}`);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      completeUserPrompt(id, {
        canceled: true,
        reason: 'timeout',
      });
    }, timeoutMs);

    pendingUserPrompts.set(id, {
      id,
      question,
      choices,
      allowText,
      closeOnAnswer,
      createdAt: new Date().toISOString(),
      timeout,
      tabId: null,
      previous,
      resolve,
      group: null,
    });

    createPromptTab(promptUrl, payload, previous)
      .then(({ tab, group }) => {
        const prompt = pendingUserPrompts.get(id);
        if (!prompt) {
          closeTabsWithGroupPersistenceMitigation([tab], { ignoreMissing: true }).catch(() => {});
          return;
        }
        prompt.tabId = tab.id;
        prompt.group = groupInfo(group);
      })
      .catch((error) => {
        pendingUserPrompts.delete(id);
        clearTimeout(timeout);
        restoreStoredCodexTarget(previous).catch(() => {});
        reject(error);
      });
  });
}

async function createPromptTab(url, payload, previous = {}) {
  const tabs = await getCodexGroupTabs(payload);
  let tab;

  if (tabs.length) {
    const active = tabs.find((candidate) => candidate.active) || tabs[0];
    tab = await chrome.tabs.create({
      windowId: active.windowId,
      index: active.index + 1,
      url,
      active: true,
    });
  } else {
    const created = await chrome.windows.create({
      url,
      focused: true,
      width: 720,
      height: 520,
      left: 120,
      top: 120,
      type: 'normal',
    });
    tab = created.tabs?.[0];
  }

  if (chromeId(tab?.id) === null) throw new Error('Failed to create user prompt tab');
  const group = await ensureCodexGroupForTab(tab, payload);
  const loaded = await waitForTabComplete(tab.id);
  await restoreStoredCodexTarget(previous);
  return { tab: loaded, group };
}

async function restoreStoredCodexTarget(previous = {}) {
  if (chromeId(previous.codexTabId) !== null) {
    await storageSet({
      codexTabId: previous.codexTabId,
      codexWindowId: previous.codexWindowId,
    });
    return;
  }
  await storageRemove(['codexTabId', 'codexWindowId']);
}

export function completeUserPrompt(requestId, answer = {}) {
  const prompt = pendingUserPrompts.get(requestId);
  if (!prompt) return false;

  pendingUserPrompts.delete(requestId);
  clearTimeout(prompt.timeout);

  const respondedAt = new Date().toISOString();
  const result = {
    id: prompt.id,
    question: prompt.question,
    canceled: Boolean(answer.canceled),
    reason: answer.reason || null,
    answer: answer.canceled ? null : {
      value: answer.value === undefined ? null : String(answer.value),
      text: answer.text === undefined ? null : String(answer.text),
      choice: answer.choice || null,
    },
    tabId: prompt.tabId,
    group: prompt.group,
    createdAt: prompt.createdAt,
    respondedAt,
  };

  prompt.resolve(result);

  if (prompt.closeOnAnswer && chromeId(prompt.tabId) !== null) {
    closeTabsWithGroupPersistenceMitigation([prompt.tabId], { ignoreMissing: true }).catch(() => {});
  }
  restoreStoredCodexTarget(prompt.previous).catch(() => {});
  return true;
}
