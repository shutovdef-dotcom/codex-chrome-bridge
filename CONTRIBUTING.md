# Contributing

Thanks for helping improve Codex Chrome Bridge.

## Development

```bash
npm install
npm run check
```

For runtime verification:

```bash
npm run server
node ./bin/chrome-bridge.mjs doctor --open-extensions
node ./bin/chrome-bridge.mjs runtime-smoke
```

## Pull Request Checklist

- Keep the default workflow read-mostly.
- Preserve the `Codex Bridge` tab-group scope.
- Add or update `self-test` checks for new CLI, MCP, or extension actions.
- Run `npm run check`.
- Run `npm run runtime-smoke` when changing browser behavior.
- Update docs for user-visible behavior.

## Safety Rules

- Do not add automatic form submission, account mutation, or credentialed network behavior without explicit confirmation gates.
- Do not log cookie values, storage values, page bodies, headers, or private dashboard content by default.
- Keep local servers bound to loopback addresses unless a security review justifies otherwise.

