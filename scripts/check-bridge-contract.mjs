#!/usr/bin/env node
import WebSocket from 'ws';
import { BRIDGE_VERSION } from '../shared/command-registry.mjs';
import { createBridgeServer } from '../server/bridge-server.mjs';

const results = [];
const EXTENSION_ORIGIN = 'chrome-extension://contract-test';
const CONTRACT_FETCH_TIMEOUT_MS = 5_000;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(baseUrl, pathname, options = {}) {
  const response = await contractFetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { ok: false, error: text };
  }
  return { response, json };
}

function contractFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    signal: options.signal || AbortSignal.timeout(CONTRACT_FETCH_TIMEOUT_MS),
  });
}

function extensionRequestOptions(options = {}) {
  return {
    ...options,
    headers: {
      origin: EXTENSION_ORIGIN,
      ...(options.headers || {}),
    },
  };
}

async function withBridge(options, fn) {
  const bridge = createBridgeServer({ port: '0', ...options });
  await bridge.listen();
  const address = bridge.server.address();
  const port = typeof address === 'object' && address ? address.port : bridge.port;
  try {
    return await fn({ bridge, baseUrl: `http://127.0.0.1:${port}` });
  } finally {
    await bridge.close();
  }
}

async function openExtensionSocket(baseUrl) {
  const wsUrl = `${baseUrl.replace(/^http:/, 'ws:')}/extension`;
  const socket = new WebSocket(wsUrl, {
    headers: { origin: EXTENSION_ORIGIN },
  });
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  return socket;
}

async function openRawSocket(baseUrl, options = {}) {
  const wsUrl = `${baseUrl.replace(/^http:/, 'ws:')}${options.pathname || '/extension'}`;
  const socket = new WebSocket(wsUrl, options);
  return new Promise((resolve, reject) => {
    socket.once('open', () => resolve({ opened: true, socket }));
    socket.once('unexpected-response', (_request, response) => {
      resolve({ opened: false, statusCode: response.statusCode, socket });
    });
    socket.once('error', reject);
  });
}

async function waitForSocketClose(socket, timeoutMs = 500) {
  if (socket.readyState === WebSocket.CLOSED) return true;
  return Promise.race([
    new Promise((resolve) => socket.once('close', () => resolve(true))),
    delay(timeoutMs).then(() => false),
  ]);
}

async function withExtensionSocket(baseUrl, fn) {
  const socket = await openExtensionSocket(baseUrl);
  try {
    return await fn(socket);
  } finally {
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close(1000, 'contract test complete');
    }
  }
}

async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({
      name,
      ok: false,
      error: String(error?.message || error),
    });
  }
}

await check('rejects unsafe host without explicit override', async () => {
  let rejected = false;
  try {
    createBridgeServer({ host: '0.0.0.0', port: '0' });
  } catch (error) {
    rejected = error?.code === 'UNSAFE_HOST';
  }
  assert(rejected, 'expected UNSAFE_HOST rejection');
});

await check('rejects invalid bind ports before listen', async () => {
  for (const port of ['nope', '-1', '65536', '1.5']) {
    let rejected = false;
    try {
      createBridgeServer({ port });
    } catch (error) {
      rejected = error?.code === 'INVALID_PORT'
        && String(error?.message || '').includes('port must be an integer between 0 and 65535');
    }
    assert(rejected, `expected INVALID_PORT rejection for ${port}`);
  }
});

await check('keeps long-poll transport disabled by default', async () => {
  await withBridge({}, async ({ baseUrl }) => {
    const { response, json } = await requestJson(baseUrl, '/extension/hello', {
      method: 'POST',
      body: JSON.stringify({ info: { version: BRIDGE_VERSION } }),
    });
    assert(response.status === 404, `expected 404, got ${response.status}`);
    assert(json.code === 'TRANSPORT_DISABLED', `expected TRANSPORT_DISABLED, got ${json.code}`);
  });
});

