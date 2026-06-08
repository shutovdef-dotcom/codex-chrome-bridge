import http from 'node:http';
import { randomUUID } from 'node:crypto';
import WebSocket, { WebSocketServer } from 'ws';
import {
  BRIDGE_VERSION,
  EXTENSION_ACTIONS,
  commandDefaultTimeoutMs,
  validateCommandPayload,
} from '../shared/command-registry.mjs';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 17376;
const MIN_PORT = 0;
const MAX_PORT = 65_535;
const EXTENSION_VERSION = BRIDGE_VERSION;
const EXTENSION_TTL_MS = 45_000;
const LONG_POLL_MS = 25_000;
const MIN_COMMAND_TIMEOUT_MS = 1_000;
const MAX_COMMAND_TIMEOUT_MS = 1_900_000;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const ALLOWED_COMMAND_ACTIONS = new Set(EXTENSION_ACTIONS);
const COMMAND_BODY_KEYS = new Set(['action', 'payload', 'timeoutMs']);

function bridgeError(code, message, details = undefined) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function errorPayload(error) {
  return {
    ok: false,
    code: error?.code || 'BRIDGE_ERROR',
    error: String(error?.message || error),
    ...(error?.details ? { details: error.details } : {}),
  };
}

function extensionResultError(body) {
  return bridgeError(
    body.code || 'EXTENSION_COMMAND_FAILED',
    body.error || 'Extension command failed',
    body.details,
  );
}

function httpStatusForError(error) {
  if (error?.code === 'REQUEST_TOO_LARGE') return 413;
  if (error?.code === 'UNSUPPORTED_MEDIA_TYPE') return 415;
  if (error?.code === 'INVALID_COMMAND_ORIGIN') return 403;
  if (error?.code === 'INVALID_EXTENSION_ORIGIN') return 403;
  if (error?.code === 'BRIDGE_SHUTTING_DOWN') return 503;
  if (error?.code === 'EXTENSION_NOT_CONNECTED') return 503;
  if ([
    'INVALID_ACTION',
    'UNSUPPORTED_ACTION',
    'INVALID_COMMAND_BODY',
    'INVALID_PAYLOAD',
    'INVALID_JSON',
    'INVALID_TIMEOUT',
    'CONFIRMATION_REQUIRED',
    'SENSITIVE_CONFIRMATION_REQUIRED',
  ].includes(error?.code)) return 400;
  return 500;
}

function isExtensionIngressPath(req) {
  const pathname = String(req.url || '').split('?', 1)[0];
  return pathname === '/extension'
    || pathname === '/extension/hello'
    || pathname === '/extension/poll'
    || pathname === '/extension/result';
}

function corsHeaders(req) {
  const origin = req.headers.origin || '';
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  };

  if (isExtensionIngressPath(req) && origin.startsWith('chrome-extension://')) {
    headers['access-control-allow-origin'] = origin;
    headers['access-control-allow-headers'] = 'content-type';
    headers['access-control-allow-methods'] = 'GET,POST,OPTIONS';
  }

  return headers;
}

function isExtensionOrigin(req) {
  return String(req.headers.origin || '').startsWith('chrome-extension://');
}

function requireExtensionOrigin(req) {
  if (isExtensionOrigin(req)) return null;
  return bridgeError(
    'INVALID_EXTENSION_ORIGIN',
    'Extension ingress requires a chrome-extension:// origin',
    { origin: req.headers.origin || null },
  );
}

function requireExtensionIdentity(req, info = {}) {
  const extensionId = info?.extensionId;
  if (!extensionId) return null;
  const expectedOrigin = `chrome-extension://${extensionId}`;
  const origin = String(req.headers.origin || '');
  if (origin === expectedOrigin) return null;
  return bridgeError(
    'EXTENSION_ID_MISMATCH',
    'Extension request origin does not match the reported extension id',
    { origin: origin || null, extensionId },
  );
}

function requireCommandOrigin(req) {
  const origin = String(req.headers.origin || '');
  if (!origin) return null;
  return bridgeError(
    'INVALID_COMMAND_ORIGIN',
    'Direct command ingress rejects browser and extension origins; use the local CLI/MCP client instead',
    { origin },
  );
}

