# MCP Client Compatibility

Chrome MCP Bridge is a local stdio MCP server plus a Chrome extension and bridge daemon. It can be used from any MCP client that can start a local command over standard input/output.

The fastest way to get a client-specific snippet is:

```bash
node ./bin/chrome-bridge.mjs mcp-config
node ./bin/chrome-bridge.mjs mcp-config --client claude-code
node ./bin/chrome-bridge.mjs mcp-config --client cursor
node ./bin/chrome-bridge.mjs mcp-config --client codex
node ./bin/chrome-bridge.mjs mcp-config --client vscode
node ./bin/chrome-bridge.mjs mcp-config --client windsurf
node ./bin/chrome-bridge.mjs mcp-config --client hermes
```

The MCP tool `chrome_bridge_mcp_config` returns the same snippets from inside clients that already have the server installed.

## Shared Requirements

1. Install Node.js 20 or newer.
2. Install dependencies with `npm install`.
3. Load the unpacked Chrome extension from `extension/`.
4. Start the bridge server with `npm run server` or install the LaunchAgent on macOS.
5. Configure your MCP client to run `node /absolute/path/to/mcp/chrome-bridge-mcp.mjs`.

Run these checks after setup:

```bash
node ./bin/chrome-bridge.mjs doctor --live-checks
node ./bin/chrome-bridge.mjs runtime-smoke --summary-only --out /tmp/chrome-bridge-runtime-smoke.json
```

## Tool Profiles

The default MCP server profile is `full`, which exposes every registered tool. Some IDE agents work better with fewer tools, so the server also supports compact profiles through `CHROME_BRIDGE_MCP_TOOL_PROFILE`.

| Profile | Best for | Behavior |
| --- | --- | --- |
| `full` | Claude Code, Codex, local harnesses, debugging | Exposes the full MCP tool surface. |
| `core` | Cursor, Windsurf/Cascade, IDE agents with compact tool budgets | Exposes 39 high-value tools and omits sensitive private-browser tools by default. |
| `read` | Conservative read-mostly clients | Exposes read/discovery/export/diagnostic tools and omits most mutation/private-data tools. |

Use `core` first in clients that warn about large MCP tool lists. Switch to `full` when you specifically need private browser-data tools such as cookies, storage values, history, bookmarks, or extension-context requests.

## Claude Code

Claude Code supports local, project, and user MCP scopes, and project-scoped servers live in `.mcp.json`. Source: [Claude Code MCP docs](https://docs.anthropic.com/en/docs/claude-code/mcp).

Project `.mcp.json`:

```json
{
  "mcpServers": {
    "chrome-bridge": {
      "command": "node",
      "args": ["/absolute/path/to/codex-chrome-bridge/mcp/chrome-bridge-mcp.mjs"]
    }
  }
}
```

CLI install alternative:

```bash
claude mcp add-json chrome-bridge '{"command":"node","args":["/absolute/path/to/codex-chrome-bridge/mcp/chrome-bridge-mcp.mjs"]}'
```

## Cursor

Cursor uses MCP servers from project `.cursor/mcp.json` or global `~/.cursor/mcp.json`. Source: [Cursor MCP docs](https://cursor.com/docs/mcp).

Recommended compact config:

```json
{
  "mcpServers": {
    "chrome-bridge": {
      "command": "node",
      "args": ["/absolute/path/to/codex-chrome-bridge/mcp/chrome-bridge-mcp.mjs"],
      "env": {
        "CHROME_BRIDGE_MCP_TOOL_PROFILE": "core"
      }
    }
  }
}
```

## Codex

Codex uses TOML MCP server entries.

```toml
[mcp_servers.chrome-bridge]
command = "node"
args = ["/absolute/path/to/codex-chrome-bridge/mcp/chrome-bridge-mcp.mjs"]
startup_timeout_sec = 20
tool_timeout_sec = 60
```

## VS Code

VS Code stores MCP configuration in `.vscode/mcp.json` or a user profile `mcp.json`; stdio servers use a top-level `servers` object. Source: [VS Code MCP configuration reference](https://code.visualstudio.com/docs/agents/reference/mcp-configuration).

```json
{
  "servers": {
    "chromeBridge": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/codex-chrome-bridge/mcp/chrome-bridge-mcp.mjs"]
    }
  }
}
```

## Windsurf / Cascade

Windsurf/Cascade can add MCP plugins through Settings and raw MCP config at `~/.codeium/windsurf/mcp_config.json`; the official docs also note a total active tool limit, so the compact profile is the safer default. Source: [Cascade MCP integration docs](https://docs.devin.ai/desktop/cascade/mcp).

Recommended compact config:

```json
{
  "mcpServers": {
    "chrome-bridge": {
      "command": "node",
      "args": ["/absolute/path/to/codex-chrome-bridge/mcp/chrome-bridge-mcp.mjs"],
      "env": {
        "CHROME_BRIDGE_MCP_TOOL_PROFILE": "core"
      }
    }
  }
}
```

## Hermes Agent

Hermes Agent supports local stdio and remote HTTP MCP servers in `~/.hermes/config.yaml`, with MCP entries under `mcp_servers`. Source: [Hermes Agent MCP docs](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp).

```yaml
mcp_servers:
  chrome_bridge:
    command: "node"
    args: ["/absolute/path/to/codex-chrome-bridge/mcp/chrome-bridge-mcp.mjs"]
```

## Generic Stdio MCP Clients

Use this command/args pair anywhere a client asks for a local stdio MCP server:

```json
{
  "command": "node",
  "args": ["/absolute/path/to/codex-chrome-bridge/mcp/chrome-bridge-mcp.mjs"]
}
```

## Troubleshooting

- If no tools appear, run the exact `command` plus `args` in a terminal and fix any Node.js/path errors first.
- If the client warns about too many tools, set `CHROME_BRIDGE_MCP_TOOL_PROFILE=core`.
- If browser tools fail but local tools work, run `chrome-bridge health` and confirm the extension is connected.
- If a live smoke run is skipped, follow the returned `nextCommand` / `nextAction` recovery hints.
