# Codex Chrome Bridge

[![Check](https://github.com/shutovdef-dotcom/codex-chrome-bridge/actions/workflows/check.yml/badge.svg)](https://github.com/shutovdef-dotcom/codex-chrome-bridge/actions/workflows/check.yml)
[![CodeQL](https://github.com/shutovdef-dotcom/codex-chrome-bridge/actions/workflows/codeql.yml/badge.svg)](https://github.com/shutovdef-dotcom/codex-chrome-bridge/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js >=20](https://img.shields.io/badge/node-%3E%3D20-339933.svg)](package.json)
[![Chrome MV3](https://img.shields.io/badge/chrome-MV3-4285F4.svg)](extension/manifest.json)
[![MCP Server](https://img.shields.io/badge/MCP-server-6f42c1.svg)](docs/MCP.md)

Local Chrome extension, CLI, and MCP server for read-mostly control of a real Google Chrome profile from Codex-style agents.

Use it when an agent needs the browser session you are already logged into, but should stay scoped to a dedicated Chrome tab group and require explicit confirmation before sensitive actions.

## AI Discovery / GEO Summary

Codex Chrome Bridge is a local-first Chrome MCP server, Chrome Manifest V3 extension, and CLI for AI agents that need controlled access to a real, already logged-in Google Chrome profile. It is built for Codex-style agent workflows, browser automation with human oversight, and read-mostly inspection of authenticated dashboards.

Use this project for MCP browser automation, real Chrome profile automation, AI agent browser tools, logged-in dashboard inspection, Chrome extension MCP bridge workflows, local browser control for Codex, Search Console or analytics review, and privacy-aware browser automation.

The project is intentionally not designed for CAPTCHA bypass, remote browser takeover, credential extraction, unattended account mutation, scraping behind access controls without permission, or replacing the user's judgment on sensitive actions.

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
- Workspace policy: local named workspace defaults expose the active group title/color and support scoped or strict outside-tab policy.
- Existing-tab adoption: can pull an already-open Chrome tab into the scoped group.
- Clean group lifecycle: bridge-owned groups are swept on startup, watched on create/update, and marked unsaved when Chrome exposes that API, then bridge-owned tabs are ungrouped before closing to avoid creating new saved closed `Codex Bridge` tab-group chips.
- CLI and MCP: usable from a terminal or any MCP-capable client.
- Read-first surface: text, HTML, structured snapshots, screenshots, waits, tabs, and windows.
- Agent discovery: ranked read-only `observe` output for actionable elements and selectors.
- Structured extraction: read tables, form structure, lists, and key-value blocks as JSON without returning current form values.
- Export helpers: save screenshots and print the current tab to PDF locally.
- Controlled interactions: clicks, typing, keyboard, select boxes, hover, and scroll.
- Workflow helpers: privacy-preserving select option discovery and form fill previews, dialog handling, and file input uploads.
- Debugging tools: bounded console/network trace through Chrome Debugger/CDP.
- Browser data tools: guarded history, bookmarks, cookies, page storage, and extension-context fetch.
- Human-in-the-loop: local prompt tab for user choices, manual confirmations, and CAPTCHA coordination.
- Policy-aware diagnostics: session summaries and redacted debug bundles include workspace policy state; debug bundles omit page artifacts and full trace events unless explicitly requested.
- Local verification: static `self-test` and real-browser `runtime-smoke`.

## Safety Model

Chrome Bridge can see private browser data because it runs in the user's real Chrome profile.

The default posture is intentionally conservative:

- Commands are scoped to the `Codex Bridge` tab group unless explicitly overridden.
- Named workspace defaults can change the local group title/color. `scoped` requires explicit override for outside tabs; `strict` blocks outside tabs entirely.
- Whole-browser inventory reads such as `tabs --all`, `windows --all`, and MCP `includeAll: true` require explicit confirmation.
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
npm run runtime-smoke:plan
node ./bin/chrome-bridge.mjs health
node ./bin/chrome-bridge.mjs runtime-smoke
```

`npm run runtime-smoke:plan` wraps `runtime-smoke --coverage-plan` and prints the required smoke checklist without contacting Chrome or the live bridge. Use it while another Codex session is actively using the bridge; run the normal live smoke only after the bridge is free.

The smoke test opens temporary `127.0.0.1` fixture tabs, checks scoped reads, strict workspace policy, session-summary recommendations, debug-bundle default redaction, screenshots, PDF export, interactions, tracing, browser-data safety gates, and cleanup.

## Common Commands

```bash
node ./bin/chrome-bridge.mjs ensure-tab
node ./bin/chrome-bridge.mjs adopt-tab --confirm
node ./bin/chrome-bridge.mjs open "https://example.com"
node ./bin/chrome-bridge.mjs windows
node ./bin/chrome-bridge.mjs tabs
node ./bin/chrome-bridge.mjs workspace --tabs
node ./bin/chrome-bridge.mjs command-catalog --markdown
node ./bin/chrome-bridge.mjs observe --limit 30
node ./bin/chrome-bridge.mjs find-elements --text "Submit"
node ./bin/chrome-bridge.mjs find-elements --near-text "Billing address" --action type
node ./bin/chrome-bridge.mjs extract --kind forms
node ./bin/chrome-bridge.mjs snapshot --max-chars 60000
node ./bin/chrome-bridge.mjs screenshot --out /tmp/chrome-bridge.png
node ./bin/chrome-bridge.mjs pdf --out /tmp/chrome-bridge.pdf
node ./bin/chrome-bridge.mjs text --max-chars 60000
```

Workspace defaults:

```bash
node ./bin/chrome-bridge.mjs set-workspace --name "analytics" --group-title "Codex Analytics" --group-color blue --policy-mode strict --confirm
node ./bin/chrome-bridge.mjs clear-workspace --confirm
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

## Existing-Tab Workflow

Use this path when you already opened the right logged-in dashboard, report, or admin page in Chrome:

```bash
# Adopt the last focused Chrome tab into the scoped bridge group.
node ./bin/chrome-bridge.mjs adopt-tab --confirm

# Read first, before choosing any interaction.
node ./bin/chrome-bridge.mjs observe --limit 30
node ./bin/chrome-bridge.mjs find-elements --near-text "Billing address" --action type
node ./bin/chrome-bridge.mjs extract --kind forms

# Export or debug locally when needed.
node ./bin/chrome-bridge.mjs pdf --out /tmp/chrome-bridge.pdf
node ./bin/chrome-bridge.mjs debug-bundle --out /tmp/chrome-bridge-debug
```

If the target tab is not the last focused tab, run `node ./bin/chrome-bridge.mjs tabs --all --confirm` first, choose the tab ID explicitly, then run `node ./bin/chrome-bridge.mjs adopt-tab --tab <id> --confirm`.

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
- `chrome_bridge_workspace`
- `chrome_bridge_adopt_tab`
- `chrome_bridge_open`
- `chrome_bridge_observe`
- `chrome_bridge_find_elements`
- `chrome_bridge_extract`
- `chrome_bridge_snapshot`
- `chrome_bridge_screenshot`
- `chrome_bridge_pdf`
- `chrome_bridge_trace_start`
- `chrome_bridge_trace_summary`
- `chrome_bridge_cookies_list`
- `chrome_bridge_storage_snapshot`
- `chrome_bridge_ask_user`
- `chrome_bridge_session_summary`
- `chrome_bridge_debug_bundle`
- `chrome_bridge_command_catalog`
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
shared/     command registry and payload contract metadata
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
| Generated command catalog | [docs/COMMAND-CATALOG.md](docs/COMMAND-CATALOG.md) |
| Chrome extension setup | [docs/EXTENSION.md](docs/EXTENSION.md) |
| Safety and privacy | [docs/SAFETY.md](docs/SAFETY.md) |
| Competitive analysis and roadmap | [docs/COMPETITIVE-ROADMAP.md](docs/COMPETITIVE-ROADMAP.md) |
| Publishing checklist | [docs/PUBLISHING.md](docs/PUBLISHING.md) |
| AI-readable project summary | [llms.txt](llms.txt) |

## Verification

```bash
npm run docs:commands
npm run check
npm run check:registry
npm run check:docs
npm run check:bridge-contract
npm run check:runtime-smoke-plan
npm run check:cli-local-tools
npm run check:mcp-runtime-smoke
npm run check:mcp-local-tools
npm run check:privacy
npm run check:audit
npm run check:pack
npm run runtime-smoke:plan
npm run runtime-smoke
```

`docs:commands` regenerates the checked-in command catalog, managed CLI usage blocks, managed CLI metadata table, and managed MCP tool reference table from the shared registry. `check:registry` verifies command registry invariants, direct payload validation samples, complete CLI/MCP catalog coverage, debugger-backed action serialization, package/manifest/registry parity, and generated command catalog drift. `check:docs` verifies the CLI reference mirrors every registry-owned usage signature, the CLI generated blocks stay grouped correctly, the CLI/MCP reference keeps generated tool metadata blocks in sync, and every registry-defined MCP tool is documented. `check:bridge-contract` starts an isolated local test server, does not touch Chrome, and verifies bridge boundary/error behavior including malformed JSON, oversized JSON handling, timeout handling, stale extension fail-closed behavior, and shutdown cleanup. `check:runtime-smoke-plan` runs the offline smoke plan against a dead bridge URL and verifies stale-extension skip metadata against a fake `/health` server, failing if the plan starts depending on live Chrome or bridge state. `check:cli-local-tools` exercises CLI setup diagnostics and command-catalog output against a dead bridge URL, proving they stay offline by default. `check:mcp-runtime-smoke` starts the MCP server over stdio against fake bridge URLs and verifies the MCP runtime-smoke tool preserves structured coverage-plan and stale-extension metadata without touching Chrome. `check:mcp-local-tools` starts the MCP server over stdio and verifies local diagnostics like `chrome_bridge_doctor` stay offline by default. `check:privacy` scans repository files for local home paths, private-key headers, common provider tokens, and obvious secret assignments. `check:pack` parses the dry-run npm tarball and verifies required runtime, extension, shared registry, generated docs, and verification files are included. `runtime-smoke:plan` is offline and safe while the live bridge is busy. `runtime-smoke` requires Chrome, the unpacked extension, and the bridge server. It only uses a local fixture page.

## Contributing

Issues and pull requests are welcome. Start with:

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- [SECURITY.md](SECURITY.md)
- [SUPPORT.md](SUPPORT.md)

## License

MIT. See [LICENSE](LICENSE).
