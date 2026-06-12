# Safety and Privacy

Chrome MCP Bridge can inspect a real Chrome profile. That is powerful and sensitive.

## Default Scope

The bridge scopes browser work to a Chrome tab group named `Codex Bridge` by default. CLI and MCP clients automatically switch to a per-session title such as `Codex Bridge - Kurerok Research` when `CHROME_BRIDGE_SESSION_TITLE`, `CODEX_SESSION_TITLE`, `CODEX_THREAD_TITLE`, or `CODEX_THREAD_ID` is present; explicit `groupTitle`/`--group-title` still wins.

Users can configure local workspace defaults for the group title/color with `set-workspace` or `chrome_bridge_set_workspace`. This does not grant broader browser access.

When the extension service worker starts, and whenever the bridge creates, reuses, updates, removes, or observes tab membership changes in its scoped tab group, it checks whether the running Chrome exposes a future `saved` tab-group property. The managed-group guard covers the default `Codex Bridge` title, `Codex Bridge ...` session titles, bridge-created workspace titles remembered in extension-local storage, and bridge-created group IDs remembered only in Chrome session storage. Fresh bridge-created session groups follow the same path immediately after creation, so they are treated as ephemeral for the current Chrome session instead of durable workspace state. Current public Chrome APIs do not expose saved closed tab-group chip management, so this is a no-op today; if Chrome later supports that property, the bridge will mark managed Codex groups `saved: false` on a best-effort basis and forget stale managed tab membership when groups are removed.

When the bridge closes its own tabs through `close-tab`, `close-group`, prompt cleanup, or `runtime-smoke` cleanup, the extension first tries the same best-effort saved-group disablement, then removes those tabs from their Chrome tab group, and only then closes them. Cleanup returns `savedClosedGroupChipPrevention` metadata when this ungroup-before-close path runs. If Chrome cannot ungroup a grouped bridge tab, cleanup fails closed instead of closing the tab and risking a new saved closed group chip. This prevents future bridge cleanup from creating more saved closed groups but cannot delete groups Chrome has already saved.

Whole-browser inventory reads require explicit approval: `tabs --all`, `windows --all`, `chrome_bridge_tabs({ includeAll: true })`, and `chrome_bridge_windows({ includeAll: true })` must include confirmation because they can expose unrelated tab URLs and titles.

Policy modes:

- `scoped`: commands with explicit tab IDs reject outside tabs unless `allowExternal` or `--allow-external` is passed.
- `strict`: outside tabs are blocked even when `allowExternal` or `--allow-external` is passed.

Commands with explicit tab IDs reject outside tabs by default; `allowExternal` is only honored in `scoped` policy mode.

## MCP Tool Profiles

The MCP server exposes the full tool surface by default. IDE clients can set `CHROME_BRIDGE_MCP_TOOL_PROFILE=core` or `CHROME_BRIDGE_MCP_TOOL_PROFILE=read` to reduce tool-list size and keep sensitive private-browser tools out of the active client surface by default.

Profiles do not weaken confirmation gates. When private or mutating tools are exposed, they still require the same `confirmed` and `confirmSensitive` arguments described below.

## Confirmation Gates

Commands that can mutate state or expose private data require confirmation.

Examples:

- clicks
- typing
- selecting
- closing tabs
- trace sessions
- extension reloads
- history search
- bookmark search
- cookie listing
- page storage inspection
- extension-context requests

## Sensitive Confirmation

Some operations require a second confirmation:

- cookie values
- whole-cookie-jar listing
- storage values
- credentialed requests

CLI flag:

```bash
--confirm-sensitive
```

MCP argument:

```json
{
  "confirmSensitive": true
}
```

## Agent Rules

Agents using this bridge should:

- Prefer read-only commands first.
- Avoid unrelated user tabs.
- Avoid submitting forms unless explicitly asked.
- Avoid requesting indexing, changing settings, deleting data, uploading files, or sending private data externally unless explicitly asked.
- Use `ask` / `chrome_bridge_ask_user` for manual confirmations and CAPTCHA coordination; do not implement automatic CAPTCHA bypass.
- Redact private dashboard content from bug reports and public logs.
- Keep `debug-bundle` page artifacts and full trace events disabled by default; enable snapshot, observe, screenshot, or full trace artifacts only for local reports where page content and URLs are safe to include.
- Treat page extraction output as potentially private page content; form extraction reports field structure and value state, not current form values.
- Treat form previews as potentially sensitive; `fill-form` reports field value states, not current or planned raw values.
- Use `select-options` for available-option discovery only; it omits the current selected value/option from read-only output.

## Network Boundary

The bridge server binds to `127.0.0.1` by default. Do not expose it on a public interface without adding authentication and doing a security review.

The extension uses the WebSocket transport by default. Extension ingress requires a `chrome-extension://` origin for both WebSocket and the optional HTTP fallback. When an extension reports `extensionId`, the server verifies that it matches the extension origin and keeps optional fallback poll requests pinned to the known extension id. The HTTP long-poll extension fallback is disabled unless `CHROME_BRIDGE_ENABLE_LONG_POLL=1` is explicitly set for compatibility testing.

The server exposes CORS only on extension ingress paths. It rejects unsupported actions, direct `/command` requests that carry browser or extension origins, non-`application/json` JSON POSTs, malformed direct `/command` JSON bodies, unknown top-level command fields, payloads, top-level timeouts, and non-loopback bind attempts unless `CHROME_BRIDGE_UNSAFE_HOST=1` is explicitly set after a security review.

Navigation accepts only `http:`, `https:`, and `about:blank` URLs. Extension-context requests and cookie URL filters accept only `http:` and `https:` URLs. This blocks `javascript:`, `data:`, `file:`, and other non-web schemes from becoming an alternate page-code or local-file access path.
