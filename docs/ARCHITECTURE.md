# Architecture

Codex Chrome Bridge has four runtime pieces.

## Chrome Extension

The `extension/` directory contains a Manifest V3 extension:

- `manifest.json` declares permissions.
- `background.js` executes browser commands.
- `offscreen.html` and `offscreen.js` keep a WebSocket connection to the local bridge server.
- `ask.html` and `ask.js` provide a local human-in-the-loop prompt page.

The extension is the only component that talks directly to Chrome extension APIs.

## Local Bridge Server

`server/bridge-server.mjs` starts a local HTTP/WebSocket server on `127.0.0.1:17376` by default.

It exposes:

- `GET /health` for diagnostics.
- `POST /command` for CLI/MCP commands.
- `/extension` WebSocket for the extension.
- Long-poll fallback endpoints for the extension.

The bridge server does not persist browser data.

## CLI

`bin/chrome-bridge.mjs` is the user-facing command-line interface. It sends commands to the local bridge server and prints JSON results.

It also contains:

- `self-test`, a static project parity check.
- `runtime-smoke`, a safe real-browser smoke test using a temporary `127.0.0.1` fixture page.
- `doctor`, diagnostics for extension setup.
- `ask`, a local prompt for user answers without leaving the scoped Chrome group.

## MCP Server

`mcp/chrome-bridge-mcp.mjs` exposes the same browser surface as MCP tools over stdio.

The MCP server is intentionally thin:

- It validates tool arguments with Zod.
- It forwards commands to the local bridge server.
- It returns JSON as MCP text content.

## Data Flow

```text
MCP client or CLI
  -> local bridge server on 127.0.0.1
  -> Chrome extension WebSocket
  -> Chrome extension APIs / page scripts / Chrome Debugger
  -> result back through the same path
```

## Trust Boundary

The important boundary is the user's real Chrome profile. Anything visible to Chrome may be private.

Use [SAFETY.md](SAFETY.md) as the source of truth for confirmation gates and private-data handling.