await check('rejects unsupported actions before extension dispatch', async () => {
  await withBridge({}, async ({ baseUrl }) => {
    const { response, json } = await requestJson(baseUrl, '/command', {
      method: 'POST',
      body: JSON.stringify({ action: 'nope', payload: {} }),
    });
    assert(response.status === 400, `expected 400, got ${response.status}`);
    assert(json.code === 'UNSUPPORTED_ACTION', `expected UNSUPPORTED_ACTION, got ${json.code}`);
  });
});

await check('rejects malformed command payloads before extension dispatch', async () => {
  await withBridge({}, async ({ baseUrl }) => {
    const { response, json } = await requestJson(baseUrl, '/command', {
      method: 'POST',
      body: JSON.stringify({ action: 'open', payload: { url: 'javascript:alert(1)' } }),
    });
    assert(response.status === 400, `expected 400, got ${response.status}`);
    assert(json.code === 'INVALID_PAYLOAD', `expected INVALID_PAYLOAD, got ${json.code}`);
  });
});

await check('rejects invalid workspace group colors before extension dispatch', async () => {
  await withBridge({}, async ({ baseUrl }) => {
    const { response, json } = await requestJson(baseUrl, '/command', {
      method: 'POST',
      body: JSON.stringify({ action: 'setWorkspace', payload: { groupColor: 'violet', confirmed: true } }),
    });
    assert(response.status === 400, `expected 400, got ${response.status}`);
    assert(json.code === 'INVALID_PAYLOAD', `expected INVALID_PAYLOAD, got ${json.code}`);
  });
});

await check('rejects JSON POST bodies without application/json content type', async () => {
  await withBridge({}, async ({ baseUrl }) => {
    const { response, json } = await requestJson(baseUrl, '/command', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ action: 'click', payload: { selector: 'button', confirmed: true } }),
    });
    assert(response.status === 415, `expected 415, got ${response.status}`);
    assert(json.code === 'UNSUPPORTED_MEDIA_TYPE', `expected UNSUPPORTED_MEDIA_TYPE, got ${json.code}`);
  });
});

await check('only exposes CORS preflight on extension ingress paths', async () => {
  await withBridge({}, async ({ baseUrl }) => {
    const commandPreflight = await contractFetch(`${baseUrl}/command`, {
      method: 'OPTIONS',
      headers: { origin: EXTENSION_ORIGIN },
    });
    assert(commandPreflight.status === 204, `expected 204, got ${commandPreflight.status}`);
    assert(
      commandPreflight.headers.get('access-control-allow-origin') === null,
      'expected /command preflight not to expose access-control-allow-origin',
    );

    const extensionPreflight = await contractFetch(`${baseUrl}/extension/hello`, {
      method: 'OPTIONS',
      headers: { origin: EXTENSION_ORIGIN },
    });
    assert(extensionPreflight.status === 204, `expected 204, got ${extensionPreflight.status}`);
    assert(
      extensionPreflight.headers.get('access-control-allow-origin') === EXTENSION_ORIGIN,
      'expected extension ingress preflight to expose access-control-allow-origin',
    );
  });
});

await check('rejects direct command requests from web origins', async () => {
  await withBridge({}, async ({ baseUrl }) => {
    const { response, json } = await requestJson(baseUrl, '/command', {
      method: 'POST',
      headers: { origin: 'http://127.0.0.1:9999' },
      body: JSON.stringify({ action: 'text', payload: {} }),
    });
    assert(response.status === 403, `expected 403, got ${response.status}`);
    assert(json.code === 'INVALID_COMMAND_ORIGIN', `expected INVALID_COMMAND_ORIGIN, got ${json.code}`);
  });
});

await check('rejects direct command requests from extension origins', async () => {
  await withBridge({}, async ({ baseUrl }) => {
    const { response, json } = await requestJson(baseUrl, '/command', {
      method: 'POST',
      headers: { origin: EXTENSION_ORIGIN },
      body: JSON.stringify({ action: 'text', payload: {} }),
    });
    assert(response.status === 403, `expected 403, got ${response.status}`);
    assert(json.code === 'INVALID_COMMAND_ORIGIN', `expected INVALID_COMMAND_ORIGIN, got ${json.code}`);
  });
});

