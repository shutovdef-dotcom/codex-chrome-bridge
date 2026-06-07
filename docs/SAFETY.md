# Safety and Privacy

Codex Chrome Bridge can inspect a real Chrome profile. That is powerful and sensitive.

## Default Scope

The bridge scopes browser work to a Chrome tab group named `Codex Bridge`.

Commands with explicit tab IDs reject outside tabs unless `allowExternal` or `--allow-external` is passed.

## Confirmation Gates

Commands that can mutate state or expose private data require confirmation.

Examples:

- clicks
- typing
- selecting
- closing tabs
- trace sessions
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
- Redact private dashboard content from bug reports and public logs.

## Network Boundary

The bridge server binds to `127.0.0.1` by default. Do not expose it on a public interface without adding authentication and doing a security review.