function requireJsonContentType(req) {
  const contentType = String(req.headers['content-type'] || '');
  const mediaType = contentType.split(';', 1)[0].trim().toLowerCase();
  if (mediaType === 'application/json') return null;
  return bridgeError(
    'UNSUPPORTED_MEDIA_TYPE',
    'POST JSON endpoints require Content-Type: application/json',
    { contentType: contentType || null },
  );
}

function drainRequestBody(req) {
  req.removeAllListeners('data');
  req.on('data', () => {});
  req.resume();
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let settled = false;

    function fail(error) {
      if (settled) return;
      settled = true;
      reject(error);
    }

    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      if (settled) return;
      body += chunk;
      if (body.length > 2_000_000) {
        body = '';
        fail(bridgeError('REQUEST_TOO_LARGE', 'Request body too large'));
        drainRequestBody(req);
      }
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(bridgeError('INVALID_JSON', `Invalid JSON request body: ${String(error?.message || error)}`));
      }
    });
    req.on('error', fail);
  });
}

function writeJson(req, res, statusCode, payload) {
  res.writeHead(statusCode, corsHeaders(req));
  res.end(JSON.stringify(payload, null, 2));
}

function commandTimeoutMs(action, value) {
  if (value === undefined || value === null) return commandDefaultTimeoutMs(action);
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw bridgeError(
      'INVALID_TIMEOUT',
      `timeoutMs must be a finite number between ${MIN_COMMAND_TIMEOUT_MS} and ${MAX_COMMAND_TIMEOUT_MS}`,
      { min: MIN_COMMAND_TIMEOUT_MS, max: MAX_COMMAND_TIMEOUT_MS },
    );
  }
  if (value < MIN_COMMAND_TIMEOUT_MS || value > MAX_COMMAND_TIMEOUT_MS) {
    throw bridgeError(
      'INVALID_TIMEOUT',
      `timeoutMs must be between ${MIN_COMMAND_TIMEOUT_MS} and ${MAX_COMMAND_TIMEOUT_MS}`,
      { min: MIN_COMMAND_TIMEOUT_MS, max: MAX_COMMAND_TIMEOUT_MS },
    );
  }
  return value;
}

function validateCommandEnvelope(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw bridgeError('INVALID_COMMAND_BODY', 'Command body must be a JSON object');
  }
  const unknownKeys = Object.keys(body).filter((key) => !COMMAND_BODY_KEYS.has(key));
  if (unknownKeys.length) {
    throw bridgeError(
      'INVALID_COMMAND_BODY',
      `Unsupported command body field${unknownKeys.length === 1 ? '' : 's'}: ${unknownKeys.join(', ')}`,
      { allowedKeys: [...COMMAND_BODY_KEYS], unknownKeys },
    );
  }
}

export function parseBridgePort(value, name = 'port') {
  const rawValue = value === undefined || value === null || value === ''
    ? DEFAULT_PORT
    : value;
  const port = Number(rawValue);
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    throw bridgeError(
      'INVALID_PORT',
      `${name} must be an integer between ${MIN_PORT} and ${MAX_PORT}`,
      { min: MIN_PORT, max: MAX_PORT },
    );
  }
  return port;
}

