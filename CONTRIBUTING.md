# Contributing

Thanks for helping improve Codex Chrome Bridge.

## Development

```bash
npm install
npm run check
npm run check:runtime-smoke-plan
npm run check:mcp-runtime-smoke
npm run check:mcp-local-tools
npm run check:audit
npm run check:pack
```

For runtime verification, start with the offline plan. Run the live smoke only when no other session is using the bridge:

```bash
npm run runtime-smoke:plan
npm run server
node ./bin/chrome-bridge.mjs doctor --open-extensions
node ./bin/chrome-bridge.mjs runtime-smoke
```

The live smoke is complete only when it reports `ok: true`, `coverage.ok: true`, and `verification.status: "passed"`.

## Pull Request Checklist

- Keep the default workflow read-mostly.
- Preserve the `Codex Bridge` tab-group scope.
- Add or update `self-test` checks for new CLI, MCP, or extension actions.
- Run `npm run check`.
- Run `npm run check:runtime-smoke-plan`.
- Run `npm run check:mcp-runtime-smoke`.
- Run `npm run check:mcp-local-tools`.
- Run `npm run check:audit`.
- Run `npm run check:pack`.
- Run `npm run runtime-smoke` when changing browser behavior and no other session is using the bridge; require `ok: true`, `coverage.ok: true`, and `verification.status: "passed"`.
- Update docs for user-visible behavior.

## Safety Rules

- Do not add automatic form submission, account mutation, or credentialed network behavior without explicit confirmation gates.
- Do not log cookie values, storage values, page bodies, headers, or private dashboard content by default.
- Keep local servers bound to loopback addresses unless a security review justifies otherwise.
- Do not implement automatic CAPTCHA bypass. Use human-in-the-loop prompts for manual coordination.
