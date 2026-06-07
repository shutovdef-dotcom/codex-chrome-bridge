# Codex Chrome Bridge

Local Chrome extension, CLI, and MCP server for read-mostly control of a real Google Chrome profile from Codex-style agents.

It is designed for workflows where a browser automation agent needs the user's already logged-in Chrome session, but should stay scoped to a dedicated tab group and avoid sensitive or mutating actions unless explicitly confirmed.

## What It Does

- Uses the user's real Chrome profile instead of a fresh automation browser.
- Keeps agent work inside a `Codex Bridge` Chrome tab group by default.
- Lists scoped Chrome windows and grouped tabs for multi-window workflows.
- Exposes a command-line interface for browser reads, screenshots, tabs, waits, and controlled interactions.
- Exposes the same surface as an MCP server for Codex or other MCP clients.
- Opens a local human-in-the-loop prompt tab when an agent needs user input.
- Captures bounded console and network metadata through Chrome Debugger/CDP.
- Provides guarded access to history, bookmarks, cookies, page storage, and extension-context fetches.
- Ships with local self-tests and a runtime smoke test.

## Safety Model

Chrome Bridge can see private browser data because it runs in the user's real Chrome profile. The project is intentionally read-mostly by default:

- Tab commands are scoped to the `Codex Bridge` tab group unless explicitly overridden.
- Mutating actions such as clicks, typing, selection, closing tabs, tracing, history, bookmarks, cookies, storage, and requests require `confirmed=true` or `--confirm`.
- Cookie values, whole-jar cookie listing, storage values, and credentialed requests require an additional `confirmSensitive=true` or `--confirm-sensitive`.
- The local HTTP bridge binds to `127.0.0.1`.
- The extension only accepts bridge traffic from its own Chrome extension context.

See [docs/SAFETY.md](docs/SAFETY.md) before using this with sensitive accounts.

## Requirements

- macOS, Linux, or Windows for manual server mode.
- macOS for the included LaunchAgent installer.
- Node.js 20 or newer.
- Google Chrome.
- A local MCP client such as Codex if you want MCP integration.

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
4. Select the `extension/` folder from this repository.

Then verify:

```bash
node ./bin/chrome-bridge.mjs health
node ./bin/chrome-bridge.mjs runtime-smoke
```

The runtime smoke test opens a temporary `127.0.0.1` fixture tab inside the `Codex Bridge` group, verifies reads, screenshots, interactions, trace, browser-data safety gates, and closes the test tab.

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

## Codex MCP Config

Add this to `~/.codex/config.toml`:

```toml
[mcp_servers.chrome-bridge]
command = "node"
args = ["/absolute/path/to/codex-chrome-bridge/mcp/chrome-bridge-mcp.mjs"]
startup_timeout_sec = 20
tool_timeout_sec = 60
```

Then restart or reload your MCP client.

## CLI Examples

```bash
node ./bin/chrome-bridge.mjs ensure-tab
node ./bin/chrome-bridge.mjs open "https://example.com"
node ./bin/chrome-bridge.mjs windows
node ./bin/chrome-bridge.mjs tabs
node ./bin/chrome-bridge.mjs snapshot --max-chars 60000
node ./bin/chrome-bridge.mjs screenshot --out /tmp/chrome-bridge.png
node ./bin/chrome-bridge.mjs wait --selector "main"
node ./bin/chrome-bridge.mjs text --max-chars 60000
```

Controlled interaction example:

```bash
node ./bin/chrome-bridge.mjs click --selector "button" --confirm
```

Sensitive data example:

```bash
node ./bin/chrome-bridge.mjs cookies --url "https://example.com" --confirm
node ./bin/chrome-bridge.mjs cookies --url "https://example.com" --include-values --confirm --confirm-sensitive
```

Human-in-the-loop prompt example:

```bash
node ./bin/chrome-bridge.mjs ask --question "Which account should I inspect?" --choices-json '["Production","Staging"]'
```

Full CLI reference: [docs/CLI.md](docs/CLI.md).

## MCP Tools

The MCP server exposes tools such as:

- `chrome_bridge_health`
- `chrome_bridge_windows`
- `chrome_bridge_tabs`
- `chrome_bridge_open`
- `chrome_bridge_snapshot`
- `chrome_bridge_screenshot`
- `chrome_bridge_click`
- `chrome_bridge_type`
- `chrome_bridge_trace_start`
- `chrome_bridge_cookies_list`
- `chrome_bridge_storage_snapshot`
- `chrome_bridge_ask_user`
- `chrome_bridge_runtime_smoke`

Full MCP reference: [docs/MCP.md](docs/MCP.md).

## Project Layout

```text
bin/        CLI entrypoint
extension/  Chrome Manifest V3 extension
mcp/        MCP stdio server
server/     Local HTTP/WebSocket bridge server
scripts/    macOS LaunchAgent helpers
docs/       User and developer docs
codex/      Optional Codex skill handoff
```

## Verification

```bash
npm run check
npm run runtime-smoke
```

`npm run check` validates JavaScript syntax and the expected CLI/MCP/extension surface.

`npm run runtime-smoke` requires Chrome, the unpacked extension, and the bridge server. It performs a real browser smoke test without touching external websites.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [CLI Reference](docs/CLI.md)
- [MCP Reference](docs/MCP.md)
- [Chrome Extension Setup](docs/EXTENSION.md)
- [Safety and Privacy](docs/SAFETY.md)
- [Publishing Checklist](docs/PUBLISHING.md)

## License

MIT. See [LICENSE](LICENSE).