await check('rejects missing confirmation gates before extension dispatch', async () => {
  await withBridge({}, async ({ baseUrl }) => {
    const { response, json } = await requestJson(baseUrl, '/command', {
      method: 'POST',
      body: JSON.stringify({ action: 'click', payload: { selector: 'button' } }),
    });
    assert(response.status === 400, `expected 400, got ${response.status}`);
    assert(json.code === 'CONFIRMATION_REQUIRED', `expected CONFIRMATION_REQUIRED, got ${json.code}`);
  });
});

await check('rejects extension reload without confirmation before extension dispatch', async () => {
  await withBridge({}, async ({ baseUrl }) => {
    const { response, json } = await requestJson(baseUrl, '/command', {
      method: 'POST',
      body: JSON.stringify({ action: 'reloadExtension', payload: {} }),
    });
    assert(response.status === 400, `expected 400, got ${response.status}`);
    assert(json.code === 'CONFIRMATION_REQUIRED', `expected CONFIRMATION_REQUIRED, got ${json.code}`);
  });
});

await check('rejects includeAll tab inventory without confirmation before extension dispatch', async () => {
  await withBridge({}, async ({ baseUrl }) => {
    const { response, json } = await requestJson(baseUrl, '/command', {
      method: 'POST',
      body: JSON.stringify({ action: 'tabs', payload: { includeAll: true } }),
    });
    assert(response.status === 400, `expected 400, got ${response.status}`);
    assert(json.code === 'CONFIRMATION_REQUIRED', `expected CONFIRMATION_REQUIRED, got ${json.code}`);
  });
});

await check('rejects missing sensitive confirmation gates before extension dispatch', async () => {
  await withBridge({}, async ({ baseUrl }) => {
    const { response, json } = await requestJson(baseUrl, '/command', {
      method: 'POST',
      body: JSON.stringify({
        action: 'fetchUrl',
        payload: { url: 'https://example.com', credentials: 'include', confirmed: true },
      }),
    });
    assert(response.status === 400, `expected 400, got ${response.status}`);
    assert(json.code === 'SENSITIVE_CONFIRMATION_REQUIRED', `expected SENSITIVE_CONFIRMATION_REQUIRED, got ${json.code}`);
  });
});

await check('rejects invalid top-level command timeout before dispatch', async () => {
  await withBridge({}, async ({ baseUrl }) => {
    const { response, json } = await requestJson(baseUrl, '/command', {
      method: 'POST',
      body: JSON.stringify({ action: 'text', payload: {}, timeoutMs: 'not-a-number' }),
    });
    assert(response.status === 400, `expected 400, got ${response.status}`);
    assert(json.code === 'INVALID_TIMEOUT', `expected INVALID_TIMEOUT, got ${json.code}`);
  });
});

await check('rejects unknown top-level command envelope fields before dispatch', async () => {
  await withBridge({}, async ({ baseUrl }) => {
    const { response, json } = await requestJson(baseUrl, '/command', {
      method: 'POST',
      body: JSON.stringify({ action: 'text', payload: {}, extra: true }),
    });
    assert(response.status === 400, `expected 400, got ${response.status}`);
    assert(json.code === 'INVALID_COMMAND_BODY', `expected INVALID_COMMAND_BODY, got ${json.code}`);
  });
});

await check('returns stable 503 when extension is not connected', async () => {
  await withBridge({}, async ({ baseUrl }) => {
    const { response, json } = await requestJson(baseUrl, '/command', {
      method: 'POST',
      body: JSON.stringify({ action: 'text', payload: {} }),
    });
    assert(response.status === 503, `expected 503, got ${response.status}`);
    assert(json.code === 'EXTENSION_NOT_CONNECTED', `expected EXTENSION_NOT_CONNECTED, got ${json.code}`);
  });
});

