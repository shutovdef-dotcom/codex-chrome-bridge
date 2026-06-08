# Publishing Checklist

Use this checklist before making the repository public.

## Local Checks

```bash
npm ci
npm run docs:commands
npm run check
npm run check:registry
npm run check:docs
npm run check:bridge-contract
npm run check:runtime-smoke-plan
npm run check:privacy
npm run check:audit
npm run check:pack
npm run runtime-smoke:plan
npm run server
node ./bin/chrome-bridge.mjs health
node ./bin/chrome-bridge.mjs runtime-smoke
```

Run the live `health`, `doctor --live-checks`, and `runtime-smoke` checks only when no other Codex session is actively using the bridge.

`npm run runtime-smoke:plan` wraps `runtime-smoke --coverage-plan`. It is offline and can be run while another session is using the bridge. It prints the required coverage checklist without calling `/health`, opening Chrome tabs, or reloading the extension.

The plan output reports `verification.status: "not-run"` and `verification.liveVerificationRequired: true`; final verification is complete only after the normal live `runtime-smoke` reports top-level `ok: true`, `coverage.ok: true`, and `verification.status: "passed"`.

`runtime-smoke` opens temporary local fixture tabs and covers scoped reads, strict workspace policy, session-summary recommendations, debug-bundle default redaction/omission behavior, screenshots, PDF export, interactions, tracing, browser-data safety gates, cleanup, and tab cleanup mitigation metadata. Its JSON output includes a counted `coverage` summary, and top-level `ok` is true only when every required coverage item passed.

`check:pack` parses `npm pack --dry-run --json` and fails if the publish tarball omits required runtime, extension, shared registry, generated docs, or verification files.

`check:runtime-smoke-plan` runs the offline smoke plan against a dead bridge URL and fails if `--coverage-plan` starts contacting the live bridge.

`check:registry` also verifies that the GitHub Check workflow keeps the Node.js 20/22/24 matrix and runs `npm ci`, `npm run check`, `npm run check:audit`, and `npm run check:pack` without adding live `runtime-smoke` to CI.

## Repository Metadata

- Confirm `shutovdef-dotcom` is the intended GitHub owner in `package.json` and README examples.
- Set `author` in `package.json` if desired.
- Confirm the license. The repository currently uses MIT.
- Review `SECURITY.md`.
- Review issue templates.
- Confirm `CODE_OF_CONDUCT.md`, `SUPPORT.md`, and `.github/PULL_REQUEST_TEMPLATE.md` match the maintainer policy.
- Confirm Dependabot and CodeQL workflows are enabled after push.

## Privacy Review

`check:privacy` scans tracked and untracked repository files, excluding ignored dependencies, for local home paths, private-key headers, common provider tokens, and obvious secret assignments.

## GitHub

```bash
git init
git add .
git commit -m "feat: publish codex chrome bridge"
git branch -M main
git remote add origin git@github.com:shutovdef-dotcom/codex-chrome-bridge.git
git push -u origin main
```

Only push after reviewing the final diff.
