# MCP Reference

Start the MCP server:

```bash
node ./mcp/chrome-bridge-mcp.mjs
```

Codex config example:

```toml
[mcp_servers.chrome-bridge]
command = "node"
args = ["/absolute/path/to/codex-chrome-bridge/mcp/chrome-bridge-mcp.mjs"]
startup_timeout_sec = 20
tool_timeout_sec = 60
```

## Tools

- `chrome_bridge_health`
- `chrome_bridge_reload_extension`
- `chrome_bridge_self_test`
- `chrome_bridge_runtime_smoke`
- `chrome_bridge_windows`
- `chrome_bridge_tabs`
- `chrome_bridge_group`
- `chrome_bridge_ensure_tab`
- `chrome_bridge_open`
- `chrome_bridge_activate_tab`
- `chrome_bridge_close_tab`
- `chrome_bridge_close_group`
- `chrome_bridge_back`
- `chrome_bridge_forward`
- `chrome_bridge_reload_tab`
- `chrome_bridge_wait_for_selector`
- `chrome_bridge_snapshot`
- `chrome_bridge_text`
- `chrome_bridge_html`
- `chrome_bridge_screenshot`
- `chrome_bridge_click_at`
- `chrome_bridge_hover`
- `chrome_bridge_click`
- `chrome_bridge_type`
- `chrome_bridge_press`
- `chrome_bridge_select`
- `chrome_bridge_scroll`
- `chrome_bridge_trace_start`
- `chrome_bridge_trace_events`
- `chrome_bridge_trace_stop`
- `chrome_bridge_history_search`
- `chrome_bridge_bookmarks_search`
- `chrome_bridge_cookies_list`
- `chrome_bridge_storage_snapshot`
- `chrome_bridge_request`
- `chrome_bridge_ask_user`

## Confirmation Arguments

The MCP tools use boolean confirmation arguments:

- `confirmed: true` for mutating or sensitive operations.
- `confirmSensitive: true` for high-risk private values.

Agents should ask the user before setting these flags unless the user has already explicitly authorized the exact action.

## Human-in-the-Loop

Use `chrome_bridge_ask_user` when the agent needs clarification, account selection, confirmation, or coordination for a manual browser step.

It opens a local extension page in the `Codex Bridge` group and returns the user's answer. It does not bypass CAPTCHA or automate protected challenges.

## Recommended Agent Workflow

1. Run `chrome_bridge_health`.
2. Run `chrome_bridge_ensure_tab`.
3. Use `chrome_bridge_open` for the target URL.
4. Prefer `chrome_bridge_snapshot`, `chrome_bridge_text`, and `chrome_bridge_screenshot`.
5. Use `chrome_bridge_ask_user` when browser state requires user judgment.
6. Use interaction or browser-data tools only with explicit confirmation.