await check('rejects malformed JSON request bodies', async () => {
  await withBridge({}, async ({ baseUrl }) => {
    const { response, json } = await requestJson(baseUrl, '/command', {
      method: 'POST',
      body: '{"action":',
    });
    assert(response.status === 400, `expected 400, got ${response.status}`);
    assert(json.code === 'INVALID_JSON', `expected INVALID_JSON, got ${json.code}`);
  });
});

await check('rejects oversized JSON request bodies with structured 413', async () => {
  await withBridge({}, async ({ baseUrl }) => {
    const oversizedBody = JSON.stringify({
      action: 'text',
      payload: {},
      padding: 'x'.repeat(2_000_001),
    });
    const { response, json } = await requestJson(baseUrl, '/command', {
      method: 'POST',
      body: oversizedBody,
    });
    assert(response.status === 413, `expected 413, got ${response.status}`);
    assert(json.code === 'REQUEST_TOO_LARGE', `expected REQUEST_TOO_LARGE, got ${json.code}`);

    const followUp = await requestJson(baseUrl, '/command', {
      method: 'POST',
      body: JSON.stringify({ action: 'nope', payload: {} }),
    });
    assert(followUp.response.status === 400, `expected follow-up 400, got ${followUp.response.status}`);
    assert(
      followUp.json.code === 'UNSUPPORTED_ACTION',
      `expected follow-up UNSUPPORTED_ACTION, got ${followUp.json.code}`,
    );
  });
});

await check('fails closed on stale extension versions', async () => {
  await withBridge({ enableLongPoll: true }, async ({ baseUrl }) => {
    await requestJson(baseUrl, '/extension/hello', extensionRequestOptions({
      method: 'POST',
      body: JSON.stringify({ info: { version: '0.0.0-stale', test: true } }),
    }));
    const { response, json } = await requestJson(baseUrl, '/command', {
      method: 'POST',
      body: JSON.stringify({ action: 'text', payload: {}, timeoutMs: 5_000 }),
    });
    assert(response.status === 409, `expected 409, got ${response.status}`);
    assert(json.code === 'VERSION_MISMATCH', `expected VERSION_MISMATCH, got ${json.code}`);
  });
});

await check('allows confirmed extension reload on stale extension versions', async () => {
  await withBridge({ enableLongPoll: true }, async ({ baseUrl }) => {
    await requestJson(baseUrl, '/extension/hello', extensionRequestOptions({
      method: 'POST',
      body: JSON.stringify({ info: { version: '0.0.0-stale', test: true } }),
    }));

    const commandPromise = requestJson(baseUrl, '/command', {
      method: 'POST',
      body: JSON.stringify({
        action: 'reloadExtension',
        payload: { confirmed: true },
        timeoutMs: 5_000,
      }),
    });
    const { json: pollJson } = await requestJson(
      baseUrl,
      '/extension/poll?client=contract-test',
      extensionRequestOptions(),
    );
    const [command] = pollJson.commands || [];
    assert(command?.id, 'expected queued reloadExtension command from poll');
    assert(command.action === 'reloadExtension', `expected reloadExtension action, got ${command.action}`);

    await requestJson(baseUrl, '/extension/result', extensionRequestOptions({
      method: 'POST',
      body: JSON.stringify({
        id: command.id,
        ok: true,
        result: { reloading: true },
        info: { version: '0.0.0-stale' },
      }),
    }));

    const { response, json } = await commandPromise;
    assert(response.status === 200, `expected 200, got ${response.status}`);
    assert(json.ok === true, `expected ok=true, got ${JSON.stringify(json)}`);
    assert(json.result?.reloading === true, `expected reload result, got ${JSON.stringify(json.result)}`);
  });
});

