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
- [ ] `npm audit --audit-level=high`
- [ ] `npm pack --dry-run`
- [ ] `node ./bin/chrome-bridge.mjs runtime-smoke` if browser behavior changed

## Notes

