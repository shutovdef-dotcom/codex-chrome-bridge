import http from 'node:http';
import { randomUUID } from 'node:crypto';
import WebSocket, { WebSocketServer } from 'ws';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 17376;
const EXTENSION_VERSION = '0.3.0';
const EXTENSION_TTL_MS = 45_000;
const LONG_POLL_MS = 25_000;

function corsHeaders(req) {
  const origin = req.headers.origin || '';
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  };

  if (origin.startsWith('chrome-extension://')) {
    headers['access-control-allow-origin'] = origin;
    headers['access-control-allow-headers'] = 'content-type';
    headers['access-control-allow-methods'] = 'GET,POST,OPTIONS';
  }

  return headers;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function writeJson(req, res, statusCode, payload) {
  res.writeHead(statusCode, corsHeaders(req));
  res.end(JSON.stringify(payload, null, 2));
}

export function createBridgeServer(options = {}) {
  const host = options.host || DEFAULT_HOST;
  const port = Number(options.port || process.env.CHROME_BRIDGE_PORT || DEFAULT_PORT);

  const commandQueue = [];
  const pendingResults = new Map();
  const pollWaiters = new Set();

  const state = {
    startedAt: new Date().toISOString(),
    extensionConnectedAt: null,
    extensionLastSeenAt: null,
    extensionInfo: null,
    extensionSocket: null,
    lastError: null,
  };

  function markExtensionSeen(info = {}) {
    const now = new Date().toISOString();
    state.extensionConnectedAt ||= now;
    state.extensionLastSeenAt = now;
    state.extensionInfo = {
      ...state.extensionInfo,
      ...info,
    };
  }

  function extensionConnected() {
    if (state.extensionSocket && state.extensionSocket.readyState === WebSocket.OPEN) return true;
    if (!state.extensionLastSeenAt) return false;
    return Date.now() - Date.parse(state.extensionLastSeenAt) < EXTENSION_TTL_MS;
  }

  function settleResult(body) {
    const entry = pendingResults.get(body.id);
    if (!entry) return false;

    pendingResults.delete(body.id);
    clearTimeout(entry.timeout);

    if (body.ok) {
      state.lastError = null;
      entry.resolve(body.result);
    } else {
      entry.reject(new Error(body.error || 'Extension command failed'));
    }
    return true;
  }

  function flushPollWaiters() {
    if (!commandQueue.length || !pollWaiters.size) return;
    const [waiter] = pollWaiters;
    pollWaiters.delete(waiter);
    clearTimeout(waiter.timeout);
    const commands = commandQueue.splice(0, commandQueue.length);
    writeJson(waiter.req, waiter.res, 200, { ok: true, commands });
  }

  function enqueueCommand(action, payload = {}, timeoutMs = 20_000) {
    if (!extensionConnected()) {
      throw new Error('Chrome extension is not connected to the bridge');
    }

    const id = randomUUID();
    const command = { id, action, payload };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = commandQueue.findIndex((queued) => queued.id === id);
        if (index >= 0) commandQueue.splice(index, 1);
        pendingResults.delete(id);
        reject(new Error(`Timed out waiting for extension response to ${action}`));
      }, timeoutMs);

      pendingResults.set(id, { resolve, reject, timeout });
      if (state.extensionSocket && state.extensionSocket.readyState === WebSocket.OPEN) {
        state.extensionSocket.send(JSON.stringify(command), (error) => {
          if (!error) return;
          pendingResults.delete(id);
          clearTimeout(timeout);
          reject(error);
        });
      } else {
        commandQueue.push(command);
        flushPollWaiters();
      }
    });
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${host}:${port}`);

      if (req.method === 'OPTIONS') {
        res.writeHead(204, corsHeaders(req));
        res.end();
        return;
      }

      if (req.method === 'GET' && url.pathname === '/health') {
        writeJson(req, res, 200, {
          ok: true,
          bridge: {
            host,
            port,
            pid: process.pid,
            version: EXTENSION_VERSION,
            startedAt: state.startedAt,
          },
          extension: {
            connected: extensionConnected(),
            connectedAt: state.extensionConnectedAt,
            lastSeenAt: state.extensionLastSeenAt,
            info: state.extensionInfo,
          },
          queue: {
            commands: commandQueue.length,
            pendingResults: pendingResults.size,
            pollWaiters: pollWaiters.size,
          },
          lastError: state.lastError,
        });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/command') {
        const body = await readJson(req);
        const { action, payload = {}, timeoutMs } = body;
        if (!action || typeof action !== 'string') {
          writeJson(req, res, 400, { ok: false, error: 'Missing string action' });
          return;
        }

        const result = await enqueueCommand(action, payload, Number(timeoutMs || 20_000));
        writeJson(req, res, 200, { ok: true, result });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/extension/hello') {
        const body = await readJson(req);
        markExtensionSeen(body.info || {});
        writeJson(req, res, 200, { ok: true });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/extension/poll') {
        markExtensionSeen({
          clientId: url.searchParams.get('client') || undefined,
          origin: req.headers.origin || undefined,
          userAgent: req.headers['user-agent'] || undefined,
        });

        if (commandQueue.length) {
          const commands = commandQueue.splice(0, commandQueue.length);
          writeJson(req, res, 200, { ok: true, commands });
          return;
        }

        const waiter = {
          req,
          res,
          timeout: setTimeout(() => {
            pollWaiters.delete(waiter);
            writeJson(req, res, 200, { ok: true, commands: [] });
          }, LONG_POLL_MS),
        };
        pollWaiters.add(waiter);
        req.on('close', () => {
          pollWaiters.delete(waiter);
          clearTimeout(waiter.timeout);
        });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/extension/result') {
        const body = await readJson(req);
        markExtensionSeen(body.info || {});

        if (!settleResult(body)) {
          writeJson(req, res, 404, { ok: false, error: 'Unknown command id' });
          return;
        }

        writeJson(req, res, 200, { ok: true });
        return;
      }

      writeJson(req, res, 404, { ok: false, error: 'Not found' });
    } catch (error) {
      state.lastError = String(error?.stack || error);
      writeJson(req, res, 500, { ok: false, error: String(error?.message || error) });
    }
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, `http://${host}:${port}`);
    const origin = req.headers.origin || '';

    if (url.pathname !== '/extension' || (origin && !origin.startsWith('chrome-extension://'))) {
      state.lastError = `Rejected websocket upgrade for path=${url.pathname} origin=${origin || '(empty)'}`;
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws, req) => {
    if (state.extensionSocket && state.extensionSocket.readyState === WebSocket.OPEN) {
      state.extensionSocket.close(1000, 'Replaced by newer extension connection');
    }

    state.extensionSocket = ws;
    markExtensionSeen({
      origin: req.headers.origin || undefined,
      userAgent: req.headers['user-agent'] || undefined,
      transport: 'websocket',
    });

    ws.on('message', (raw) => {
      let body;
      try {
        body = JSON.parse(String(raw));
      } catch (error) {
        state.lastError = `Invalid extension websocket JSON: ${String(error?.message || error)}`;
        return;
      }

      if (body.type === 'hello') {
        markExtensionSeen({ ...(body.info || {}), transport: 'websocket' });
        return;
      }

      if (body.id) {
        markExtensionSeen(body.info || {});
        settleResult(body);
      }
    });

    ws.on('close', () => {
      if (state.extensionSocket === ws) state.extensionSocket = null;
    });

    ws.on('error', (error) => {
      state.lastError = String(error?.stack || error);
    });
  });

  return {
    server,
    state,
    host,
    port,
    listen() {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.off('error', reject);
          resolve({ host, port });
        });
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

export async function startBridgeServer(options = {}) {
  const bridge = createBridgeServer(options);
  await bridge.listen();
  return bridge;
}
