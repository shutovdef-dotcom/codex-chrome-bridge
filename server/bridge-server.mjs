import http from 'node:http';
import { randomUUID } from 'node:crypto';
import WebSocket, { WebSocketServer } from 'ws';
import {
  BRIDGE_VERSION,
  EXTENSION_ACTIONS,
  commandDefaultTimeoutMs,
  validateCommandPayload,
} from '../shared/command-registry.mjs';
import { stripUnsafeObjectKeys } from '../shared/safe-record.mjs';

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
const EXTENSION_INFO_KEYS = [
  'clientId',
  'profileId',
  'profileLabel',
  'extensionId',
  'version',
  'name',
  'context',
  'origin',
  'userAgent',
  'transport',
];

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
  if (error?.code === 'EXTENSION_PROFILE_NOT_CONNECTED') return 503;
  if (error?.code === 'AMBIGUOUS_EXTENSION_PROFILE') return 409;
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
  const extensionId = stripUnsafeObjectKeys(info, { allowedKeys: EXTENSION_INFO_KEYS }).extensionId;
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

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function extensionProfileKey(info = {}, fallbackKey = null) {
  return nonEmptyString(info.profileId)
    || nonEmptyString(info.clientId)
    || nonEmptyString(info.extensionId)
    || fallbackKey
    || `anonymous:${randomUUID()}`;
}

function commandRoutingProfileId(payload = {}) {
  const profileId = nonEmptyString(payload?.profileId);
  if (!profileId && payload?.profileId !== undefined) {
    throw bridgeError('INVALID_PAYLOAD', 'payload.profileId must be a non-empty string when provided');
  }
  return profileId;
}

