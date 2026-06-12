import { sendDebuggerCommand, withDebugger } from './debugger-session.js';
import { requireConfirmed } from './safety-gates.js';
import { tabInfo } from './tab-info.js';
import { getTargetTab } from './workspace-tabs.js';

const NETWORK_PROFILES = Object.freeze({
  offline: {
    offline: true,
    latencyMs: 0,
    downloadKbps: 0,
    uploadKbps: 0,
  },
  'slow-3g': {
    offline: false,
    latencyMs: 400,
    downloadKbps: 500,
    uploadKbps: 500,
  },
  'fast-3g': {
    offline: false,
    latencyMs: 150,
    downloadKbps: 1600,
    uploadKbps: 750,
  },
  'slow-4g': {
    offline: false,
    latencyMs: 120,
    downloadKbps: 4000,
    uploadKbps: 3000,
  },
  wifi: {
    offline: false,
    latencyMs: 30,
    downloadKbps: 30000,
    uploadKbps: 15000,
  },
  'no-throttling': {
    offline: false,
    latencyMs: 0,
    downloadKbps: -1,
    uploadKbps: -1,
  },
});

function positiveInt(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function finiteNumber(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
  return parsed;
}

function kbpsToBytesPerSecond(value) {
  if (value < 0) return -1;
  return Math.round((value * 1024) / 8);
}

function resetHints(tabId) {
  return {
    cli: `chrome-bridge clear-emulation --confirm${Number.isInteger(tabId) ? ` --tab ${tabId}` : ''}`,
    mcp: {
      tool: 'chrome_bridge_clear_emulation',
      arguments: {
        ...(Number.isInteger(tabId) ? { tabId } : {}),
        confirmed: true,
      },
    },
  };
}

function resolveViewportSettings(payload = {}) {
  return {
    width: positiveInt(payload.width, 'setViewport.width'),
    height: positiveInt(payload.height, 'setViewport.height'),
    deviceScaleFactor: payload.deviceScaleFactor === undefined ? 1 : finiteNumber(payload.deviceScaleFactor, 'setViewport.deviceScaleFactor'),
    mobile: Boolean(payload.mobile),
  };
}

function resolveNetworkSettings(payload = {}) {
  const profile = String(payload.networkProfile || '').trim().toLowerCase();
  if (!profile) throw new Error('emulateNetwork requires networkProfile');
  if (profile === 'custom') {
    return {
      profile,
      offline: false,
      latencyMs: positiveInt(payload.latencyMs, 'emulateNetwork.latencyMs'),
      downloadKbps: positiveInt(payload.downloadKbps, 'emulateNetwork.downloadKbps'),
      uploadKbps: positiveInt(payload.uploadKbps, 'emulateNetwork.uploadKbps'),
    };
  }
  const preset = NETWORK_PROFILES[profile];
  if (!preset) {
    throw new Error(`Unsupported networkProfile: ${profile}`);
  }
  return {
    profile,
    ...preset,
  };
}

export async function setViewport(payload = {}) {
  requireConfirmed(payload, 'setViewport');
  const tab = await getTargetTab(payload);
  const settings = resolveViewportSettings(payload);
  await withDebugger(tab.id, async () => {
    await sendDebuggerCommand(tab.id, 'Page.enable');
    await sendDebuggerCommand(tab.id, 'Emulation.setDeviceMetricsOverride', {
      width: settings.width,
      height: settings.height,
      deviceScaleFactor: settings.deviceScaleFactor,
      mobile: settings.mobile,
      screenWidth: settings.width,
      screenHeight: settings.height,
    });
    await sendDebuggerCommand(tab.id, 'Emulation.setTouchEmulationEnabled', {
      enabled: settings.mobile,
      maxTouchPoints: settings.mobile ? 1 : 0,
    });
  });
  const latest = await chrome.tabs.get(tab.id);
  return {
    ok: true,
    tab: tabInfo(latest),
    viewport: settings,
    reset: resetHints(tab.id),
    note: 'Viewport emulation stays active for this tab until clear-emulation runs or the tab reloads in a way that resets debugger state.',
  };
}

export async function emulateNetwork(payload = {}) {
  requireConfirmed(payload, 'emulateNetwork');
  const tab = await getTargetTab(payload);
  const settings = resolveNetworkSettings(payload);
  await withDebugger(tab.id, async () => {
    await sendDebuggerCommand(tab.id, 'Network.enable');
    await sendDebuggerCommand(tab.id, 'Network.emulateNetworkConditions', {
      offline: settings.offline,
      latency: settings.latencyMs,
      downloadThroughput: kbpsToBytesPerSecond(settings.downloadKbps),
      uploadThroughput: kbpsToBytesPerSecond(settings.uploadKbps),
    });
  });
  const latest = await chrome.tabs.get(tab.id);
  return {
    ok: true,
    tab: tabInfo(latest),
    network: settings,
    reset: resetHints(tab.id),
    note: 'Network emulation stays active for this tab until clear-emulation runs or debugger state is reset.',
  };
}

export async function clearEmulation(payload = {}) {
  requireConfirmed(payload, 'clearEmulation');
  const tab = await getTargetTab(payload);
  await withDebugger(tab.id, async () => {
    await sendDebuggerCommand(tab.id, 'Emulation.clearDeviceMetricsOverride');
    await sendDebuggerCommand(tab.id, 'Emulation.setTouchEmulationEnabled', {
      enabled: false,
      maxTouchPoints: 0,
    });
    await sendDebuggerCommand(tab.id, 'Network.enable');
    await sendDebuggerCommand(tab.id, 'Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
  });
  const latest = await chrome.tabs.get(tab.id);
  return {
    ok: true,
    tab: tabInfo(latest),
    cleared: ['viewport', 'network'],
  };
}
