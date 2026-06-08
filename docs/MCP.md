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

The tool reference table below is generated from the shared registry by `npm run docs:commands`.

`chrome_bridge_set_workspace` supports `policyMode: "scoped"` and `policyMode: "strict"`. `strict` blocks outside tabs even when `allowExternal` is passed.

`chrome_bridge_tabs` and `chrome_bridge_windows` stay scoped by default. Passing `includeAll: true` requires `confirmed: true` because it can expose unrelated tab URLs and titles.

`chrome_bridge_runtime_smoke` accepts `coveragePlan: true` to print the required smoke coverage checklist offline. Without `coveragePlan`, it is a live real-browser check and should wait until no other session is using the bridge.

Navigation tools accept `http:`, `https:`, and `about:blank` URLs. Extension-context requests and cookie URL filters accept `http:` and `https:` URLs. Unsafe script/data/file-style URL schemes are rejected by the shared command contract before extension dispatch.

<!-- BEGIN GENERATED MCP TOOLS -->
| Tool | Contract | Risk | Default Timeout | Confirm | Live Bridge | Summary |
| --- | --- | --- | --- | --- | --- | --- |
| `chrome_bridge_health` | `health` | read | 10000 ms | no | yes | Read local bridge health and extension connection status. |
| `chrome_bridge_reload_extension` | `reloadExtension` | system | 5000 ms | yes | yes | Ask the unpacked extension to reload itself after local file edits; requires confirmation. |
| `chrome_bridge_self_test` | `self-test` | read | 10000 ms | no | no | Run static project parity checks without touching Chrome. |
| `chrome_bridge_runtime_smoke` | `runtime-smoke` | interaction | 180000 ms | no | yes | Run the real-browser fixture smoke test against the live bridge. |
| `chrome_bridge_windows` | `windows` | read | 10000 ms | conditional | yes | List Chrome windows, scoped to the configured bridge group by default; includeAll requires confirmation. |
| `chrome_bridge_tabs` | `tabs` | read | 10000 ms | conditional | yes | List Chrome tabs, scoped to the configured bridge group by default; includeAll requires confirmation. |
| `chrome_bridge_group` | `group` | read | 10000 ms | no | yes | Show the current scoped Chrome tab group and its tabs. |
| `chrome_bridge_workspace` | `workspace` | read | 10000 ms | no | yes | Show local workspace defaults, policy mode, and scoped group counts. |
| `chrome_bridge_set_workspace` | `setWorkspace` | system | 10000 ms | yes | yes | Set local workspace group title, color, and scoped/strict policy defaults. |
| `chrome_bridge_clear_workspace` | `clearWorkspace` | system | 10000 ms | yes | yes | Clear local workspace defaults and return to the default group policy. |
| `chrome_bridge_ensure_tab` | `ensureTab` | system | 30000 ms | no | yes | Create or recover the dedicated scoped Chrome work tab. |
| `chrome_bridge_adopt_tab` | `adoptTab` | interaction | 30000 ms | yes | yes | Adopt an already-open Chrome tab into the scoped bridge group. |
| `chrome_bridge_open` | `open` | interaction | 30000 ms | no | yes | Open a URL in the scoped bridge tab or a new grouped tab. |
| `chrome_bridge_activate_tab` | `activateTab` | interaction | 10000 ms | no | yes | Activate a scoped tab and optionally focus its window. |
| `chrome_bridge_close_tab` | `closeTab` | interaction | 10000 ms | yes | yes | Close one scoped tab. |
| `chrome_bridge_close_group` | `closeGroup` | interaction | 10000 ms | yes | yes | Close all tabs in the scoped bridge group. |
| `chrome_bridge_back` | `goBack` | interaction | 30000 ms | no | yes | Navigate the selected tab backward. |
| `chrome_bridge_forward` | `goForward` | interaction | 30000 ms | no | yes | Navigate the selected tab forward. |
| `chrome_bridge_reload_tab` | `reloadTab` | interaction | 30000 ms | no | yes | Reload the selected tab. |
| `chrome_bridge_wait_for_selector` | `waitForSelector` | read | 30000 ms | no | yes | Wait for a selector to appear in the selected tab. |
| `chrome_bridge_observe` | `observe` | read | 30000 ms | no | yes | Read ranked actionable elements without mutating page state. |
| `chrome_bridge_find_elements` | `findElements` | read | 30000 ms | no | yes | Filter ranked actionable elements by role, text, nearby text, href, action, or risk. |
| `chrome_bridge_extract` | `extractPage` | read | 30000 ms | no | yes | Extract structured tables, form structure, lists, and key-value blocks without current form values. |
| `chrome_bridge_snapshot` | `snapshot` | read | 30000 ms | no | yes | Read a bounded structured page snapshot. |
| `chrome_bridge_text` | `text` | read | 30000 ms | no | yes | Read bounded visible page text. |
| `chrome_bridge_html` | `html` | read | 30000 ms | no | yes | Read bounded page HTML for a selector or the whole document. |
| `chrome_bridge_screenshot` | `screenshot` | read | 30000 ms | no | yes | Capture a PNG screenshot of the selected tab, full page, or selector. |
| `chrome_bridge_pdf` | `printPdf` | read | 60000 ms | no | yes | Print the selected tab to a local PDF artifact. |
| `chrome_bridge_click_at` | `clickAt` | interaction | 30000 ms | yes | yes | Click viewport coordinates, optionally through trusted debugger input. |
| `chrome_bridge_hover` | `hover` | interaction | 30000 ms | no | yes | Hover an element or coordinates in the selected tab. |
| `chrome_bridge_click` | `click` | interaction | 30000 ms | yes | yes | Click a selector in the selected tab. |
| `chrome_bridge_type` | `type` | interaction | 30000 ms | yes | yes | Type text into a selector, optionally through trusted debugger input. |
| `chrome_bridge_press` | `press` | interaction | 30000 ms | yes | yes | Press a keyboard key, optionally through trusted debugger input. |
| `chrome_bridge_select` | `select` | interaction | 30000 ms | yes | yes | Select an option in a select element. |
| `chrome_bridge_select_options` | `listSelectOptions` | read | 30000 ms | no | yes | Read available select options without returning current selection state. |
| `chrome_bridge_fill_form` | `fillForm` | interaction | 30000 ms | yes | yes | Preview or apply field values without submitting or returning raw field values. |
| `chrome_bridge_handle_dialog` | `handleDialog` | interaction | 30000 ms | yes | yes | Accept or dismiss the currently open JavaScript dialog. |
| `chrome_bridge_upload_file` | `uploadFile` | interaction | 60000 ms | yes | yes | Set local files on a file input through Chrome Debugger. |
| `chrome_bridge_scroll` | `scroll` | interaction | 10000 ms | no | yes | Scroll the selected tab. |
| `chrome_bridge_trace_start` | `traceStart` | system | 30000 ms | yes | yes | Start bounded console and network metadata tracing. |
| `chrome_bridge_trace_summary` | `traceSummary` | read | 30000 ms | no | yes | Read trace session metadata without returning the trace event log. |
| `chrome_bridge_trace_events` | `traceEvents` | read | 30000 ms | no | yes | Read recent bounded trace events. |
| `chrome_bridge_trace_stop` | `traceStop` | system | 30000 ms | no | yes | Stop tracing and return recent events. |
| `chrome_bridge_history_search` | `historySearch` | private-read | 30000 ms | yes | yes | Search Chrome history with explicit confirmation. |
| `chrome_bridge_bookmarks_search` | `bookmarksSearch` | private-read | 30000 ms | yes | yes | Search Chrome bookmarks with explicit confirmation. |
| `chrome_bridge_cookies_list` | `cookiesList` | private-read | 30000 ms | sensitive | yes | List Chrome cookie metadata; values require sensitive confirmation. |
| `chrome_bridge_storage_snapshot` | `storageSnapshot` | private-read | 30000 ms | sensitive | yes | Read page storage keys; values require sensitive confirmation. |
| `chrome_bridge_request` | `fetchUrl` | private-read | 60000 ms | sensitive | yes | Run a bounded extension-context request; credentials require sensitive confirmation. |
| `chrome_bridge_ask_user` | `askUser` | system | 305000 ms | no | yes | Open a local prompt tab and wait for a user answer. |
| `chrome_bridge_session_summary` | `session-summary` | read | 30000 ms | no | yes | Summarize bridge health, workspace policy, scoped group state, and recommendations. |
| `chrome_bridge_debug_bundle` | `debug-bundle` | read | 60000 ms | no | yes | Write a redacted local debug bundle with page artifacts and full trace events omitted unless requested. |
| `chrome_bridge_command_catalog` | `command-catalog` | read | 5000 ms | no | no | Print this shared command registry as JSON or Markdown. |
<!-- END GENERATED MCP TOOLS -->

