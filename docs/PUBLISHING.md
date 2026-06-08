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
npm run check:roadmap
npm run check:cli-local-tools
npm run check:mcp-runtime-smoke
npm run check:mcp-local-tools
npm run check:tab-group-persistence
npm run check:privacy
npm run check:audit
npm run check:pack
npm run runtime-smoke:plan
npm run server
node ./bin/chrome-bridge.mjs reload-extension --confirm
node ./bin/chrome-bridge.mjs doctor --live-checks
node ./bin/chrome-bridge.mjs runtime-smoke
```

Run the live `reload-extension --confirm`, `doctor --live-checks`, and `runtime-smoke` checks only when no other Codex session is actively using the bridge.

`npm run runtime-smoke:plan` wraps `runtime-smoke --coverage-plan`. It is offline and can be run while another session is using the bridge. It prints the required coverage checklist without calling `/health`, opening Chrome tabs, or reloading the extension, and its `verification.finalCommands` plus `verification.finalMcpCalls` fields record the live CLI/MCP sequence: `reload-extension --confirm`, `doctor --live-checks`, then `runtime-smoke`.

The plan output reports `verification.status: "not-run"` and `verification.liveVerificationRequired: true`; final verification is complete only after the normal live `runtime-smoke` reports top-level `ok: true`, `coverage.ok: true`, current bridge/extension versions, and `verification.status: "passed"`.

`runtime-smoke` opens temporary local fixture tabs and covers existing-tab adoption, scoped reads, strict workspace policy, session-summary recommendations, debug-bundle default redaction/omission behavior, querySelector/nth-of-type selector fallback, screenshots, PDF export, dialog handling, file input upload, interactions, tracing, browser-data safety gates, cleanup, and tab cleanup mitigation metadata. Its JSON output includes a counted `coverage` summary, and top-level `ok` is true only when every required coverage item passed.

`check:pack` parses `npm pack --dry-run --json` and fails if the publish tarball omits required runtime, extension, shared registry, generated docs, or verification files. It also runs a packaged registry check in a simulated package layout so repo-only metadata like `.github/` and `codex/` can remain excluded without breaking installed/package verification scripts.

`check:runtime-smoke-plan` runs the offline smoke plan against a dead bridge URL, verifies stale bridge-server and stale-extension skip metadata, structured JSON output, and nonzero CLI-exit preservation against fake `/health` servers, and fails if `--coverage-plan` starts contacting the live bridge.

`check:roadmap` verifies the merged Phase 0-4 roadmap against registry metadata, source boundaries, docs, and the offline runtime-smoke coverage plan without touching Chrome.

`check:cli-local-tools` exercises CLI setup diagnostics and command-catalog output against a dead bridge URL, proving those local commands stay offline by default. It also runs `doctor --live-checks` against a fake `/health` server and fake `osascript` binary to prove live doctor reports current bridge-server version metadata without touching Chrome, verifies `session-summary` stale-bridge recommendations against a fake bridge, and verifies CLI group scope payload forwarding for scoped group commands against a fake `/command` bridge.

`check:mcp-runtime-smoke` starts the MCP server over stdio against fake bridge URLs, calls `chrome_bridge_runtime_smoke`, and verifies coverage-plan plus stale-extension/stale-bridge metadata, structured JSON output, and CLI-exit preservation stay intact for MCP clients without touching Chrome.

`check:mcp-local-tools` starts the MCP server over stdio, calls local diagnostic tools such as `chrome_bridge_doctor`, and verifies they remain offline by default. It also mirrors the fake live doctor bridge-version and fake stale-bridge session-summary checks through MCP, and verifies MCP group scope payload forwarding for scoped group tools against a fake `/command` bridge so CLI and MCP upgrade diagnostics stay in parity without touching Chrome.

`check:tab-group-persistence` runs the extension tab-group persistence and cleanup modules against fake Chrome APIs, proving managed group listeners, listener event callbacks for future managed groups, saved-group disablement, removal metadata, fake saved closed group chips prevention, and stale membership cleanup without touching Chrome.

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
