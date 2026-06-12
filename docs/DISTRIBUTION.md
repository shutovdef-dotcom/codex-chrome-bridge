# Distribution And GitHub SEO

Chrome MCP Bridge should be marketed as a universal local Chrome MCP bridge, not as a Codex-only helper. Keep the existing repository and npm package names until a migration plan exists, but lead with the broader name in docs and discovery metadata.

## Positioning

Primary phrase:

> Local Chrome MCP bridge for AI agents that need safe, read-first access to the user's real logged-in Chrome profile.

Short GitHub description:

> Local Chrome MCP server, extension, and CLI for safe AI-agent access to a real logged-in Chrome profile.

Primary differentiators:

- Real logged-in Chrome profile, not a disposable cloud browser.
- Local-only bridge bound to loopback.
- Scoped tab groups and session-scoped group names.
- Explicit confirmations for mutations and private browser data.
- Metadata-first outputs, local artifacts, and compact MCP profiles for IDE agents.
- Compatible with Claude Code, Cursor, Codex, VS Code, Windsurf/Cascade, Hermes Agent, and generic stdio MCP clients.

## Suggested GitHub Topics

Use these topics if GitHub topic slots allow:

- `mcp`
- `mcp-server`
- `model-context-protocol`
- `chrome-extension`
- `chrome`
- `browser-automation`
- `ai-agents`
- `claude-code`
- `cursor`
- `codex`
- `windsurf`
- `vscode`
- `local-first`
- `privacy`
- `real-browser`
- `logged-in-browser`
- `agent-tools`

## NPM Keywords

Keep npm keywords aligned with GitHub topics and README discovery phrases. Include both legacy and new names so existing users can still find the package:

- `chrome`
- `mcp`
- `mcp-server`
- `model-context-protocol`
- `codex`
- `claude-code`
- `cursor`
- `windsurf`
- `vscode`
- `hermes-agent`
- `ai-agents`
- `mcp-browser`
- `agent-browser`
- `browser-automation`
- `real-browser`
- `logged-in-browser`
- `chrome-profile`
- `chrome-extension`
- `local-first`
- `privacy`
- `agent-tools`

## Client Distribution

Ship setup in this order:

1. Built-in config generator: `chrome-bridge mcp-config` and `chrome_bridge_mcp_config`.
2. Docs page: [MCP Client Compatibility](COMPATIBILITY.md).
3. README quick-start snippets for Claude Code, Cursor, Codex, VS Code, Windsurf/Cascade, and Hermes Agent.
4. One-click install buttons where client docs provide a stable format.
5. Optional thin Claude Code plugin only if it delegates to the local CLI/MCP server and does not create a second browser-control surface.

## Rebrand Boundaries

Keep these stable for now:

- npm package: `codex-chrome-bridge`
- repository URL: `shutovdef-dotcom/codex-chrome-bridge`
- CLI binary: `chrome-bridge`
- MCP binary: `chrome-bridge-mcp`
- legacy helper: `codex-config`
- default tab group family: `Codex Bridge`, because it is part of current cleanup and managed-group compatibility

Future alias plan:

1. Checked on 2026-06-12: `npm view chrome-mcp-bridge` returned `E404` with `Unpublished on 2025-08-15T05:17:00.343Z`.
2. Keep the local alias scaffold under `aliases/chrome-mcp-bridge/` until npm ownership and publish policy are confirmed.
3. If publishing becomes possible, ship it as a thin alias/wrapper rather than an immediate breaking rename.
4. Keep `codex-chrome-bridge` maintained with migration notes for at least one minor release.
5. Only then consider repository rename or GitHub redirect.

## What Not To Promise

Do not position the project as:

- a CAPTCHA bypass tool
- a stealth/proxy/browser-farm product
- a hosted browser platform
- a scraper for private content without permission
- a way to extract credentials or bypass user approval

Those categories are served by hosted-browser competitors. Chrome MCP Bridge should stay the safest local real-profile option.
