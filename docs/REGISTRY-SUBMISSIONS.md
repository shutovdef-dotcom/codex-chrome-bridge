# Registry Submission Checklist

Use this checklist when submitting Chrome MCP Bridge to MCP registries, agent marketplaces, open-source directories, or client integration galleries.

## Canonical Positioning

Primary description:

> Local Chrome MCP bridge for AI agents that need safe, read-first access to the user's real logged-in Chrome profile.

Short description:

> Local Chrome MCP server, extension, and CLI for safe agent access to a real logged-in Chrome profile.

## Required Metadata

- GitHub topics: `mcp`, `mcp-server`, `model-context-protocol`, `chrome-extension`, `chrome`, `browser-automation`, `ai-agents`, `claude-code`, `cursor`, `codex`, `windsurf`, `vscode`, `local-first`, `privacy`, `real-browser`, `logged-in-browser`, `agent-tools`
- npm keywords: `chrome`, `mcp`, `mcp-server`, `model-context-protocol`, `codex`, `claude-code`, `cursor`, `windsurf`, `vscode`, `hermes-agent`, `ai-agents`, `mcp-browser`, `agent-browser`, `browser-automation`, `real-browser`, `logged-in-browser`, `chrome-profile`, `chrome-extension`, `local-first`, `privacy`, `agent-tools`
- Repository URL: `https://github.com/shutovdef-dotcom/codex-chrome-bridge`
- Package name: `codex-chrome-bridge`
- CLI binary: `chrome-bridge`
- MCP server entrypoint: `mcp/chrome-bridge-mcp.mjs`

## Submission Assets

- README link
- Compatibility guide: [COMPATIBILITY.md](COMPATIBILITY.md)
- Install fast paths: [INSTALL.md](INSTALL.md)
- Privacy policy: [PRIVACY-POLICY.md](PRIVACY-POLICY.md)
- Chrome extension setup: [EXTENSION.md](EXTENSION.md)
- One or two terminal screenshots or GIFs that do not expose private browser data

## Claims To Emphasize

- Local-only loopback bridge
- Real logged-in Chrome profile
- Read-first workflow
- Scoped tab groups
- Explicit confirmation for mutations and private-data reads
- Metadata-first output and local artifacts
- Compatibility with Claude Code, Cursor, Codex, VS Code, Windsurf/Cascade, Hermes Agent, and generic stdio MCP clients

## Claims To Avoid

- CAPTCHA bypass
- Stealth or proxy browser farm
- Hosted browser platform
- Unattended private account mutation
- Credential extraction

## Maintainer Notes

- Do not store registry account credentials in this repository.
- Track submission status in a local issue, bead, or project board instead of hardcoding secrets or account state here.
- If `chrome-mcp-bridge` becomes an alias package later, update this checklist and keep the migration path explicit.
