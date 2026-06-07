const BRIDGE_WS = 'ws://127.0.0.1:17376/extension';
const RECONNECT_MS = 1500;
const EXTENSION_NAME = 'Codex Chrome Bridge';
const EXTENSION_VERSION = '0.4.0';

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

function connect() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  socket = new WebSocket(BRIDGE_WS);

  socket.addEventListener('open', async () => {
    socket.send(JSON.stringify({
      type: 'hello',
      info: await helloPayload(),
    }));
  });

  socket.addEventListener('message', async (event) => {
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
        socket.send(JSON.stringify({
          id: command.id,
          ok: true,
          result: response.result,
          info: await helloPayload(),
        }));
      } else {
        socket.send(JSON.stringify({
          id: command.id,
          ok: false,
          error: response?.error || 'Background command failed',
          info: await helloPayload(),
        }));
      }
    } catch (error) {
      socket.send(JSON.stringify({
        id: command.id,
        ok: false,
        error: String(error?.message || error),
        info: await helloPayload(),
      }));
    }
  });

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
