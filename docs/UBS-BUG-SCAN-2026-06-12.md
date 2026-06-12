# UBS Bug Scan - 2026-06-12

Source: <https://www.jeffreyemanuel.com/tldr> describes UBS as Ultimate Bug Scanner, a pattern-based multi-language bug and security scanner with JSON output.

## Scan Command

```bash
/opt/homebrew/bin/bash /opt/homebrew/bin/ubs --format=json --ci --only=js --report-json /tmp/codex-chrome-bridge-ubs.json .
```

Notes:

- Running `ubs` directly on macOS used `/bin/bash` 3.2 and failed. The working invocation is `/opt/homebrew/bin/bash /opt/homebrew/bin/ubs ...`.
- UBS version: `5.3.2`.
- UBS JSON report path: `/tmp/codex-chrome-bridge-ubs.json`.
- UBS completed with exit code `1` because findings were present, not because the scan crashed.
- Follow-up SARIF/JSONL runs hit a transient UBS `ast-grep` cache execution error after the first successful JSON run, so this triage uses the successful JSON summary plus local source inspection.

## UBS Summary

```json
{
  "critical": 94,
  "warning": 233,
  "info": 4033,
  "files": 52
}
```

High-signal UBS buckets:

- `fetch() without AbortSignal cancellation`: 5.
- `async event listener callback is not awaited`: 2.
- `Request-derived object merge may allow prototype pollution`: 2.
- `JSON.parse without try/catch`: 18 plus overlapping parser warnings.
- `DOM queries not immediately null-checked`: 16.

High-noise UBS buckets:

- `Secret, signature, or token compared with ==/!=`: 91. In this repo this mostly matches docs, generated safety text, and tests mentioning tokens/sensitive confirmations rather than token comparison code.
- `Possible hardcoded secrets`: 1. The visible hits are test sentinel strings like `SECRET_CONSOLE_TEXT` / private fixture URLs in `scripts/check-diagnostics.mjs`, not committed credentials.
- `Switch cases may be missing break`: 43. The main action dispatch switch returns from each case.
- Deep property access samples shown by UBS are assertion tests intentionally checking omitted fields with `Object.prototype.hasOwnProperty.call`.

## Confirmed Or Plausible Bugs

### P0 - Add abortable fetch boundaries

Evidence:

- `bin/chrome-bridge.mjs` `bridgeFetch()` calls `fetch()` without an `AbortSignal`.
- `mcp/chrome-bridge-mcp.mjs` `bridgeFetch()` calls `fetch()` without an `AbortSignal`.
- `extension/browser-data.js` `fetchUrl()` calls page/extension-context `fetch()` without an `AbortSignal`.

Why it matters:

- CLI/MCP commands pass a command timeout to the bridge payload, but the local `fetch()` call itself can still wait on a stalled server/socket path.
- `chrome_bridge_request` / CLI `request` can leave an extension-context fetch running after the bridge command timeout has already expired.

Fix plan:

1. Add a small shared Node helper, or duplicated minimal helper if cleaner, that builds `AbortSignal.timeout(timeoutMs + cushionMs)` for CLI/MCP bridge calls.
2. Pass an abort signal from `command(action, payload, timeoutMs)` through `bridgeFetch()` in both CLI and MCP.
3. Add a bounded `requestTimeoutMs` payload field for `fetchUrl`, or derive a conservative timeout inside `extension/browser-data.js` from existing command limits.
4. Extend registry payload validation for any new timeout field with min/max bounds.
5. Add tests with a fake hanging HTTP server proving CLI and MCP return a structured timeout failure instead of hanging.
6. Add an extension-side fake `fetch` test proving `fetchUrl` supplies a signal and handles abort errors cleanly.

Acceptance:

- `npm run check:cli-local-tools` covers CLI bridge fetch timeout.
- `npm run check:mcp-local-tools` covers MCP bridge fetch timeout.
- `npm run check:bridge-contract` or a new focused checker covers extension `fetchUrl` abort behavior.
- `npm run check` passes.

### P0 - Sanitize untrusted metadata before object merge

Evidence:

- `server/bridge-server.mjs` merges extension-provided `body.info` into `state.extensionInfo` via object spread.
- `shared/run-tabs.mjs` persists and rehydrates run-tab metadata with object spread.

Why it matters:

- Current direct command payload validation is strong, and extension origin checks reduce exposure. Still, metadata surfaces are intentionally looser than command payloads.
- Rejecting or stripping `__proto__`, `constructor`, and `prototype` keys makes these surfaces obviously safe and turns UBS prototype-pollution findings into covered invariants.

Fix plan:

