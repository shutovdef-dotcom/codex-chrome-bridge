# `chrome-mcp-bridge` Alias Package Scaffold

This directory prepares a thin alias package for a future `chrome-mcp-bridge` npm publish without changing the main package or repository today.

## Current Status

- Checked on 2026-06-12 via `npm view chrome-mcp-bridge`.
- npm returned `E404` with `Unpublished on 2025-08-15T05:17:00.343Z`.
- That means the name is not currently installable, but it also has prior registry history and should be treated as a release-planning item rather than an automatic publish target.

## Intended Publish Shape

- Keep `codex-chrome-bridge` as the stable compatibility package.
- Publish `chrome-mcp-bridge` only as a thin wrapper that depends on `codex-chrome-bridge`.
- Reuse the same `chrome-bridge` and `chrome-bridge-mcp` binaries.
- Remove `private: true` only after npm ownership, migration docs, and maintainer signoff are confirmed.
