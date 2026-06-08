# Safety and Privacy

Codex Chrome Bridge can inspect a real Chrome profile. That is powerful and sensitive.

## Default Scope

The bridge scopes browser work to a Chrome tab group named `Codex Bridge` by default.

Users can configure local workspace defaults for the group title/color with `set-workspace` or `chrome_bridge_set_workspace`. This does not grant broader browser access.

When the bridge closes its own tabs through `close-tab`, `close-group`, prompt cleanup, or `runtime-smoke` cleanup, the extension first removes those tabs from their Chrome tab group and then closes them. Chrome's public extension API does not expose saved closed tab-group chip management, so this prevents future bridge cleanup from creating more saved closed groups but cannot delete groups Chrome has already saved.

Whole-browser inventory reads require explicit approval: `tabs --all`, `windows --all`, `chrome_bridge_tabs({ includeAll: true })`, and `chrome_bridge_windows({ includeAll: true })` must include confirmation because they can expose unrelated tab URLs and titles.

Policy modes:

- `scoped`: commands with explicit tab IDs reject outside tabs unless `allowExternal` or `--allow-external` is passed.
- `strict`: outside tabs are blocked even when `allowExternal` or `--allow-external` is passed.

Commands with explicit tab IDs reject outside tabs by default; `allowExternal` is only honored in `scoped` policy mode.

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
