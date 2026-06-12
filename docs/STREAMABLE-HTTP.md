# Streamable HTTP Transport Plan

Status: Not implemented in this release.

Chrome MCP Bridge currently ships a local stdio MCP server. stdio remains the default because the bridge can inspect and control a real logged-in Chrome profile, and local process launch keeps the browser boundary narrower than a network listener.

This document records the future Streamable HTTP compatibility plan so we can close MCP transport gaps without accidentally shipping a remote browser-control endpoint.

## Sources

- Current MCP transport specification: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- Streamable HTTP introduction specification: https://modelcontextprotocol.io/specification/2025-03-26/basic/transports

## Spec Notes

The MCP Streamable HTTP transport uses a single MCP endpoint. Clients send JSON-RPC messages with HTTP `POST`; servers may answer with a JSON response or open an SSE stream. Clients may also use `GET` for server-to-client streams when the server supports that mode.

For local servers, the MCP specification calls out localhost binding and `Origin` validation as DNS rebinding defenses. A Chrome MCP bridge must treat those requirements as mandatory, not optional, because browser-origin traffic could otherwise try to reach a local control plane.

The current transport also defines session and protocol headers. A future implementation must preserve `MCP-Session-Id` where sessions are negotiated and handle `MCP-Protocol-Version` so clients and servers can reject incompatible protocol assumptions cleanly.

## Project Stance

The current CLI and MCP server should stay local-first:

- stdio remains the default for Claude Code, Cursor, Codex, VS Code, Windsurf/Cascade, Hermes Agent, and generic local MCP clients.
- Streamable HTTP must be opt-in and disabled by default.
- The existing Chrome extension bridge HTTP endpoints are internal loopback/extension plumbing, not an MCP Streamable HTTP endpoint.
- A network transport must expose the same tool profiles, confirmation gates, sensitive-data gates, output contracts, and run-scoped tab ownership as stdio.
- Remote browser-control hosting is not a goal for the current project.

## Required Security Gates

A future Streamable HTTP implementation must satisfy these gates before release:

1. Bind to `127.0.0.1` by default.
2. Reject non-loopback binds unless an explicit unsafe flag is set after a documented security review.
3. Validate `Origin` on every browser-origin-capable request and reject missing or untrusted origins when the request could come from a browser context.
4. Include DNS rebinding tests that prove hostile web origins cannot drive the local MCP endpoint.
5. Require authentication before any non-loopback or remotely reachable deployment.
6. Require TLS for any non-loopback or remotely reachable deployment.
7. Preserve `MCP-Session-Id` handling for session-scoped clients.
8. Preserve `MCP-Protocol-Version` handling for protocol compatibility checks.
9. Keep all mutating and private-data tools behind the same `confirmed` and `confirmSensitive` gates as stdio.
10. Keep tool-profile filtering identical to stdio so compact clients can keep using `core` or `read`.

## Implementation Shape

The safest implementation path is a transport adapter around the existing MCP tool registry rather than a second command surface:

1. Extract server creation so stdio and Streamable HTTP share tool registration, profile filtering, schema validation, and response formatting.
2. Add an opt-in launcher, for example `CHROME_BRIDGE_ENABLE_STREAMABLE_HTTP=1`, with a separate bind and port configuration.
3. Default the bind address to `127.0.0.1`.
4. Add an authentication token requirement before permitting non-loopback binds.
5. Add explicit `Origin` allowlist configuration for browser-based clients.
6. Add transport-level tests for initialization, tools/list, tools/call, session headers, protocol headers, and rejected origins.
7. Add client compatibility smoke checks only after the offline contract tests are green.

## Acceptance Criteria

Before marking Streamable HTTP as shipped:

- `npm run check` includes transport contract coverage.
- The docs include a safe local setup and a separate unsafe/remote warning.
- `docs/COMPATIBILITY.md` explains when stdio is preferred and when Streamable HTTP is appropriate.
- `docs/SAFETY.md` documents Origin, DNS rebinding, authentication, TLS, and bind-address requirements.
- The implementation refuses public network exposure by default.
- Existing stdio behavior remains unchanged.

## Non-Goals

- No hosted browser farm.
- No public unauthenticated MCP endpoint.
- No automatic exposure of the user's logged-in Chrome profile over a LAN or public tunnel.
- No bypass of existing confirmation gates.
