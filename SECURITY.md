# Security Policy

## Supported Versions

The current public package line is `0.3.x`.

## Reporting a Vulnerability

Please open a private security advisory on GitHub if available, or contact the repository maintainer privately.

Do not include private browser data, cookies, tokens, dashboard screenshots, or account identifiers in public issues.

## Security Model

Codex Chrome Bridge connects three local surfaces:

- A Chrome Manifest V3 extension loaded in the user's real Chrome profile.
- A local HTTP/WebSocket bridge server on `127.0.0.1`.
- A CLI and MCP stdio server that send commands to the bridge server.

The extension has broad Chrome permissions because it is meant to inspect real browser tabs. The project relies on scoping and confirmation gates:

- Browser work is scoped to the `Codex Bridge` tab group by default.
- Mutating and sensitive commands require confirmation.
- High-risk values require a second sensitive confirmation.
- The bridge server is local-only by default.

See [docs/SAFETY.md](docs/SAFETY.md) for operational guidance.