await check('rejects long-poll extension requests without extension origin', async () => {
  await withBridge({ enableLongPoll: true }, async ({ baseUrl }) => {
    const missingOrigin = await requestJson(baseUrl, '/extension/hello', {
      method: 'POST',
      body: JSON.stringify({ info: { version: BRIDGE_VERSION } }),
    });
    assert(missingOrigin.response.status === 403, `expected 403, got ${missingOrigin.response.status}`);
    assert(missingOrigin.json.code === 'INVALID_EXTENSION_ORIGIN', `expected INVALID_EXTENSION_ORIGIN, got ${missingOrigin.json.code}`);

    const wrongOrigin = await requestJson(baseUrl, '/extension/poll?client=contract-test', {
      headers: { origin: 'http://127.0.0.1' },
    });
    assert(wrongOrigin.response.status === 403, `expected 403, got ${wrongOrigin.response.status}`);
    assert(wrongOrigin.json.code === 'INVALID_EXTENSION_ORIGIN', `expected INVALID_EXTENSION_ORIGIN, got ${wrongOrigin.json.code}`);
  });
});

await check('strips unsafe long-poll extension metadata before health exposure', async () => {
  await withBridge({ enableLongPoll: true }, async ({ baseUrl }) => {
    const unsafeInfo = JSON.parse(`{
      "version": "${BRIDGE_VERSION}",
      "extensionId": "contract-test",
      "clientId": "safe-client",
      "extra": "drop-me",
      "__proto__": { "polluted": true },
      "constructor": { "prototype": { "polluted": true } },
      "prototype": { "polluted": true }
    }`);
    const hello = await requestJson(baseUrl, '/extension/hello', extensionRequestOptions({
      method: 'POST',
      body: JSON.stringify({ info: unsafeInfo }),
    }));
    assert(hello.response.status === 200, `expected hello 200, got ${hello.response.status}`);

    const health = await requestJson(baseUrl, '/health');
    const info = health.json.extension?.info || {};
    assert(info.version === BRIDGE_VERSION, `expected safe version metadata, got ${JSON.stringify(info)}`);
    assert(info.clientId === 'safe-client', `expected safe clientId metadata, got ${JSON.stringify(info)}`);
    assert(!Object.prototype.hasOwnProperty.call(info, '__proto__'), 'expected __proto__ metadata to be stripped');
    assert(!Object.prototype.hasOwnProperty.call(info, 'constructor'), 'expected constructor metadata to be stripped');
    assert(!Object.prototype.hasOwnProperty.call(info, 'prototype'), 'expected prototype metadata to be stripped');
    assert(!Object.prototype.hasOwnProperty.call(info, 'extra'), 'expected non-allowlisted metadata to be stripped');
    assert({}.polluted === undefined, 'expected Object.prototype not to be polluted');
  });
});

await check('rejects extension hello when origin and extension id mismatch', async () => {
  await withBridge({ enableLongPoll: true }, async ({ baseUrl }) => {
    const { response, json } = await requestJson(baseUrl, '/extension/hello', extensionRequestOptions({
      method: 'POST',
      body: JSON.stringify({ info: { version: BRIDGE_VERSION, extensionId: 'different-extension-id' } }),
    }));
    assert(response.status === 403, `expected 403, got ${response.status}`);
    assert(json.code === 'EXTENSION_ID_MISMATCH', `expected EXTENSION_ID_MISMATCH, got ${json.code}`);
  });
});

await check('rejects long-poll extension polls from a different known extension id', async () => {
  await withBridge({ enableLongPoll: true }, async ({ baseUrl }) => {
    const hello = await requestJson(baseUrl, '/extension/hello', extensionRequestOptions({
      method: 'POST',
      body: JSON.stringify({ info: { version: BRIDGE_VERSION, extensionId: 'contract-test' } }),
    }));
    assert(hello.response.status === 200, `expected hello 200, got ${hello.response.status}`);

    const { response, json } = await requestJson(baseUrl, '/extension/poll?client=contract-test', {
      headers: { origin: 'chrome-extension://different-extension-id' },
    });
    assert(response.status === 403, `expected 403, got ${response.status}`);
    assert(json.code === 'EXTENSION_ID_MISMATCH', `expected EXTENSION_ID_MISMATCH, got ${json.code}`);
  });
});