export function createBridgeServer(options = {}) {
  const host = options.host || DEFAULT_HOST;
  const port = parseBridgePort(options.port ?? process.env.CHROME_BRIDGE_PORT, 'port');
  if (!LOOPBACK_HOSTS.has(host) && process.env.CHROME_BRIDGE_UNSAFE_HOST !== '1') {
    throw bridgeError(
      'UNSAFE_HOST',
      `Refusing to bind Chrome Bridge to ${host}. Use CHROME_BRIDGE_UNSAFE_HOST=1 only after a security review.`,
    );
  }

  const longPollEnabled = options.enableLongPoll === undefined
    ? process.env.CHROME_BRIDGE_ENABLE_LONG_POLL === '1'
    : Boolean(options.enableLongPoll);

  const commandQueue = [];
  const pendingResults = new Map();
  const pollWaiters = new Set();
  let shuttingDown = false;
  let closePromise = null;

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

  function extensionVersionMatches() {
    return state.extensionInfo?.version === EXTENSION_VERSION;
  }

  function extensionVersionKnown() {
    return typeof state.extensionInfo?.version === 'string' && state.extensionInfo.version.length > 0;
  }

  function extensionVersionStatusError(action) {
    if (action === 'reloadExtension') return null;
    if (!extensionVersionKnown()) {
      return bridgeError(
        'VERSION_UNKNOWN',
        `Extension version is unknown; wait for extension hello or reload the unpacked extension so bridge can verify ${EXTENSION_VERSION}.`,
      );
    }
    if (!extensionVersionMatches()) {
      return bridgeError(
        'VERSION_MISMATCH',
        `Extension version mismatch: bridge expects ${EXTENSION_VERSION}, but connected extension is ${state.extensionInfo.version}. Reload the unpacked extension first.`,
      );
    }
    return null;
  }

  function requireKnownExtensionOrigin(req) {
    return requireExtensionIdentity(req, {
      extensionId: state.extensionInfo?.extensionId,
    });
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
      entry.reject(extensionResultError(body));
    }
    return true;
  }

  function rejectPendingCommands(error) {
    commandQueue.splice(0, commandQueue.length);
    for (const entry of pendingResults.values()) {
      clearTimeout(entry.timeout);
      entry.reject(error);
    }
    pendingResults.clear();
    for (const waiter of pollWaiters) {
      clearTimeout(waiter.timeout);
      writeJson(waiter.req, waiter.res, 503, errorPayload(error));
    }
    pollWaiters.clear();
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
    if (shuttingDown) {
      throw bridgeError('BRIDGE_SHUTTING_DOWN', 'Chrome Bridge is shutting down');
    }
    if (!extensionConnected()) {
      throw bridgeError(
        'EXTENSION_NOT_CONNECTED',
        'Chrome extension is not connected to the bridge',
      );
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
          transports: {
            websocket: true,
            longPoll: longPollEnabled,
          },
          lastError: state.lastError,
        });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/command') {
        if (shuttingDown) {
          writeJson(req, res, 503, errorPayload(bridgeError('BRIDGE_SHUTTING_DOWN', 'Chrome Bridge is shutting down')));
          return;
        }
        const originError = requireCommandOrigin(req);
        if (originError) {
          writeJson(req, res, 403, errorPayload(originError));
          return;
        }
        const contentTypeError = requireJsonContentType(req);
        if (contentTypeError) {
          writeJson(req, res, 415, errorPayload(contentTypeError));
          return;
        }
        const body = await readJson(req);
        validateCommandEnvelope(body);
        const { action, payload = {}, timeoutMs } = body;
        if (!action || typeof action !== 'string') {
          writeJson(req, res, 400, errorPayload(bridgeError('INVALID_ACTION', 'Missing string action')));
          return;
        }
        if (!ALLOWED_COMMAND_ACTIONS.has(action)) {
          writeJson(req, res, 400, errorPayload(bridgeError('UNSUPPORTED_ACTION', `Unsupported action: ${action}`)));
          return;
        }
        validateCommandPayload(action, payload);
        if (extensionConnected()) {
          const versionError = extensionVersionStatusError(action);
          if (versionError) {
            writeJson(req, res, 409, errorPayload(versionError));
            return;
          }
        }

        const result = await enqueueCommand(action, payload, commandTimeoutMs(action, timeoutMs));
        writeJson(req, res, 200, { ok: true, result });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/extension/hello') {
        if (shuttingDown) {
          writeJson(req, res, 503, errorPayload(bridgeError('BRIDGE_SHUTTING_DOWN', 'Chrome Bridge is shutting down')));
          return;
        }
        if (!longPollEnabled) {
          writeJson(req, res, 404, errorPayload(bridgeError('TRANSPORT_DISABLED', 'Long-poll extension transport is disabled')));
          return;
        }
        const originError = requireExtensionOrigin(req);
        if (originError) {
          writeJson(req, res, 403, errorPayload(originError));
          return;
        }
        const contentTypeError = requireJsonContentType(req);
        if (contentTypeError) {
          writeJson(req, res, 415, errorPayload(contentTypeError));
          return;
        }
        const body = await readJson(req);
        const identityError = requireExtensionIdentity(req, body.info || {});
        if (identityError) {
          writeJson(req, res, 403, errorPayload(identityError));
          return;
        }
        markExtensionSeen(body.info || {});
        writeJson(req, res, 200, { ok: true });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/extension/poll') {
        if (shuttingDown) {
          writeJson(req, res, 503, errorPayload(bridgeError('BRIDGE_SHUTTING_DOWN', 'Chrome Bridge is shutting down')));
          return;
        }
        if (!longPollEnabled) {
          writeJson(req, res, 404, errorPayload(bridgeError('TRANSPORT_DISABLED', 'Long-poll extension transport is disabled')));
          return;
        }
        const originError = requireExtensionOrigin(req);
        if (originError) {
          writeJson(req, res, 403, errorPayload(originError));
          return;
        }
        const identityError = requireKnownExtensionOrigin(req);
        if (identityError) {
          writeJson(req, res, 403, errorPayload(identityError));
          return;
        }
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
        if (shuttingDown) {
          writeJson(req, res, 503, errorPayload(bridgeError('BRIDGE_SHUTTING_DOWN', 'Chrome Bridge is shutting down')));
          return;
        }
        if (!longPollEnabled) {
          writeJson(req, res, 404, errorPayload(bridgeError('TRANSPORT_DISABLED', 'Long-poll extension transport is disabled')));
          return;
        }
        const originError = requireExtensionOrigin(req);
        if (originError) {
          writeJson(req, res, 403, errorPayload(originError));
          return;
        }
        const contentTypeError = requireJsonContentType(req);
        if (contentTypeError) {
          writeJson(req, res, 415, errorPayload(contentTypeError));
          return;
        }
        const body = await readJson(req);
        const identityError = requireExtensionIdentity(req, body.info || {});
        if (identityError) {
          writeJson(req, res, 403, errorPayload(identityError));
          return;
        }
        markExtensionSeen(body.info || {});

        if (!settleResult(body)) {
          writeJson(req, res, 404, errorPayload(bridgeError('UNKNOWN_COMMAND_ID', 'Unknown command id')));
          return;
        }

        writeJson(req, res, 200, { ok: true });
        return;
      }

      writeJson(req, res, 404, errorPayload(bridgeError('NOT_FOUND', 'Not found')));
    } catch (error) {
      state.lastError = String(error?.stack || error);
      writeJson(req, res, httpStatusForError(error), errorPayload(error));
    }
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, `http://${host}:${port}`);
    const origin = req.headers.origin || '';

    if (url.pathname !== '/extension' || !isExtensionOrigin(req)) {
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
    if (shuttingDown) {
      ws.close(1001, 'Bridge shutting down');
      return;
    }
    if (state.extensionSocket && state.extensionSocket.readyState === WebSocket.OPEN) {
      state.extensionSocket.close(1000, 'Replaced by newer extension connection');
    }

    state.extensionSocket = ws;
    state.extensionInfo = null;
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
        const identityError = requireExtensionIdentity(req, body.info || {});
        if (identityError) {
          state.lastError = String(identityError.message || identityError);
          ws.close(1008, 'Extension id mismatch');
          return;
        }
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
      if (closePromise) return closePromise;
      shuttingDown = true;
      const shutdownError = bridgeError('BRIDGE_SHUTTING_DOWN', 'Chrome Bridge is shutting down');
      rejectPendingCommands(shutdownError);

      closePromise = Promise.all([
        closeWebSocketServer(wss, state),
        closeHttpServer(server),
      ]).then(() => {
        state.extensionSocket = null;
      });
      return closePromise;
    },
  };
}

function closeHttpServer(server) {
  return new Promise((resolve, reject) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function closeWebSocketServer(wss, state) {
  const clients = new Set(wss.clients || []);
  if (state.extensionSocket) clients.add(state.extensionSocket);
  const closeClients = [...clients].map((socket) => closeWebSocket(socket));
  return Promise.all(closeClients)
    .then(() => new Promise((resolve, reject) => {
      wss.close((error) => (error ? reject(error) : resolve()));
    }));
}

function closeWebSocket(socket) {
  if (!socket || socket.readyState === WebSocket.CLOSED) return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (socket.readyState !== WebSocket.CLOSED) socket.terminate();
      resolve();
    }, 500);
    socket.once('close', () => {
      clearTimeout(timeout);
      resolve();
    });
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close(1001, 'Bridge shutting down');
    } else if (socket.readyState !== WebSocket.CLOSING) {
      socket.terminate();
    }
  });
}

export async function startBridgeServer(options = {}) {
  const bridge = createBridgeServer(options);
  await bridge.listen();
  return bridge;
}
