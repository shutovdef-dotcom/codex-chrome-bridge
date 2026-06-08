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

For risk tiers, default timeouts, confirmation requirements, direct `/command` payload keys, CLI aliases, MCP tool names, local diagnostic/tooling commands, and live-bridge flags, see the generated [command catalog](COMMAND-CATALOG.md) or call `chrome_bridge_command_catalog`.

The tool list below is generated from the shared registry by `npm run docs:commands`.

`chrome_bridge_set_workspace` supports `policyMode: "scoped"` and `policyMode: "strict"`. `strict` blocks outside tabs even when `allowExternal` is passed.

`chrome_bridge_tabs` and `chrome_bridge_windows` stay scoped by default. Passing `includeAll: true` requires `confirmed: true` because it can expose unrelated tab URLs and titles.

Navigation tools accept `http:`, `https:`, and `about:blank` URLs. Extension-context requests and cookie URL filters accept `http:` and `https:` URLs. Unsafe script/data/file-style URL schemes are rejected by the shared command contract before extension dispatch.

<!-- BEGIN GENERATED MCP TOOLS -->
- `chrome_bridge_health`
- `chrome_bridge_reload_extension`
- `chrome_bridge_self_test`
- `chrome_bridge_runtime_smoke`
- `chrome_bridge_windows`
- `chrome_bridge_tabs`
- `chrome_bridge_group`
- `chrome_bridge_workspace`
- `chrome_bridge_set_workspace`
- `chrome_bridge_clear_workspace`
- `chrome_bridge_ensure_tab`
- `chrome_bridge_adopt_tab`
- `chrome_bridge_open`
- `chrome_bridge_activate_tab`
- `chrome_bridge_close_tab`
- `chrome_bridge_close_group`
- `chrome_bridge_back`
- `chrome_bridge_forward`
- `chrome_bridge_reload_tab`
- `chrome_bridge_wait_for_selector`
- `chrome_bridge_observe`
- `chrome_bridge_find_elements`
- `chrome_bridge_extract`
- `chrome_bridge_snapshot`
- `chrome_bridge_text`
- `chrome_bridge_html`
- `chrome_bridge_screenshot`
- `chrome_bridge_pdf`
- `chrome_bridge_click_at`
- `chrome_bridge_hover`
- `chrome_bridge_click`
- `chrome_bridge_type`
- `chrome_bridge_press`
- `chrome_bridge_select`
- `chrome_bridge_select_options`
- `chrome_bridge_fill_form`
- `chrome_bridge_handle_dialog`
- `chrome_bridge_upload_file`
- `chrome_bridge_scroll`
- `chrome_bridge_trace_start`
- `chrome_bridge_trace_summary`
- `chrome_bridge_trace_events`
- `chrome_bridge_trace_stop`
- `chrome_bridge_history_search`
- `chrome_bridge_bookmarks_search`
- `chrome_bridge_cookies_list`
- `chrome_bridge_storage_snapshot`
- `chrome_bridge_request`
- `chrome_bridge_ask_user`
- `chrome_bridge_session_summary`
- `chrome_bridge_debug_bundle`
- `chrome_bridge_command_catalog`
<!-- END GENERATED MCP TOOLS -->

## Confirmation Arguments

The MCP tools use boolean confirmation arguments:

- `confirmed: true` for mutating or sensitive operations.
- `confirmSensitive: true` for high-risk private values.

Agents should ask the user before setting these flags unless the user has already explicitly authorized the exact action.

## Human-in-the-Loop

Use `chrome_bridge_ask_user` when the agent needs clarification, account selection, confirmation, or coordination for a manual browser step.

It opens a local extension page in the `Codex Bridge` group and returns the user's answer. It does not bypass CAPTCHA or automate protected challenges.

`chrome_bridge_session_summary` includes bridge health, scoped group state, workspace policy state, and recommendations. `chrome_bridge_debug_bundle` writes the same policy-aware summary into `session-summary.json`.

`chrome_bridge_debug_bundle` redacts URL/title/text/value fields in its default JSON files and writes `trace-summary.json` rather than full trace events. Set `includeSnapshot`, `includeObserve`, `includeScreenshot`, or `includeTraceEvents` only when the local bundle may safely contain page text, element labels, pixels, URLs, or console/log text from the active browser page.

Use `chrome_bridge_trace_summary` when an agent needs trace state and event counts without retrieving console or network event logs.

`chrome_bridge_extract` returns form structure and field value state, but not current field values.

`chrome_bridge_fill_form` previews changes by default and does not submit the form or return current/planned raw field values.

`chrome_bridge_select_options` lists available options without returning the current selected value or selected option.

## Recommended Agent Workflow

1. Run `chrome_bridge_health`.
2. Run `chrome_bridge_command_catalog` if the agent needs the local risk/timeout/confirmation contract.
3. Run `chrome_bridge_workspace` to inspect the active group/policy defaults.
4. Run `chrome_bridge_ensure_tab`.
5. Use `chrome_bridge_open` for the target URL.
6. Prefer `chrome_bridge_snapshot`, `chrome_bridge_text`, and `chrome_bridge_screenshot`.
7. Use `chrome_bridge_observe` when an agent needs ranked actionable elements before choosing a selector.
8. Use `chrome_bridge_find_elements` and `chrome_bridge_extract` for targeted read-only discovery before interacting.
9. Use `chrome_bridge_ask_user` when browser state requires user judgment.
10. Use interaction or browser-data tools only with explicit confirmation.
