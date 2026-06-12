# Competitive Analysis And Roadmap

Last updated: 2026-06-12

This document captures the current competitive landscape for Codex Chrome Bridge, the product gaps that matter, and the phased implementation plan we can execute inside this repository.

## Scope

The comparison focuses on products and projects that are close to Codex Chrome Bridge's actual use case:

- real-browser automation for AI agents
- MCP or agent-facing browser tooling
- existing logged-in browser sessions
- local-first or extension-assisted control surfaces

## Fresh Scan: 2026-06-11

Primary sources reviewed:

- [Playwright MCP](https://github.com/microsoft/playwright-mcp)
- [Chrome DevTools for agents](https://developer.chrome.com/docs/devtools/agents)
- [Browserbase MCP](https://docs.browserbase.com/integrations/mcp/introduction)
- [BrowserMCP](https://github.com/browsermcp/mcp)
- [Browser Use MCP](https://docs.browser-use.com/open-source/customize/integrations/mcp-server)
- [Browserless MCP](https://docs.browserless.io/mcp/overview)
- [Hyperbrowser MCP](https://www.hyperbrowser.ai/docs/integrations/model-context-protocol)
- [Firecrawl Build with AI](https://docs.firecrawl.dev/ai-onboarding)
- [Anchor Browser MCP](https://docs.anchorbrowser.io/advanced/mcp)
- [Apify for AI agents](https://docs.apify.com/platform/integrations/agent-onboarding)

Fresh findings:

- Playwright now explicitly positions CLI plus skills as a token-efficient complement to MCP, while MCP remains useful for persistent rich introspection. This validates Chrome Bridge's cheap-first CLI/skill workflow and artifact-backed reads.
- Chrome DevTools for agents is moving the category toward live debugging, responsive/geolocation emulation, and Lighthouse-backed proactive QA. Chrome Bridge already has local trace/debug-bundle foundations, but Lighthouse/performance summaries are the clearest remaining diagnostics gap.
- Browserbase, Browser Use, Browserless, Hyperbrowser, Anchor, Firecrawl, and Apify all emphasize hosted session lifecycle, structured extraction, crawling/scraping, file download/export, proxies, CAPTCHA handling, recordings, live view, or managed infrastructure. These are mostly cloud-browser strengths rather than local-real-profile strengths.
- BrowserMCP remains the closest local extension competitor because it targets the user's existing logged-in profile. Chrome Bridge's differentiator should stay stricter scoping, explicit confirmations, token hygiene, local artifacts, and repository-grade verification.

Audit outcomes from this scan:

- Fixed CPA offer extraction so "No moderation required" is not misclassified as `moderationRequired: true`.
- Fixed MCP read-output parity so `artifactDir` is honored by metadata-first read tools, matching CLI behavior.

Implications:

- Do not pivot into hosted cloud browser infrastructure, proxy management, CAPTCHA solving, or large-scale crawling inside this project.
- Prefer local diagnostics that help coding agents verify real user pages safely: bounded console/network/performance summaries, optional Lighthouse handoff, and redacted artifacts.
- Continue adding structured extraction presets only when stdout stays metadata-first and raw content remains in local artifacts.

## Competitor Summary

### Playwright MCP / Playwright CLI

Strengths:

- Mature browser automation surface.
- Browser extension mode for reusing existing tabs, sessions, cookies, and installed extensions.
- Accessibility-snapshot workflow with stable element refs.
- Strong session ergonomics: sessions, persistent profiles, monitoring dashboard, tracing, uploads, dialogs, and code execution.

Takeaway for Chrome Bridge:

- We do not need to copy Playwright's whole testing surface.
- We should close the gap on existing-tab adoption, observability, and agent-friendly discovery flows.

### Browser Use

Strengths:

- Persistent daemon and fast CLI loop.
- Real Chrome/profile connection plus CDP attachment options.
- State-oriented element inspection.
- Higher-level extraction and agent tooling.
- Strong production story around scaling, sessions, and managed infrastructure.

Takeaway for Chrome Bridge:

- Our local-first safety posture is a differentiator.
- We should improve agent ergonomics with better "observe/extract/find" primitives rather than only low-level commands.

### BrowserMCP

Strengths:

- Clear message: connect the current browser tab and automate what the user already has open.
- Simple onboarding around extension-driven connection.
- Local/private/logged-in positioning that overlaps heavily with our value proposition.

Takeaway for Chrome Bridge:

- Current-tab adoption is table stakes in this category.
- Chrome Bridge should make "use the tab I already opened" a first-class path, not a workaround.

### Stagehand

Strengths:

- High-level primitives: `act`, `extract`, `observe`, `agent`.
- Strong positioning around resilience to page changes.
- Structured extraction and action planning.

Takeaway for Chrome Bridge:

- The biggest product gap is not "more raw browser power".
- The biggest product gap is a safer, higher-level agent interface on top of the raw browser power we already have.

### AlienMcp

Strengths:

- Tab-group scoping.
- Trusted input via CDP.
- Real-browser local-first story.
- Broad convenience surface including PDF export and current-toolkit framing.

Takeaway for Chrome Bridge:

- Their feature list validates demand for scoped tabs, trusted input, PDF export, and local-only posture.
- We should keep our stronger safety model while matching the most useful convenience features.

## Current Positioning: What Chrome Bridge Already Does Well

Chrome Bridge is already strong in these areas:

- real Chrome profile access
- local-only bridge on `127.0.0.1`
- explicit tab-group scoping
- confirmation gates for mutations and sensitive reads
- human-in-the-loop prompt workflow
- screenshots, snapshots, browser-data reads, and safe runtime smoke verification

This means we should not pivot the product. We should deepen the same strategy.

## Key Gaps

### Gap 1: Existing-tab workflow is weaker than the market

Competitors let the user connect the tab they already opened. Chrome Bridge mostly assumes the agent opens or owns the working tab. That is friction for real dashboard work.

### Gap 2: High-level agent ergonomics are still thin

We have good low-level primitives, but not enough structured "discover what is actionable", "find likely targets", or "extract structured content" layers.

### Gap 3: Observability is useful but not yet productized

We have screenshots and trace, but not a first-class debug bundle, replayable artifact set, or session overview workflow.

### Gap 4: Convenience read surfaces are missing

PDF export is a common operator need. A few adjacent convenience tools are still absent.

### Gap 5: Safety posture needed hardening

Because the product works against a real logged-in browser, the undocumented or drift-prone surfaces matter more here than in a disposable headless browser.

## Unified Three-Plan Roadmap

This roadmap combines:

- Plan A: the original competitive roadmap in this document
- Plan B: product and competitor review focused on `observe`, extraction, debug bundles, and workflow primitives
- Plan C: architecture and security review focused on trust boundaries, command contracts, MV3 lifecycle, and CLI/MCP parity

The merged strategy is:

1. Keep the local-first, real-profile, human-approved positioning.
2. Harden the bridge boundary before adding more powerful agent affordances.
3. Build high-level read-only agent ergonomics next, especially `observe` and structured discovery.
4. Add debug bundles and workflow primitives only through the same command contract and privacy model.

## Roadmap

### Phase 0: Safety And Contract Hardening

Goal:

- make the public surface honest, explicit, and fail-closed

Tasks:

- reject unsupported bridge actions at the server boundary
- fail closed on missing or mismatched extension/server version
- remove undocumented arbitrary page-code execution paths
- align trace behavior with privacy docs
- disable the unused HTTP long-poll extension ingress by default
- add server-side payload validation for direct `/command` callers
- reject unsafe URL schemes before extension dispatch
- preserve extension error codes/details for CLI/MCP diagnostics
- preserve loopback-only binding as the default security invariant

Success criteria:

- no hidden command paths
- no silent version drift
- docs match real runtime behavior
- direct HTTP clients cannot bypass CLI/MCP validation with malformed payloads
- the extension uses WebSocket ingress unless fallback mode is explicitly enabled

### Phase 1: Existing-Tab And Agent Discovery

Goal:

- reduce friction for real human browser workflows and agent page understanding

Tasks:

- adopt an already-open browser tab into the `Codex Bridge` group
- export selected tabs to PDF
- add a first-class read-only `observe` surface with ranked actionable elements
- add follow-up `find-elements` filters for text, role, placeholder, href, and near-text matching
- improve docs/examples around existing-tab workflows

Success criteria:

- user can bring a real working tab under scope in one command
- user can save a dashboard/report page to PDF locally
- agents can discover likely targets without hand-writing CSS first
- observe output is bounded, stable, and explicitly read-only

### Phase 2: Structured Extraction And Debug Artifacts

Goal:

- make browser state easier to extract, inspect, and debug

Tasks:

- add higher-level extraction helpers for structured page regions
- add schema-lite extraction for tables, forms, lists, and key-value blocks
- export a debug bundle with health, tab metadata, snapshot, screenshot, trace metadata, and redacted artifacts
- add a session summary command

Success criteria:

- extract returns JSON, not prose
- debug bundles are useful for bug reports without leaking private values by default
- extension/server mismatch, scope state, and policy state are visible in summaries

### Phase 3: Broader Interaction Coverage

Goal:

- cover the most common real-browser workflows without becoming unsafe-by-default

Tasks:

- file upload support
- dialog accept/dismiss support
- safer form helpers
- optional dropdown discovery helpers
- per-tab debugger action serialization for trace, trusted input, screenshots, and PDF export

Success criteria:

- common dashboard/admin flows can complete without custom hacks
- debugger-backed actions do not step on each other

### Phase 4: Contract Refactor And Workspace Policy

Goal:

- keep the growing surface maintainable and policy-aware

Tasks:

- introduce a single command registry for action names, schemas, risk tiers, timeouts, CLI aliases, MCP tool names, and docs text
- derive server allowlist, self-test expectations, and docs checks from that registry
- split the large extension service worker into focused modules when the registry boundary is ready
- add named workspaces and explicit policy modes only after the single-workspace flow is solid

Success criteria:

- adding a command does not require hand-editing four independent lists
- CLI and MCP stay in parity as the surface grows
- policy state is explicit rather than implied

## Execution Status

This repository iteration implements the merged Phase 0-4 roadmap:

- Phase 0 hardening:
  - reject unsupported bridge actions
  - reject stale or not-yet-reported extension versions for normal commands
  - remove hidden page-eval path
  - stop trace response-body capture
  - disable long-poll extension ingress by default
  - add server-side JSON, payload, required-field, nested form/header/prompt shape, enum, numeric bounds, upload path array, confirmation/sensitive-confirmation gates, timeout, unsafe URL-scheme validation, extension error code/detail propagation, and loopback-only bind guard
- Phase 1 usability:
  - add existing-tab adoption
  - add PDF export
  - add read-only `observe` MVP
  - add filtered `find-elements`, including nearby-text matching
- Phase 2 observability:
  - add structured `extract`
  - add artifact-backed structured extraction presets for `article`, `product-page`, and `pricing-table` alongside the existing `cpa-offer` workflow
  - add read-only download/offline-export discovery that reports candidate links/actions without clicking or fetching them
  - add local Lighthouse JSON ingestion that exposes category scores, failing-audit summaries, and artifact paths without dumping raw audit payloads
  - add a fixture-backed examples gallery for `article`, `product-page`, `pricing-table`, `download-discovery`, and `lighthouse-ingest`, plus checker coverage for JSON-LD article/product data, pricing cards, download type inference, and Lighthouse summaries
  - add safe `session-summary` and redacted-by-default `debug-bundle`
  - include workspace policy state and strict-policy recommendations in summaries
  - omit page artifacts and full trace events from debug bundles unless explicitly requested, while keeping trace summaries available by default
- Phase 3 workflow primitives:
  - add select option discovery
  - add dry-run-first form filling
  - add confirmed dialog handling and file input upload
  - add per-tab serialization for debugger-backed actions
- Phase 4 maintainability and policy:
  - add a shared Node-side command registry for version metadata, action schemas, risk tiers, default timeouts, CLI command names, MCP tool names, manifest expectations, and self-test parity
  - derive server, CLI, and MCP default command timeouts from the shared registry
  - derive CLI `--help` usage signatures from the shared registry
  - derive CLI reference usage groups from the shared registry
  - derive the CLI reference metadata table from the shared registry
  - derive the MCP reference tool table from the shared registry
  - derive CLI and MCP safety notes from the shared registry, including confirmation, sensitive-confirmation, conditional inventory confirmation, and live bridge interruption guidance
  - expose the shared command catalog through CLI and MCP for agents that need local risk, timeout, direct payload-key, local diagnostic/tooling command, live-bridge, and confirmation metadata
  - generate `docs/COMMAND-CATALOG.md` from that registry, including CLI usage signatures, and fail self-test on catalog drift
  - add docs coverage checks so CLI exact usage signatures and MCP generated tool metadata cannot silently omit registry-defined commands/tools
  - add dedicated registry and bridge contract checkers for schema uniqueness, package/manifest/registry parity, complete CLI/MCP catalog coverage, payload validation samples, generated catalog drift, local bridge boundary behavior, malformed JSON/oversized-body/timeout handling, shutdown cleanup, and extension error code/detail propagation
  - add static registry checks for debugger-backed action serialization
  - derive the server allowlist and direct `/command` payload validation from that registry
  - add explicit local workspace policy commands while preserving scoped, explicit-only outside-tab access
  - add `strict` workspace policy mode to block outside tabs even when external-tab override is passed
  - split the extension service worker into focused modules for debugger sessions, trace action wrappers, error classification, human prompt lifecycle, keyboard event mapping, navigation/workspace actions, offscreen lifecycle, page artifact capture, injected page execution, page interaction actions, page inspection/read actions, injected page scripts, private browser-data actions, runtime actions, safety gates, tab cleanup, tab/group response serialization, tab-load polling, workspace policy normalization, and workspace tab targeting
  - add feature-detected saved-tab-group disablement so bridge-created groups are marked unsaved when Chrome exposes that API, while retaining ungroup-before-close mitigation on current Chrome and returning `savedClosedGroupChipPrevention` metadata for bridge-driven cleanup
  - remember session-scoped bridge-created group IDs in Chrome session storage so custom session group titles stay covered by managed-group lifecycle guards without persisting browser-session IDs across Chrome restarts
  - add a bounded diagnostics surface with page health, navigation timing, resource counts, trace event counts, artifact-backed full results, and a Lighthouse handoff path without dumping raw trace/event logs by default
  - close the UBS bug-scan follow-up plan with abortable CLI/MCP/extension fetch boundaries, safe metadata stripping, rejection-safe offscreen listeners, prompt DOM hardening, corrupted run-state recovery, and dedicated `check:ubs-fixes` coverage

## Next Recommended Slice

The previous recommended slice has now landed:

1. Schema-backed structured extraction presets beyond `cpa-offer` now preserve metadata-first stdout and local artifact storage.
2. Download/offline-export discovery is available as a read-only candidate detector before any heavier crawler-style work.
3. Lighthouse result ingestion is local-only and keeps raw reports out of stdout by default.
4. A small examples gallery now gives agents fixture-backed command choices without rediscovering usage.
5. Remaining UBS noise stays evidence-gated: only findings that map to reachable runtime behavior should become code changes.

After this change set, the highest-value next implementation is:

1. Exercise the examples against representative real pages and add fixture-backed schema tuning only where repeatable gaps appear.
2. Consider one more high-value preset only after real usage shows a stable schema need.
3. Keep UBS triage evidence-first; do not broad-clean pattern noise unless it becomes a confirmed runtime path.

That sequence keeps the product close to its strongest differentiator: safe local control of the user's real Chrome profile with small, agent-friendly outputs.

## Runtime Verification When The Live Bridge Is Busy

The implementation can be statically verified while another session is using the live bridge. When the live bridge is available again, use this sequence as the real-browser verification runbook:

1. Run `npm run runtime-smoke:plan` if you need the offline checklist while another session is using the bridge; this reports `verification.status: "not-run"` until the live smoke pass runs and includes top-level `nextCommand` / `nextAction`, nested `verification.nextCommand`, `verification.nextAction`, `verification.finalCommands`, and `verification.finalMcpCalls` for the recovery and live sequence.
2. Run `chrome-bridge reload-extension --confirm` after confirming no other session is using the bridge.
3. Run `chrome-bridge doctor --live-checks`.
4. Run `chrome-bridge runtime-smoke`.
5. Confirm the smoke output reports `ok: true`, `coverage.ok: true`, current bridge/extension versions, and `verification.status: "passed"` for existing-tab adoption, scoped tabs, `setWorkspace` strict policy, `session-summary`, default `debug-bundle`, `observe`, querySelector/nth-of-type selector fallback, `find-elements` including nearby text, `extract`, screenshots, `pdf`, dialog handling, file input upload, interactions, tracing, successful browser-data reads, browser-data safety gates, strict outside-tab blocking, and cleanup metadata including `savedClosedGroupChipPrevention`.
6. If a live smoke output is skipped or failed, use top-level `nextCommand` / `nextAction` for the immediate recovery step; nested `verification.nextCommand` / `verification.nextAction` carries the same context, and `verification.finalCommands` / `verification.finalMcpCalls` provides the full CLI/MCP sequence.
7. If a release needs human UX assurance, manually spot-check one scoped tab workflow after the automated smoke pass.
