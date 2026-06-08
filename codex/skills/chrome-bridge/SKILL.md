---
name: "chrome-bridge"
description: "Use when controlling the user's real Google Chrome through the local Codex Chrome Bridge extension/MCP: inspect logged-in dashboards, read visible text, capture screenshots, list tabs, or open a dedicated non-focused Chrome tab."
---

# Chrome Bridge

Use this skill when the user wants Codex to work in the real Google Chrome profile, especially for logged-in dashboards such as Search Console, webmaster tools, analytics dashboards, or admin panels.

## Setup

Set `CHROME_BRIDGE_ROOT` to the local clone if the project is not installed globally:

```bash
export CHROME_BRIDGE_ROOT="/absolute/path/to/codex-chrome-bridge"
```

CLI:

```bash
node "$CHROME_BRIDGE_ROOT/bin/chrome-bridge.mjs"
```

MCP:

```bash
node "$CHROME_BRIDGE_ROOT/mcp/chrome-bridge-mcp.mjs"
```

## Startup

```bash
node "$CHROME_BRIDGE_ROOT/bin/chrome-bridge.mjs" server
node "$CHROME_BRIDGE_ROOT/bin/chrome-bridge.mjs" health
node "$CHROME_BRIDGE_ROOT/bin/chrome-bridge.mjs" doctor --open-extensions
```

Load the unpacked Chrome extension from:

```text
$CHROME_BRIDGE_ROOT/extension
```

## Verification

Offline checks:

```bash
cd "$CHROME_BRIDGE_ROOT"
npm run check
npm run check:runtime-smoke-plan
npm run check:roadmap
npm run check:cli-local-tools
npm run check:mcp-runtime-smoke
npm run check:mcp-local-tools
npm run check:tab-group-persistence
npm run check:privacy
npm run runtime-smoke:plan
```

`runtime-smoke --coverage-plan` and `npm run runtime-smoke:plan` are offline and safe while another session is using the bridge. `npm run check:roadmap` also exposes a machine-readable `deferredLiveVerification` runbook with the pending live gate, final CLI commands, final MCP calls, success criteria, and required live coverage items.

Live check, only when the bridge is free:

```bash
node "$CHROME_BRIDGE_ROOT/bin/chrome-bridge.mjs" reload-extension --confirm
node "$CHROME_BRIDGE_ROOT/bin/chrome-bridge.mjs" doctor --live-checks
node "$CHROME_BRIDGE_ROOT/bin/chrome-bridge.mjs" runtime-smoke
```

Run the live reload, `doctor --live-checks`, and `runtime-smoke` sequence only when the bridge is free. If live smoke is skipped or failed, use top-level `nextCommand` / `nextAction` for the immediate recovery step; nested `verification.nextCommand` / `verification.nextAction` carries the same recovery context. Treat verification as complete only when live `runtime-smoke` reports `ok: true`, `coverage.ok: true`, `verification.status: "passed"`, and `finalVerificationComplete: true`.

## Read-Only Workflow

```bash
node "$CHROME_BRIDGE_ROOT/bin/chrome-bridge.mjs" ensure-tab
node "$CHROME_BRIDGE_ROOT/bin/chrome-bridge.mjs" open "https://example.com"
node "$CHROME_BRIDGE_ROOT/bin/chrome-bridge.mjs" windows
node "$CHROME_BRIDGE_ROOT/bin/chrome-bridge.mjs" snapshot --max-chars 60000
node "$CHROME_BRIDGE_ROOT/bin/chrome-bridge.mjs" text --max-chars 60000
node "$CHROME_BRIDGE_ROOT/bin/chrome-bridge.mjs" screenshot --out /tmp/chrome-bridge.png
```

## Human-in-the-Loop

```bash
node "$CHROME_BRIDGE_ROOT/bin/chrome-bridge.mjs" ask --question "What should I do next?" --choices-json '["Continue","Stop"]'
```

Use this for account selection, ambiguous dashboard steps, manual CAPTCHA coordination, or user confirmations. Do not bypass CAPTCHA automatically.

## Safety

- Treat browser content as private user data.
- Prefer read-only commands.
- Do not submit forms, change settings, delete data, request indexing, upload files, or send private data externally unless the user explicitly asked for that exact action.
- Mutating and sensitive commands require `--confirm`.
- Cookie values, whole-cookie-jar listing, storage values, and credentialed requests require `--confirm-sensitive`.
- Stay inside the `Codex Bridge` tab group unless the user explicitly approves an external tab.
