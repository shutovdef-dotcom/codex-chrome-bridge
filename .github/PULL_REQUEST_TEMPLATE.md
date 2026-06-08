## Summary

## What Changed

## Safety Review

- [ ] Default behavior remains read-mostly.
- [ ] Browser work stays scoped to the `Codex Bridge` tab group unless explicitly overridden.
- [ ] Mutating or sensitive behavior requires `confirmed`.
- [ ] Cookie values, storage values, whole-cookie-jar access, and credentialed requests require `confirmSensitive`.
- [ ] No private browser data is logged by default.

## Verification

- [ ] `npm run check`
- [ ] `npm run check:runtime-smoke-plan`
- [ ] `npm run check:roadmap`
- [ ] `npm run check:cli-local-tools`
- [ ] `npm run check:mcp-runtime-smoke`
- [ ] `npm run check:mcp-local-tools`
- [ ] `npm run check:tab-group-persistence`
- [ ] `npm run check:privacy`
- [ ] `npm run check:audit`
- [ ] `npm run check:pack`
- [ ] Live upgrade/smoke, only if browser behavior changed and no other session is using the bridge: `chrome-bridge reload-extension --confirm`, `chrome-bridge doctor --live-checks`, then `npm run runtime-smoke`; use `verification.nextCommand` / `verification.nextAction` for skipped or failed smoke recovery; require `ok: true`, `coverage.ok: true`, and `verification.status: "passed"`

## Notes