function stripCommandRoutingPayload(payload = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  const { profileId: _profileId, ...extensionPayload } = payload;
  return extensionPayload;
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

  const pendingResults = new Map();
  let shuttingDown = false;
  let closePromise = null;

  const state = {
    startedAt: new Date().toISOString(),
    extensionClients: new Map(),
    lastExtensionProfileKey: null,
    lastError: null,
  };

  function createExtensionClient(profileKey) {
    return {
      profileKey,
      connectedAt: null,
      lastSeenAt: null,
      info: {},
      socket: null,
      commandQueue: [],
      pollWaiters: new Set(),
    };
  }

  function rejectClientPendingCommands(client, error) {
    if (!client) return;
    client.commandQueue.splice(0, client.commandQueue.length);
    for (const [id, entry] of pendingResults.entries()) {
      if (entry.client !== client) continue;
      clearTimeout(entry.timeout);
      pendingResults.delete(id);
      entry.reject(error);
    }
    for (const waiter of client.pollWaiters) {
      clearTimeout(waiter.timeout);
      writeJson(waiter.req, waiter.res, 503, errorPayload(error));
    }
    client.pollWaiters.clear();
  }

  function markExtensionSeen(info = {}, options = {}) {
    const safeInfo = stripUnsafeObjectKeys(info, { allowedKeys: EXTENSION_INFO_KEYS });
    const profileKey = extensionProfileKey(safeInfo, options.client?.profileKey || options.profileKey);
    let client = options.client || state.extensionClients.get(profileKey);

    if (!client) {
      client = createExtensionClient(profileKey);
    }

    if (client.profileKey !== profileKey) {
      state.extensionClients.delete(client.profileKey);
      const existingClient = state.extensionClients.get(profileKey);
      if (existingClient && existingClient !== client) {
        const replacedError = bridgeError(
          'EXTENSION_CONNECTION_REPLACED',
          'Extension profile connection was replaced by a newer connection',
          { profileId: profileKey },
        );
        rejectClientPendingCommands(existingClient, replacedError);
        if (existingClient.socket && existingClient.socket !== options.socket) {
          existingClient.socket.close(1000, 'Replaced by newer extension profile connection');
        }
      }
      client.profileKey = profileKey;
    }

    if (options.socket && client.socket !== options.socket) {
      if (client.socket && client.socket.readyState === WebSocket.OPEN) {
        client.socket.close(1000, 'Replaced by newer extension profile connection');
      }
      client.socket = options.socket;
    }

    const now = new Date().toISOString();
    client.connectedAt ||= now;
    client.lastSeenAt = now;
    client.info = {
      ...client.info,
      ...safeInfo,
    };
    state.extensionClients.set(client.profileKey, client);
    state.lastExtensionProfileKey = client.profileKey;
    return client;
  }

  function extensionClientConnected(client) {
    if (!client) return false;
    if (client.socket && client.socket.readyState === WebSocket.OPEN) return true;
    if (!client.lastSeenAt) return false;
    return Date.now() - Date.parse(client.lastSeenAt) < EXTENSION_TTL_MS;
  }

  function connectedExtensionClients() {
    return [...state.extensionClients.values()].filter((client) => extensionClientConnected(client));
  }

  function extensionConnected() {
    return connectedExtensionClients().length > 0;
  }

  function extensionVersionMatches(client) {
    return client?.info?.version === EXTENSION_VERSION;
  }

  function extensionVersionKnown(client) {
    return typeof client?.info?.version === 'string' && client.info.version.length > 0;
  }

  function extensionVersionStatusError(client, action) {
    if (action === 'reloadExtension') return null;
    if (!extensionVersionKnown(client)) {
      return bridgeError(
        'VERSION_UNKNOWN',
        `Extension version is unknown; wait for extension hello or reload the unpacked extension so bridge can verify ${EXTENSION_VERSION}.`,
      );
    }
    if (!extensionVersionMatches(client)) {
      return bridgeError(
        'VERSION_MISMATCH',
        `Extension version mismatch: bridge expects ${EXTENSION_VERSION}, but connected extension is ${client.info.version}. Reload the unpacked extension first.`,
      );
    }
    return null;
  }

  function requireKnownExtensionOrigin(req, client) {
    return requireExtensionIdentity(req, {
      extensionId: client?.info?.extensionId,
    });
  }

  function extensionClientMatchesProfile(client, profileId) {
    return client?.profileKey === profileId
      || client?.info?.profileId === profileId
      || client?.info?.clientId === profileId
      || client?.info?.extensionId === profileId;
  }

  function anonymousLongPollClientForAdoption() {
    const candidates = [...state.extensionClients.values()].filter((client) => (
      !client.socket
      && extensionClientConnected(client)
      && !nonEmptyString(client.info?.profileId)
      && !nonEmptyString(client.info?.clientId)
    ));
    return candidates.length === 1 ? candidates[0] : null;
  }

  function extensionClientSummary(client) {
    return {
      connected: extensionClientConnected(client),
      profileKey: client.profileKey,
      connectedAt: client.connectedAt,
      lastSeenAt: client.lastSeenAt,
      info: client.info,
      queue: {
        commands: client.commandQueue.length,
        pollWaiters: client.pollWaiters.size,
      },
    };
  }

  function defaultExtensionClient() {
    const connected = connectedExtensionClients();
    if (connected.length === 1) return connected[0];
    const lastClient = state.lastExtensionProfileKey
      ? state.extensionClients.get(state.lastExtensionProfileKey)
      : null;
    if (lastClient && extensionClientConnected(lastClient)) return lastClient;
    return connected[0] || null;
  }

  function selectExtensionClient(profileId = null) {
    const connected = connectedExtensionClients();
    if (!connected.length) {
      throw bridgeError(
        'EXTENSION_NOT_CONNECTED',
        'Chrome extension is not connected to the bridge',
      );
    }

    if (profileId) {
      const matches = connected.filter((client) => extensionClientMatchesProfile(client, profileId));
      if (matches.length === 1) return matches[0];
      if (matches.length > 1) {
        throw bridgeError(
          'AMBIGUOUS_EXTENSION_PROFILE',
          `Multiple connected extension profiles match ${profileId}`,
          { profileId, profiles: connected.map(extensionClientSummary) },
        );
      }
      throw bridgeError(
        'EXTENSION_PROFILE_NOT_CONNECTED',
        `No connected Chrome extension profile matches ${profileId}`,
        { profileId, profiles: connected.map(extensionClientSummary) },
      );
    }

    if (connected.length === 1) return connected[0];
    throw bridgeError(
      'AMBIGUOUS_EXTENSION_PROFILE',
      'Multiple Chrome extension profiles are connected; set CHROME_BRIDGE_PROFILE_ID to the target profileId/clientId.',
      { profiles: connected.map(extensionClientSummary) },
    );
  }

  function settleResult(body, client = null) {
    const entry = pendingResults.get(body.id);
    if (!entry) return false;
    if (client && entry.client !== client) return false;

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
    for (const entry of pendingResults.values()) {
      clearTimeout(entry.timeout);
      entry.reject(error);
    }
    pendingResults.clear();
    for (const client of state.extensionClients.values()) {
      client.commandQueue.splice(0, client.commandQueue.length);
      for (const waiter of client.pollWaiters) {
        clearTimeout(waiter.timeout);
        writeJson(waiter.req, waiter.res, 503, errorPayload(error));
      }
      client.pollWaiters.clear();
    }
  }

  function flushPollWaiters(client) {
    if (!client?.commandQueue.length || !client.pollWaiters.size) return;
    const [waiter] = client.pollWaiters;
    client.pollWaiters.delete(waiter);
    clearTimeout(waiter.timeout);
    const commands = client.commandQueue.splice(0, client.commandQueue.length);
    writeJson(waiter.req, waiter.res, 200, { ok: true, commands });
  }

  function enqueueCommand(client, action, payload = {}, timeoutMs = 20_000) {
    if (shuttingDown) {
      throw bridgeError('BRIDGE_SHUTTING_DOWN', 'Chrome Bridge is shutting down');
    }
    if (!extensionClientConnected(client)) {
      throw bridgeError(
        'EXTENSION_PROFILE_NOT_CONNECTED',
        'Selected Chrome extension profile is not connected to the bridge',
        { profileId: client?.profileKey || null },
      );
    }

    const id = randomUUID();
    const command = { id, action, payload };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = client.commandQueue.findIndex((queued) => queued.id === id);
        if (index >= 0) client.commandQueue.splice(index, 1);
        pendingResults.delete(id);
        reject(new Error(`Timed out waiting for extension response to ${action}`));
      }, timeoutMs);

      pendingResults.set(id, { client, resolve, reject, timeout });
      if (client.socket && client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(JSON.stringify(command), (error) => {
          if (!error) return;
          pendingResults.delete(id);
          clearTimeout(timeout);
          reject(error);
        });
      } else {
        client.commandQueue.push(command);
        flushPollWaiters(client);
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
        const defaultClient = defaultExtensionClient();
        const extensions = [...state.extensionClients.values()].map(extensionClientSummary);
        const queuedCommands = extensions.reduce((total, extension) => total + extension.queue.commands, 0);
        const queuedPollWaiters = extensions.reduce((total, extension) => total + extension.queue.pollWaiters, 0);
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
            ambiguous: connectedExtensionClients().length > 1,
            connectedAt: defaultClient?.connectedAt || null,
            lastSeenAt: defaultClient?.lastSeenAt || null,
            profileKey: defaultClient?.profileKey || null,
            info: defaultClient?.info || null,
          },
          extensions,
          queue: {
            commands: queuedCommands,
            pendingResults: pendingResults.size,
            pollWaiters: queuedPollWaiters,
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
        const profileId = commandRoutingProfileId(payload);
        const extensionPayload = stripCommandRoutingPayload(payload);
        validateCommandPayload(action, extensionPayload);
        const effectiveTimeoutMs = commandTimeoutMs(action, timeoutMs);
        const client = selectExtensionClient(profileId);
        const versionError = extensionVersionStatusError(client, action);
        if (versionError) {
          writeJson(req, res, 409, errorPayload(versionError));
          return;
        }

        const result = await enqueueCommand(client, action, extensionPayload, effectiveTimeoutMs);
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
        const pollInfo = {
          clientId: url.searchParams.get('client') || undefined,
          origin: req.headers.origin || undefined,
          userAgent: req.headers['user-agent'] || undefined,
        };
        const pollProfileKey = extensionProfileKey(pollInfo);
        const client = markExtensionSeen(pollInfo, {
          client: state.extensionClients.get(pollProfileKey) || anonymousLongPollClientForAdoption(),
        });
        const identityError = requireKnownExtensionOrigin(req, client);
        if (identityError) {
          writeJson(req, res, 403, errorPayload(identityError));
          return;
        }

        if (client.commandQueue.length) {
          const commands = client.commandQueue.splice(0, client.commandQueue.length);
          writeJson(req, res, 200, { ok: true, commands });
          return;
        }

        const waiter = {
          req,
          res,
          timeout: setTimeout(() => {
            client.pollWaiters.delete(waiter);
            writeJson(req, res, 200, { ok: true, commands: [] });
          }, LONG_POLL_MS),
        };
        client.pollWaiters.add(waiter);
        req.on('close', () => {
          client.pollWaiters.delete(waiter);
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
        const pendingEntry = pendingResults.get(body.id);
        const client = markExtensionSeen(body.info || {}, { client: pendingEntry?.client });

        if (!settleResult(body, client)) {
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

    let client = markExtensionSeen({
      origin: req.headers.origin || undefined,
      userAgent: req.headers['user-agent'] || undefined,
      transport: 'websocket',
    }, {
      profileKey: `socket:${randomUUID()}`,
      socket: ws,
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
        client = markExtensionSeen({ ...(body.info || {}), transport: 'websocket' }, { client, socket: ws });
        return;
      }

      if (body.id) {
        client = markExtensionSeen(body.info || {}, { client, socket: ws });
        settleResult(body, client);
      }
    });

    ws.on('close', () => {
      if (client?.socket !== ws) return;
      client.socket = null;
      rejectClientPendingCommands(
        client,
        bridgeError(
          'EXTENSION_NOT_CONNECTED',
          'Chrome extension profile disconnected before returning a command result',
          { profileId: client.profileKey },
        ),
      );
      if (state.extensionClients.get(client.profileKey) === client) {
        state.extensionClients.delete(client.profileKey);
      }
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
        for (const client of state.extensionClients.values()) {
          client.socket = null;
        }
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
  for (const client of state.extensionClients.values()) {
    if (client.socket) clients.add(client.socket);
  }
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
