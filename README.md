# Codex Chrome Bridge

[![Check](https://github.com/shutovdef-dotcom/codex-chrome-bridge/actions/workflows/check.yml/badge.svg)](https://github.com/shutovdef-dotcom/codex-chrome-bridge/actions/workflows/check.yml)
[![CodeQL](https://github.com/shutovdef-dotcom/codex-chrome-bridge/actions/workflows/codeql.yml/badge.svg)](https://github.com/shutovdef-dotcom/codex-chrome-bridge/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js >=20](https://img.shields.io/badge/node-%3E%3D20-339933.svg)](package.json)
[![Chrome MV3](https://img.shields.io/badge/chrome-MV3-4285F4.svg)](extension/manifest.json)
[![MCP Server](https://img.shields.io/badge/MCP-server-6f42c1.svg)](docs/MCP.md)

Local Chrome extension, CLI, and MCP server for read-mostly control of a real Google Chrome profile from Codex-style agents.

Use it when an agent needs the browser session you are already logged into, but should stay scoped to a dedicated Chrome tab group and require explicit confirmation before sensitive actions.

## Why

Most browser automation starts a clean browser profile. That is great for tests and bad for real dashboards.

Codex Chrome Bridge is for logged-in, human-owned Chrome workflows:

- search consoles and webmaster dashboards
- analytics tools
- admin panels
- extension-authenticated pages
- manual steps that need the user's browser context

## Highlights

- Real Chrome profile: uses the user's existing cookies, extensions, and logins.
- Scoped by default: keeps work inside a `Codex Bridge` Chrome tab group.
- CLI and MCP: usable from a terminal or any MCP-capable client.
- Read-first surface: text, HTML, structured snapshots, screenshots, waits, tabs, and windows.
- Controlled interactions: clicks, typing, keyboard, select boxes, hover, and scroll.
- Debugging tools: bounded console/network trace through Chrome Debugger/CDP.
- Browser data tools: guarded history, bookmarks, cookies, page storage, and extension-context fetch.
- Human-in-the-loop: local prompt tab for user choices, manual confirmations, and CAPTCHA coordination.
- Local verification: static `self-test` and real-browser `runtime-smoke`.

## Safety Model

Chrome Bridge can see private browser data because it runs in the user's real Chrome profile.

The default posture is intentionally conservative:

- Commands are scoped to the `Codex Bridge` tab group unless explicitly overridden.
- Mutating actions require `confirmed=true` or `--confirm`.
- Cookie values, whole-cookie-jar access, storage values, and credentialed requests require `confirmSensitive=true` or `--confirm-sensitive`.
- The bridge server binds to `127.0.0.1`.
- Automatic CAPTCHA bypass is out of scope; use the human prompt for manual coordination.

Read [Safety and Privacy](docs/SAFETY.md) before using this with sensitive accounts.

## Quick Start

```bash
git clone https://github.com/shutovdef-dotcom/codex-chrome-bridge.git
cd codex-chrome-bridge
npm install
npm run check
npm run server
```

In Chrome:

1. Open `chrome://extensions/`.
2. Enable Developer mode.
3. Click "Load unpacked".
4. Select this repository's `extension/` folder.

Verify the bridge:

```bash
node ./bin/chrome-bridge.mjs health
node ./bin/chrome-bridge.mjs runtime-smoke
```

The smoke test opens a temporary `127.0.0.1` fixture tab inside the `Codex Bridge` group, checks reads, screenshots, interactions, tracing, browser-data safety gates, and closes the test tab.

## Common Commands

```bash
node ./bin/chrome-bridge.mjs ensure-tab
node ./bin/chrome-bridge.mjs open "https://example.com"
node ./bin/chrome-bridge.mjs windows
node ./bin/chrome-bridge.mjs tabs
node ./bin/chrome-bridge.mjs snapshot --max-chars 60000
node ./bin/chrome-bridge.mjs screenshot --out /tmp/chrome-bridge.png
node ./bin/chrome-bridge.mjs text --max-chars 60000
```

Controlled interaction:

```bash
node ./bin/chrome-bridge.mjs click --selector "button" --confirm
```

Sensitive data:

```bash
node ./bin/chrome-bridge.mjs cookies --url "https://example.com" --confirm
node ./bin/chrome-bridge.mjs cookies --url "https://example.com" --include-values --confirm --confirm-sensitive
```

Human-in-the-loop prompt:

```bash
node ./bin/chrome-bridge.mjs ask --question "Which account should I inspect?" --choices-json '["Production","Staging"]'
```

Full reference: [CLI](docs/CLI.md).

## MCP Setup

Add this to `~/.codex/config.toml` or your MCP client's equivalent config:

```toml
[mcp_servers.chrome-bridge]
command = "node"
args = ["/absolute/path/to/codex-chrome-bridge/mcp/chrome-bridge-mcp.mjs"]
startup_timeout_sec = 20
tool_timeout_sec = 60
```

Useful MCP tools:

- `chrome_bridge_health`
- `chrome_bridge_windows`
- `chrome_bridge_tabs`
- `chrome_bridge_open`
- `chrome_bridge_snapshot`
- `chrome_bridge_screenshot`
- `chrome_bridge_trace_start`
- `chrome_bridge_cookies_list`
- `chrome_bridge_storage_snapshot`
- `chrome_bridge_ask_user`
- `chrome_bridge_runtime_smoke`

Full reference: [MCP](docs/MCP.md).

## macOS Background Service

Install the local bridge server as a LaunchAgent:

```bash
npm run install:launch-agent
launchctl kickstart -k "gui/$(id -u)/com.codex.chrome-bridge"
node ./bin/chrome-bridge.mjs health
```

Uninstall:

```bash
npm run uninstall:launch-agent
```

## Project Layout

```text
bin/        CLI entrypoint
extension/  Chrome Manifest V3 extension
mcp/        MCP stdio server
server/     local HTTP/WebSocket bridge server
scripts/    macOS LaunchAgent helpers
docs/       user and developer docs
codex/      optional Codex skill handoff
```

## Documentation

| Topic | Link |
| --- | --- |
| Architecture | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| CLI reference | [docs/CLI.md](docs/CLI.md) |
| MCP reference | [docs/MCP.md](docs/MCP.md) |
| Chrome extension setup | [docs/EXTENSION.md](docs/EXTENSION.md) |
| Safety and privacy | [docs/SAFETY.md](docs/SAFETY.md) |
| Publishing checklist | [docs/PUBLISHING.md](docs/PUBLISHING.md) |

## Verification

```bash
npm run check
npm run check:audit
npm run check:pack
npm run runtime-smoke
```

`runtime-smoke` requires Chrome, the unpacked extension, and the bridge server. It only uses a local fixture page.

## Contributing

Issues and pull requests are welcome. Start with:

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- [SECURITY.md](SECURITY.md)
- [SUPPORT.md](SUPPORT.md)

## License

MIT. See [LICENSE](LICENSE).