1. Add a `safePlainRecord()` / `stripUnsafeObjectKeys()` helper for shallow metadata objects.
2. Use it before `markExtensionSeen(body.info)`, before long-poll extension metadata storage, and before run-tab `meta` persistence.
3. Decide whether to reject unsafe keys with a stable error code or silently strip them; prefer rejecting on direct bridge input and stripping on extension health metadata.
4. Add tests that send unsafe keys through websocket hello, extension result `info`, and run-tab metadata, then assert no unsafe keys survive and no prototype is modified.

Acceptance:

- `npm run check:bridge-contract` includes websocket/long-poll unsafe metadata cases.
- `npm run check:run-tab-ownership` includes unsafe `meta` persistence cases.
- `npm run check:registry` continues to enforce direct payload validation.

### P1 - Make offscreen WebSocket listeners rejection-safe

Evidence:

- `extension/offscreen.js` uses `async` callbacks in `socket.addEventListener('open', ...)` and `socket.addEventListener('message', ...)`.
- The message handler has internal `try/catch` for command processing, but the `open` handler can still reject while building/sending hello metadata.

Why it matters:

- A rejected async event listener can become an unhandled rejection in the extension context.
- Offscreen reconnect is one of the core reliability paths for live bridge use.

Fix plan:

1. Replace async listener bodies with `void sendHello().catch(handleSocketError)` and `void handleSocketMessage(event).catch(handleSocketError)`.
2. Add a `safeSocketSend()` helper that checks `socket.readyState === WebSocket.OPEN` before sending.
3. Ensure hello failures schedule reconnect or at least record a compact error.
4. Add static checker coverage that offscreen listeners use non-async wrappers, plus a fake WebSocket unit-style test if practical.

Acceptance:

- `npm run check:registry` or a new focused checker verifies rejection-safe listener structure.
- Live `doctor --live-checks` and `runtime-smoke --summary-only --out <file>` still pass after extension reload.

### P1 - Harden prompt-page DOM assumptions

Evidence:

- `extension/ask.js` uses `document.querySelector(...)` for required controls and immediately dereferences those nodes.

Why it matters:

- The prompt page is extension-owned, so this is not a hostile-page security bug.
- It is still a drift bug: a future `ask.html` edit that renames an element would cause a blank/broken prompt instead of a clear local error.

Fix plan:

1. Add a required-element helper in `extension/ask.js`, e.g. `requiredElement(selector)`.
2. Fail visibly in the prompt page if required DOM nodes are missing.
3. Add a static checker that `ask.js` no longer dereferences nullable query results directly.

Acceptance:

- `node --check extension/ask.js` passes.
- `npm run check` includes the static ask prompt guard.

### P1 - Handle corrupted run-state JSON gracefully

Evidence:

- `shared/run-tabs.mjs` catches missing state files, but invalid JSON currently propagates and can block cleanup commands.

Why it matters:

- Run-state files live under `/tmp`; interrupted writes, manual edits, or stale agent artifacts can corrupt them.
- Cleanup should be best-effort and should not strand bridge-owned tabs because a temp JSON file is malformed.

Fix plan:

1. On invalid JSON, rename the bad state file to a `.corrupt.<timestamp>` sibling and return an empty state with `parseError` metadata.
2. Preserve fail-fast behavior for filesystem permission errors.
3. Add `check:run-tab-ownership` coverage for malformed state files.

Acceptance:

- Corrupt state files do not throw from read-only cleanup paths.
- A corrupt artifact is preserved for debugging.
- `npm run check:run-tab-ownership` passes.

## Deferred / Noise Triage

- DOM query warnings in `extension/page-scripts.js` are mostly guarded injected-page logic or deliberate selector checks.
- DOM query warnings in `bin/chrome-bridge.mjs` are inside generated runtime-smoke fixture HTML where fixture markup is defined in the same string.
- JSON parse warnings in `server`, `bin`, `mcp`, `offscreen`, and checker scripts are mostly already guarded; future work can centralize parsing helpers but this is not currently a release blocker.
- Listener imbalance warnings are mostly long-lived extension listeners by design; no React/component lifecycle exists here.

## Suggested Implementation Order

1. P0 abortable fetch boundaries.
2. P0 safe metadata merge helper.
3. P1 offscreen listener wrapper.
4. P1 run-state corruption recovery.
5. P1 prompt-page required element guard.
6. Re-run UBS JSON scan and compare counts against `/tmp/codex-chrome-bridge-ubs.json`.
7. Run `npm run check`, `npm run check:audit`, `npm run check:pack`, sync installed copy, reload extension, and run live `runtime-smoke --summary-only --out /tmp/chrome-bridge-runtime-smoke.json`.
