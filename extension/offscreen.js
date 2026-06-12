const BRIDGE_WS = 'ws://127.0.0.1:17376/extension';
const RECONNECT_MS = 1500;
const EXTENSION_NAME = 'Chrome MCP Bridge';
const EXTENSION_VERSION = '0.4.1';

let socket = null;
let reconnectTimer = null;
let clientIdPromise = null;

function getClientId() {
  if (clientIdPromise) return clientIdPromise;
  clientIdPromise = Promise.resolve().then(() => {
    const clientId = localStorage.getItem('clientId');
    if (clientId) return clientId;
    const generated = crypto.randomUUID();
    localStorage.setItem('clientId', generated);
    return generated;
  });
  return clientIdPromise;
}

async function helloPayload() {
  return {
    clientId: await getClientId(),
    extensionId: chrome.runtime.id,
    version: EXTENSION_VERSION,
    name: EXTENSION_NAME,
    context: 'offscreen',
  };
}

function safeSocketSend(value) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  try {
    socket.send(JSON.stringify(value));
    return true;
  } catch {
    scheduleReconnect();
    return false;
  }
}

function handleSocketError() {
  scheduleReconnect();
}

async function sendHello() {
  safeSocketSend({
    type: 'hello',
    info: await helloPayload(),
  });
}

async function handleSocketMessage(event) {
  let command;
  try {
    command = JSON.parse(event.data);
  } catch {
    return;
  }

  if (!command.id || !command.action) return;

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'codex-bridge-command',
      action: command.action,
      payload: command.payload || {},
    });

    if (response?.ok) {
      safeSocketSend({
        id: command.id,
        ok: true,
        result: response.result,
        info: await helloPayload(),
      });
    } else {
      safeSocketSend({
        id: command.id,
        ok: false,
        code: response?.code || 'BACKGROUND_COMMAND_FAILED',
        error: response?.error || 'Background command failed',
        details: response?.details,
        info: await helloPayload(),
      });
    }
  } catch (error) {
    safeSocketSend({
      id: command.id,
      ok: false,
      code: 'BACKGROUND_UNAVAILABLE',
      error: String(error?.message || error),
      info: await helloPayload(),
    });
  }
}

function handleSocketOpen() {
  sendHello().catch(handleSocketError);
}

function handleSocketMessageEvent(event) {
  handleSocketMessage(event).catch(handleSocketError);
}

function connect() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  socket = new WebSocket(BRIDGE_WS);

  socket.addEventListener('open', handleSocketOpen);
  socket.addEventListener('message', handleSocketMessageEvent);

  socket.addEventListener('close', scheduleReconnect);
  socket.addEventListener('error', scheduleReconnect);
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, RECONNECT_MS);
}

connect();