await check('rejects extension results when origin and extension id mismatch', async () => {
  await withBridge({ enableLongPoll: true }, async ({ baseUrl }) => {
    const { response, json } = await requestJson(baseUrl, '/extension/result', extensionRequestOptions({
      method: 'POST',
      body: JSON.stringify({
        id: 'missing-command',
        ok: true,
        result: {},
        info: { version: BRIDGE_VERSION, extensionId: 'different-extension-id' },
      }),
    }));
    assert(response.status === 403, `expected 403, got ${response.status}`);
    assert(json.code === 'EXTENSION_ID_MISMATCH', `expected EXTENSION_ID_MISMATCH, got ${json.code}`);
  });
});

await check('fails closed before websocket extension version is known', async () => {
  await withBridge({}, async ({ baseUrl }) => {
    await withExtensionSocket(baseUrl, async () => {
      const { response, json } = await requestJson(baseUrl, '/command', {
        method: 'POST',
        body: JSON.stringify({ action: 'text', payload: {}, timeoutMs: 1_000 }),
      });
      assert(response.status === 409, `expected 409, got ${response.status}`);
      assert(json.code === 'VERSION_UNKNOWN', `expected VERSION_UNKNOWN, got ${json.code}`);
    });
  });
});

await check('closes websocket extension hello when origin and extension id mismatch', async () => {
  await withBridge({}, async ({ baseUrl }) => {
    const socket = await openExtensionSocket(baseUrl);
    try {
      socket.send(JSON.stringify({
        type: 'hello',
        info: { version: BRIDGE_VERSION, extensionId: 'different-extension-id' },
      }));
      const closedByBridge = await waitForSocketClose(socket);
      assert(closedByBridge, 'expected mismatched websocket hello to close the socket');
    } finally {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.terminate();
      }
    }
  });
});

await check('strips unsafe websocket extension metadata before health exposure', async () => {
  await withBridge({}, async ({ baseUrl }) => {
    const socket = await openExtensionSocket(baseUrl);
    try {
      const unsafeInfo = JSON.parse(`{
        "version": "${BRIDGE_VERSION}",
        "extensionId": "contract-test",
        "clientId": "safe-websocket-client",
        "extra": "drop-me",
        "__proto__": { "polluted": true },
        "constructor": { "prototype": { "polluted": true } },
        "prototype": { "polluted": true }
      }`);
      socket.send(JSON.stringify({ type: 'hello', info: unsafeInfo }));
      await delay(50);

      const health = await requestJson(baseUrl, '/health');
      const info = health.json.extension?.info || {};
      assert(info.version === BRIDGE_VERSION, `expected safe version metadata, got ${JSON.stringify(info)}`);
      assert(info.clientId === 'safe-websocket-client', `expected safe clientId metadata, got ${JSON.stringify(info)}`);
      assert(!Object.prototype.hasOwnProperty.call(info, '__proto__'), 'expected __proto__ metadata to be stripped');
      assert(!Object.prototype.hasOwnProperty.call(info, 'constructor'), 'expected constructor metadata to be stripped');
      assert(!Object.prototype.hasOwnProperty.call(info, 'prototype'), 'expected prototype metadata to be stripped');
      assert(!Object.prototype.hasOwnProperty.call(info, 'extra'), 'expected non-allowlisted metadata to be stripped');
      assert({}.polluted === undefined, 'expected Object.prototype not to be polluted');
    } finally {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.terminate();
      }
    }
  });
});