## Confirmation Arguments

<!-- BEGIN GENERATED MCP SAFETY NOTES -->
The safety notes below are generated from the shared registry by `npm run docs:commands`.

- `confirmed: true` is required for: `chrome_bridge_reload_extension`, `chrome_bridge_set_workspace`, `chrome_bridge_clear_workspace`, `chrome_bridge_adopt_tab`, `chrome_bridge_close_tab`, `chrome_bridge_close_group`, `chrome_bridge_click_at`, `chrome_bridge_click`, `chrome_bridge_type`, `chrome_bridge_press`, `chrome_bridge_select`, `chrome_bridge_fill_form`, `chrome_bridge_handle_dialog`, `chrome_bridge_upload_file`, `chrome_bridge_trace_start`, `chrome_bridge_history_search`, `chrome_bridge_bookmarks_search`.
- `confirmed: true` is conditionally required for: `chrome_bridge_windows`, `chrome_bridge_tabs`; use it when passing `includeAll: true`.
- `confirmSensitive: true` is required in addition to `confirmed: true` for private-value requests exposed by: `chrome_bridge_cookies_list`, `chrome_bridge_storage_snapshot`, `chrome_bridge_request`.
- Live bridge caution: run `chrome_bridge_runtime_smoke` and `chrome_bridge_reload_extension` only when no other session is using the bridge.
<!-- END GENERATED MCP SAFETY NOTES -->

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
