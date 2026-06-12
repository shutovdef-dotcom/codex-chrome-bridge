# Maintainability Guide

Chrome MCP Bridge is intentionally safety-heavy: command metadata, docs, CLI, MCP, extension dispatch, package contents, and smoke coverage are checked together. This guide keeps that safety net from turning into maintenance drag.

## Current Hot Spots

These modules are allowed to be large today, but they should be treated as refactor targets before major new browser powers are added:

| Area | Current reason | Preferred direction |
| --- | --- | --- |
| `bin/cli/main.mjs` | CLI implementation hub behind the stable public binary. | Split into argument parsing, bridge client, output/artifacts, local setup commands, browser commands, and runtime smoke modules. |
| `mcp/server/main.mjs` | MCP server implementation hub behind the stable public binary. | Split into schemas, bridge client, profiles, prompts, resources, and grouped tool registration modules. |
| `extension/page-scripts/main.js` | Injected page-context helpers must be self-contained and closure-safe. | Split only with page-context-safe tests that prove functions still work through `chrome.scripting.executeScript`. |
| `scripts/checks/contracts/check-command-registry.mjs` | Cross-surface registry, docs, package, and safety invariants. | Move reusable assertions into helper modules and prefer behavior fixtures over raw source-string checks. |
| `scripts/checks/cli/check-cli-local-tools.mjs` | CLI local diagnostics and fake bridge coverage. | Extract fake bridge helpers and per-feature assertions. |
| `scripts/checks/mcp/check-mcp-local-tools.mjs` | MCP local diagnostics and fake bridge coverage. | Share fake bridge/client helpers with CLI checks where possible. |

## Source-String Check Policy

Source-string checks are useful for stable public entrypoints, package exposure, generated docs drift, and safety invariants that are hard to exercise otherwise.

Use them sparingly for new work:

- Prefer registry-derived assertions when checking CLI/MCP/docs parity.
- Prefer fake bridge or fixture-backed behavior tests when checking command behavior.
- Prefer package dry-run checks when checking published files.
- Keep source-string checks focused on public wrappers, required exports, exact recovery hints, or deliberate safety gates.
- If a source-string check breaks during a refactor, ask whether it protects behavior or only protects old layout.

## Dependency Strategy

Runtime dependencies are intentionally small:

- `@modelcontextprotocol/sdk`
- `ws`
- `zod`

`zod` currently stays on v3 because it is stable with the current MCP SDK schema usage and all registry/MCP checks pass. Do not upgrade to Zod v4 as a drive-by change.

Before moving to Zod v4:

1. Verify MCP SDK compatibility with v4 schemas.
2. Run the full local suite: `npm run check`, `npm run check:pack`, and `npm run check:audit`.
3. Run live verification when Chrome is free: reload extension, live doctor, and runtime smoke summary.
4. Confirm generated MCP tool schemas and client compatibility examples still work.
5. Record the migration in `CHANGELOG.md`.

## Adding Or Changing A Command

Start in the shared registry, not in CLI or MCP:

1. Add or update action metadata, allowed payload keys, risk tier, timeout, CLI command name, MCP tool name, and docs metadata in `shared/registry/`.
2. Add server-side payload validation in `shared/registry/validation.mjs`.
3. Add extension dispatch and implementation if the command reaches Chrome.
4. Add CLI handling in `bin/cli/main.mjs` or a future CLI command module.
5. Add MCP tool handling in `mcp/server/main.mjs` or a future MCP tool module.
6. Regenerate docs with `npm run docs:commands` if registry-owned docs changed.
7. Add focused checks and update package-content checks if new files are published.
8. Run `npm run check`, `npm run check:pack`, and `npm run check:audit`.
9. Run live smoke for browser-behavior changes when the bridge is free.

## Maintainer Health Report

Run:

```bash
npm run check:maintainability
```

The checker prints the current line-count hot spots, confirms this guide exists, confirms the Zod decision is documented, and confirms source-string check policy is documented.
