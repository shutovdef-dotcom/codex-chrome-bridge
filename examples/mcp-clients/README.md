# MCP Client Config Examples

These templates are checked-in install surfaces for the most common local MCP clients.

Before using any of them:

1. Replace `/absolute/path/to/codex-chrome-bridge` with your local repository path.
2. Keep `core` for Cursor and Windsurf first.
3. Keep `read` for generic stdio hosts that mostly inspect pages or export artifacts.
4. Switch any template to `full` only when that client really needs private browser-data tools or broader mutation coverage.

For generated inline snippets and setup advice, also run:

```bash
node ./bin/chrome-bridge.mjs mcp-config
node ./bin/chrome-bridge.mjs advise --task "configure MCP client"
```