await check('rejects websocket extension upgrades without extension origin', async () => {
  await withBridge({}, async ({ baseUrl }) => {
    const withoutOrigin = await openRawSocket(baseUrl);
    assert(!withoutOrigin.opened, 'expected websocket upgrade without origin to be rejected');
    assert(withoutOrigin.statusCode === 403, `expected 403, got ${withoutOrigin.statusCode}`);

    const wrongOrigin = await openRawSocket(baseUrl, {
      headers: { origin: 'http://127.0.0.1' },
    });
    assert(!wrongOrigin.opened, 'expected websocket upgrade with non-extension origin to be rejected');
    assert(wrongOrigin.statusCode === 403, `expected 403, got ${wrongOrigin.statusCode}`);
  });
});

await check('closes websocket extension sockets during shutdown', async () => {
  const bridge = createBridgeServer({ port: '0' });
  await bridge.listen();
  const address = bridge.server.address();
  const port = typeof address === 'object' && address ? address.port : bridge.port;
  const socket = await openExtensionSocket(`http://127.0.0.1:${port}`);
  let closePromise;
  try {
    closePromise = bridge.close();
    const closedByBridge = await waitForSocketClose(socket);
    assert(closedByBridge, 'expected bridge.close() to close websocket extension socket');
    await closePromise;
  } finally {
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.terminate();
    }
    if (closePromise) await closePromise.catch(() => {});
    else await bridge.close().catch(() => {});
  }
});

await check('rejects pending commands during shutdown', async () => {
  const bridge = createBridgeServer({ port: '0' });
  await bridge.listen();
  const address = bridge.server.address();
  const port = typeof address === 'object' && address ? address.port : bridge.port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const socket = await openExtensionSocket(baseUrl);
  socket.send(JSON.stringify({ type: 'hello', info: { version: BRIDGE_VERSION, test: true } }));
  await delay(50);

  let closePromise;
  try {
    const commandPromise = requestJson(baseUrl, '/command', {
      method: 'POST',
      body: JSON.stringify({ action: 'text', payload: {}, timeoutMs: 5_000 }),
    });
    await delay(50);
    closePromise = bridge.close();
    const { response, json } = await commandPromise;
    assert(response.status === 503, `expected 503, got ${response.status}`);
    assert(json.code === 'BRIDGE_SHUTTING_DOWN', `expected BRIDGE_SHUTTING_DOWN, got ${json.code}`);
    await closePromise;
  } finally {
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.terminate();
    }
    if (closePromise) await closePromise.catch(() => {});
    else await bridge.close().catch(() => {});
  }
});

await check('preserves extension error code and details', async () => {
  await withBridge({ enableLongPoll: true }, async ({ baseUrl }) => {
    await requestJson(baseUrl, '/extension/hello', extensionRequestOptions({
      method: 'POST',
      body: JSON.stringify({ info: { version: BRIDGE_VERSION, test: true } }),
    }));

    const commandPromise = requestJson(baseUrl, '/command', {
      method: 'POST',
      body: JSON.stringify({ action: 'text', payload: {}, timeoutMs: 5_000 }),
    });
    const { json: pollJson } = await requestJson(
      baseUrl,
      '/extension/poll?client=contract-test',
      extensionRequestOptions(),
    );
    const [command] = pollJson.commands || [];
    assert(command?.id, 'expected queued command from poll');

    await requestJson(baseUrl, '/extension/result', extensionRequestOptions({
      method: 'POST',
      body: JSON.stringify({
        id: command.id,
        ok: false,
        code: 'TAB_NOT_FOUND',
        error: 'Selected tab is gone',
        details: { tabId: 123 },
        info: { version: BRIDGE_VERSION },
      }),
    }));

    const { response, json } = await commandPromise;
    assert(response.status === 500, `expected 500, got ${response.status}`);
    assert(json.code === 'TAB_NOT_FOUND', `expected TAB_NOT_FOUND, got ${json.code}`);
    assert(json.details?.tabId === 123, `expected details.tabId=123, got ${JSON.stringify(json.details)}`);
  });
});

const failures = results.filter((result) => !result.ok);
process.stdout.write(JSON.stringify({
  ok: failures.length === 0,
  checks: results.length,
  failures,
}, null, 2));
process.stdout.write('\n');

if (failures.length) {
  process.exitCode = 1;
}
