# Agent Token Budget

Last updated: 2026-06-12

This note records the highest-token patterns observed while developing Chrome Bridge and the cheaper defaults agents should use.

## Biggest Token Drains

- Full live `runtime-smoke` output is the largest recurring drain. A passing run can include thousands of JSON lines because every step result is printed.
- Broad repository reads are expensive when they print full files or full generated docs. Prefer `rg` targets, `git diff --stat`, and narrow `sed` ranges.
- Full page reads are expensive when stdout includes raw text, HTML, screenshots, traces, or debug bundles. Prefer metadata-first artifacts.
- Competitive research is useful, but repeated open-ended scans are expensive. Keep source lists short and update the roadmap instead of re-summarizing everything in chat.
- There is no local cost database at `~/.claude-cost-tracker/usage.db` in this environment, so exact dollar attribution is not available from `cost-tracking`.

## Cheap Defaults

Use these commands before requesting high-volume output:

```bash
node ./bin/chrome-bridge.mjs status --token-budget
node ./bin/chrome-bridge.mjs tabs --summary-only
node ./bin/chrome-bridge.mjs grep-page --pattern "error|warning|payout|geo"
node ./bin/chrome-bridge.mjs links --selector main
node ./bin/chrome-bridge.mjs tables --selector main
node ./bin/chrome-bridge.mjs last-artifact
node ./bin/chrome-bridge.mjs read-artifact --path /tmp/page.txt --head 40 --grep "needle"
```

For live verification:

```bash
node ./bin/chrome-bridge.mjs runtime-smoke --summary-only --out /tmp/chrome-bridge-runtime-smoke.json
```

Only read the full JSON artifact when the summary reports a failure or missing coverage.

## Implementation Guardrails

- New commands that can produce large payloads should support `--summary-only` and `--out <file>`.
- MCP wrappers for large local commands should expose matching `summaryOnly` and `out` fields.
- Default stdout should contain counts, paths, hashes, recovery hints, and short snippets, not raw page payloads.
- Full artifacts should stay local and be inspectable through `read-artifact`, `grep-page`, or small `sed`/`jq` slices.
- Verification scripts should assert output-size behavior when adding token-budget features.

## Skill Guidance

The bundled `chrome-bridge` skill should point agents at cheap-first flows by default. Prefer updating that skill over adding a separate skill unless the workflow becomes independent of Chrome Bridge.
