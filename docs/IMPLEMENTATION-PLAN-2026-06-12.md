# Implementation Plan: Local-First Competitive Gap Closure

Last updated: 2026-06-12

This plan turns the latest competitor scan and product decisions into an implementation sequence for Chrome MCP Bridge.

It is intentionally more detailed than the public roadmap. The goal is to keep the project focused on the strongest differentiator: safe local access to the user's real logged-in Chrome profile, while closing the practical gaps users will notice when comparing it with modern MCP browser tools.

## Decisions Already Made

The current planning baseline is:

1. Build the best local real-Chrome MCP bridge, not a hosted browser farm.
2. Prioritize all three near-term tracks:
   - Distribution and client compatibility.
   - MCP agent UX.
   - Browser and DevTools-style capabilities.
3. Expand the high-level `act` / `agent` question before implementing it.
4. Treat cloud and scale as a research-only future track for now.

## Sources Reviewed

Primary current sources used for this plan:

- [Playwright MCP](https://playwright.dev/docs/getting-started-mcp)
- [Chrome DevTools MCP](https://developer.chrome.com/blog/chrome-devtools-mcp)
- [Chrome DevTools MCP GitHub](https://github.com/ChromeDevTools/chrome-devtools-mcp)
- [Browserbase MCP](https://docs.browserbase.com/integrations/mcp/introduction)
- [Browserless MCP](https://docs.browserless.io/mcp/browserless-mcp-server/setup)
- [Stagehand](https://docs.stagehand.dev/v3/basics/act)
- [BrowserMCP Chrome Web Store listing](https://chromewebstore.google.com/detail/browser-mcp-automate-your/bjfgambnhccakkhmkepdoekmckoijdlc)
- [Hyperbrowser](https://hyperbrowser.ai/docs/introduction)
- [Anchor Browser MCP](https://docs.anchorbrowser.io/advanced/mcp)
- [Windsurf/Cascade MCP docs](https://docs.devin.ai/desktop/cascade/mcp)
- [Hermes Agent MCP docs](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp)

## Competitive Baseline

### Playwright MCP

Playwright MCP sets the standard for deterministic browser control, structured accessibility snapshots, broad client compatibility, and tool lists that are easy for agents to understand.

Chrome MCP Bridge does not need to copy Playwright's test-runner surface. The gap to close is agent ergonomics: better prompts, resources, tool guidance, and compact profiles that make the right local bridge command obvious.

### Chrome DevTools MCP

Chrome DevTools MCP sets the expectation that browser MCP tools can help coding agents diagnose real page behavior, especially performance traces and debugging evidence.

Chrome MCP Bridge already has local diagnostics, trace metadata, and Lighthouse report ingestion. The gap to close is deeper DevTools-style workflows: run or guide Lighthouse, produce redacted HAR-like artifacts, and summarize trace evidence in a way agents can act on without dumping huge logs.

### Browserbase, Browserless, Hyperbrowser, Anchor

Hosted browser platforms set expectations around managed sessions, structured extraction, file download/export, crawling, proxies, CAPTCHA/stealth, recordings, and browser infrastructure that scales.

Chrome MCP Bridge should not compete as a cloud browser platform. The useful gaps to close locally are download/export workflows, safe diagnostics, structured extraction presets, and crisp documentation explaining when a local real-profile bridge is the right tool.

### Stagehand

Stagehand's core product idea is the strongest high-level UX benchmark: `observe` plans actions, `act` executes a chosen action, `extract` returns structured data, and `agent` handles broader autonomy.

Chrome MCP Bridge already has `observe`, `find-elements`, and `extract`. The next safe step is not a black-box autonomous agent. It is an `act-preview` layer that proposes deterministic bridge actions, selectors, risk flags, and confirmation requirements before anything mutates the page.

### BrowserMCP And Extension-Based Local Bridges

BrowserMCP validates the local extension plus MCP pattern. Its Chrome Web Store listing makes distribution easier for non-developers and clearly positions existing Chrome profile automation.

Chrome MCP Bridge's differentiator should be stricter safety, scoped tab groups, session-scoped group names, metadata-first outputs, local artifacts, and repository-grade verification. The gap is distribution polish: extension packaging, install paths, compatibility docs, and maybe a Chrome Web Store submission.

## Product North Star

Chrome MCP Bridge should become the default local browser MCP for agents that need:

- the user's real logged-in Chrome profile
- local-only loopback control
- scoped tab-group ownership
- explicit confirmation before mutation or private-data reads
- cheap metadata-first outputs
- local artifacts for large or sensitive data
- predictable CLI/MCP parity
- setup snippets for every major MCP-capable coding client

## Non-Goals

Do not implement these in the default product:

- hosted browser farms
- proxy pools
- stealth automation
- CAPTCHA bypass
- unattended mutation of private accounts
- credential extraction
- scraping private content without user permission
- remote browser takeover
- large-scale crawling as a primary workflow

These can be documented as "use another tool" categories or future adapter research, but they should not become core features unless the product direction changes.

## Track A: Distribution And Client Adoption

### A1. Alias Package And Naming Migration

Current state:

- Public docs now lead with Chrome MCP Bridge.
- Package and repository remain `codex-chrome-bridge`.
- Binary names remain `chrome-bridge` and `chrome-bridge-mcp`.

Gap:

- Search intent is moving toward "chrome mcp bridge", "browser mcp", "chrome mcp server", and client-neutral MCP language.
- A package named `chrome-mcp-bridge` would match product positioning better, but it creates release and ownership risk.

Implementation plan:

1. Check npm name availability for `chrome-mcp-bridge`.
2. If available, create a thin alias package that depends on or re-exports the existing package rather than breaking the existing name immediately.
3. Keep `codex-chrome-bridge` maintained and documented for at least one minor release.
4. Add migration docs explaining that the CLI binary remains `chrome-bridge`.
5. Only consider repository rename after npm alias adoption is stable.

Acceptance criteria:

- Existing install paths keep working.
- New users can find the project through Chrome MCP keywords.
- README, `llms.txt`, package keywords, compatibility docs, and distribution docs all explain the naming boundary.

Suggested verification:

- `npm run check`
- `npm run check:pack`
- `npm run check:audit`
- Manual dry-run of package metadata before publishing.

### A2. One-Click And Copy-Paste Client Setup

Current state:

- `chrome-bridge mcp-config` and `chrome_bridge_mcp_config` generate snippets for Claude Code, Cursor, Codex, VS Code, Windsurf/Cascade, Hermes, and generic stdio clients.

Gap:

- Competitors increasingly provide one-click buttons, marketplace pages, or copy-paste snippets tuned per client.

Implementation plan:

1. Add a `docs/INSTALL.md` or expand `docs/COMPATIBILITY.md` with client-specific "fast path" sections.
2. Add README install cards for top clients:
   - Claude Code
   - Cursor
   - Codex
   - VS Code
   - Windsurf/Cascade
   - Hermes
3. Where a client has a stable one-click install URL format, add a button.
4. Where a client has no stable one-click format, keep copy-paste setup only.
5. Add generated examples that use an absolute local path placeholder and explain how to replace it.
6. Add a checker that verifies every client in `mcp-config` is also documented.

Acceptance criteria:

- A new user can get from README to a working MCP config in under five minutes.
- Cursor/Windsurf use compact profiles by default.
- Client setup docs do not imply cloud hosting or remote browser access.

Suggested verification:

- `npm run check:cli-local-tools`
- `npm run check:mcp-local-tools`
- New `npm run check:client-docs`
- Manual copy-paste of at least one generated snippet.

### A3. Chrome Extension Distribution

Current state:

- Users load the unpacked extension from `extension/`.

Gap:

- BrowserMCP has a Chrome Web Store listing, which reduces installation friction.
- Chrome MCP Bridge's unpacked install is acceptable for developers but not great for wider distribution.

Implementation plan:

1. Add `npm run extension:zip` to package only the MV3 extension files.
2. Add a release checklist for extension version bump, zip creation, and manual smoke.
3. Add a privacy-policy page describing local loopback behavior, permissions, and data handling.
4. Decide whether to submit to Chrome Web Store.
5. If submitting, keep the extension as a bridge client only; do not add analytics or remote telemetry.

Acceptance criteria:

- Extension package is reproducible.
- Store submission materials exist before any submission.
- Privacy claims match real permissions and behavior.

Suggested verification:

- New `npm run check:extension-package`
- `npm run check`
- Live `chrome-bridge reload-extension --confirm`
- Live `chrome-bridge doctor --live-checks`
- Live `chrome-bridge runtime-smoke --summary-only --out /tmp/chrome-bridge-runtime-smoke.json`

### A4. MCP Registry And Directory Readiness

Current state:

- Docs and package metadata are strong, but there is no dedicated registry submission checklist.

Gap:

- MCP users discover tools through registries, directories, marketplaces, client docs, and generated AI metadata.

Implementation plan:

1. Add a `docs/REGISTRY-SUBMISSIONS.md` checklist.
2. Prepare canonical one-paragraph, short, and long descriptions.
3. Prepare tags/topics for GitHub, npm, MCP directories, and client marketplaces.
4. Prepare screenshots or terminal GIF plan, without exposing private browser data.
5. Track submission status in docs without hardcoding secrets or account-specific state.

Acceptance criteria:

- Any maintainer can submit the project to an MCP directory from the docs.
- Submission copy consistently leads with local, safe, real Chrome profile.

Suggested verification:

- `npm run check:privacy`
- Markdown link checker if added later.

## Track B: MCP Agent UX

### B1. MCP Prompts

Current state:

- The MCP server exposes tools, but not prompts.

Gap:

- Agent clients increasingly use prompts as reusable workflows. Prompts reduce token burn because the agent can ask for a known workflow instead of rediscovering the correct tool chain.

Implementation plan:

Add MCP prompts for common workflows:

1. `chrome_bridge_read_first`
   - Inspect health, workspace, tab state.
   - Prefer `snapshot`, `text`, `observe`, `find-elements`.
   - Avoid mutation until the user confirms.
2. `chrome_bridge_existing_tab`
   - Ask the user to focus the target tab.
   - Adopt it with confirmation.
   - Read and summarize before acting.
3. `chrome_bridge_debug_page`
   - Gather diagnostics, trace summary, optional screenshot, and debug bundle.
   - Keep raw artifacts local.
4. `chrome_bridge_extract_structured`
   - Pick between presets and generic structured extraction.
   - Write large output to artifacts.
5. `chrome_bridge_safe_interaction`
   - Use observe/find first.
   - Explain confirmation requirements before click/type/select/upload/dialog.
6. `chrome_bridge_release_smoke`
   - Run extension reload, doctor, runtime smoke, and report the required pass fields.

Acceptance criteria:

- Prompts are discoverable through MCP clients that support `prompts/list`.
- Prompt text does not duplicate the entire docs.
- Prompt workflows refer to exact MCP tools and safety flags.

Suggested verification:

- New `npm run check:mcp-prompts`
- MCP local test for `prompts/list` and `prompts/get`
- `npm run check`

### B2. MCP Resources

Current state:

- Agents can call `chrome_bridge_command_catalog`, but static docs are not exposed as MCP resources.

Gap:

- Some clients use resources to let agents retrieve reference material on demand.

Implementation plan:

Expose compact MCP resources:

1. `chrome-bridge://docs/quickstart`
2. `chrome-bridge://docs/safety`
3. `chrome-bridge://docs/compatibility`
4. `chrome-bridge://catalog/tools`
5. `chrome-bridge://profiles/current`
6. `chrome-bridge://workflows/read-first`
7. `chrome-bridge://workflows/debug-bundle`

Keep resources concise. Long docs should remain local files and artifacts, not giant MCP payloads.

Acceptance criteria:

- Resources include freshness metadata.
- Resources state whether they are generated or static.
- Resource payloads are bounded.

Suggested verification:

- New `npm run check:mcp-resources`
- MCP local test for `resources/list` and `resources/read`

### B3. Tool Advisor

Current state:

- Agents can use `command-catalog`, but they still need to choose tools themselves.

Gap:

- With 59 tools, a first-time agent may spend tokens comparing commands.

Implementation plan:

Add a local read-only MCP tool and CLI command:

- CLI: `chrome-bridge advise`
- MCP: `chrome_bridge_tool_advisor`

Inputs:

- `task`: short user goal
- `surface`: optional `cli`, `mcp`, or `both`
- `riskTolerance`: `read-only`, `confirmed-interaction`, `private-read`
- `client`: optional client name
- `hasLiveBridge`: optional boolean

Output:

- recommended first tool
- recommended next tools
- tools to avoid
- required confirmations
- expected artifact behavior
- token-budget notes
- links to relevant prompts/resources

Implementation details:

1. Use deterministic keyword/rule matching first.
2. Do not call an LLM inside the bridge.
3. Derive tool metadata from the shared command registry.
4. Keep the response metadata-first and bounded.

Acceptance criteria:

- Common goals map to safe workflows:
  - "read the current dashboard"
  - "click login"
  - "extract pricing table"
  - "debug slow page"
  - "save report as PDF"
  - "find download button"
  - "inspect cookies"
- Sensitive goals recommend asking the user before confirmations.
- No network or page access is needed to run the advisor.

Suggested verification:

- New `npm run check:tool-advisor`
- `npm run check:registry`
- CLI/MCP parity tests.

### B4. Profile-Aware Discovery

Current state:

- The MCP server supports `full`, `core`, and `read` profiles.

Gap:

- Agents need to know which tools were omitted and why.

Implementation plan:

1. Add active profile metadata to `chrome_bridge_command_catalog`.
2. Add a resource `chrome-bridge://profiles/current`.
3. Add `profile` and `omittedTools` to `chrome_bridge_mcp_config` output when relevant.
4. Add docs for when to switch from `core` to `full`.
5. Consider a future `diagnostic` profile if DevTools-style tools grow.

Acceptance criteria:

- Cursor/Windsurf users can see why private-data tools are absent.
- Agents can recommend a profile switch without guessing.

Suggested verification:

- `npm run check:mcp-local-tools`
- New profile metadata fixture test.

### B5. Better Session Onboarding

Current state:

- `doctor`, `health`, `workspace`, and `session-summary` exist.

Gap:

- A new MCP agent still needs a single "what should I do next?" onboarding surface.

Implementation plan:

Add richer `nextActions` to:

- `chrome_bridge_health`
- `chrome_bridge_doctor`
- `chrome_bridge_workspace`
- `chrome_bridge_session_summary`

Examples:

- "Extension is not connected: start Chrome and load extension."
- "Bridge version changed: run reload-extension."
- "No scoped tab: call ensure-tab or adopt-tab."
- "Client is using core profile: private-data tools are intentionally omitted."
- "Another session may be using the bridge: avoid runtime-smoke until free."

Acceptance criteria:

- First-run failures are actionable without reading full docs.
- Recommendations are deterministic and testable.

Suggested verification:

- Extend existing local checkers.
- Runtime-smoke checks only when live bridge is free.

## Track C: Browser And DevTools Capabilities

### C1. Confirmed Download Manager

Current state:

- `download-discovery` finds likely download/export affordances without clicking or fetching.

Gap:

- Hosted competitors advertise downloads and exports. Users will expect a safe way to click a confirmed export/download button and capture the resulting local artifact.

Implementation plan:

Add a new confirmed workflow:

- CLI: `chrome-bridge download`
- MCP: `chrome_bridge_download`

Possible modes:

1. `discover`
   - Current read-only behavior.
2. `arm`
   - Listen for Chrome download events for one scoped tab with timeout.
3. `click`
   - Confirmed click on selector or observed action, while download listener is armed.
4. `wait`
   - Wait for a matching download completion.
5. `summary`
   - Return metadata and local file path, not file contents.

Safety rules:

- Require `confirmed: true` for any click.
- Restrict to scoped tab by default.
- Refuse dangerous local file paths.
- Never upload downloaded files.
- Redact URLs and filenames in default debug output if needed.
- Include size and timeout limits.

Acceptance criteria:

- User can export a report from a scoped tab with explicit confirmation.
- Agent receives download metadata and local artifact path.
- No raw downloaded content is dumped to stdout/MCP.

Suggested verification:

- Fixture page that generates a Blob download.
- New `npm run check:download-manager`
- Live runtime-smoke slice.

### C2. Lighthouse Runner Or Guided Handoff

Current state:

- `lighthouse-ingest` summarizes an existing local Lighthouse JSON report.

Gap:

- Competitors and Chrome DevTools MCP can run performance workflows directly.

Decision:

There are two viable approaches:

1. Lightweight handoff first:
   - Keep `lighthouse-ingest`.
   - Add `lighthouse-plan` that prints the exact local command to run.
   - Avoid adding a heavy dependency.
2. Integrated runner:
   - Add an optional local Lighthouse dependency or spawn `npx lighthouse`.
   - Capture JSON to a local artifact.
   - Ingest summary automatically.

Recommended sequence:

1. Implement lightweight handoff and docs.
2. Add integrated runner only after deciding dependency policy.

Acceptance criteria:

- Agents can produce performance recommendations from Lighthouse output without raw report bloat.
- If an integrated runner exists, it is opt-in, bounded, and writes artifacts locally.

Suggested verification:

- Existing Lighthouse fixture tests.
- New `npm run check:lighthouse-plan` or `npm run check:lighthouse-runner`.
- Live run only on a safe public URL or local fixture.

### C3. HAR-Like Network Export

Current state:

- Trace tools summarize console/network metadata.
- Full raw trace output is intentionally bounded.

Gap:

- DevTools-oriented tools often provide HAR/network evidence.

Implementation plan:

Add a redacted local artifact workflow:

- CLI: `chrome-bridge network-export`
- MCP: `chrome_bridge_network_export`

Outputs:

- `summary.json`
- `requests.jsonl`
- optional HAR-like JSON artifact
- redaction report

Default redactions:

- cookies
- authorization headers
- set-cookie
- query parameters that look like tokens
- request/response bodies unless explicitly included

Safety rules:

- Default metadata-only.
- Full headers or bodies require sensitive confirmation.
- Output path must be local and validated.

Acceptance criteria:

- Agents can debug failed requests and performance bottlenecks.
- Private values are not returned by default.

Suggested verification:

- Local fixture with synthetic headers and query tokens.
- New `npm run check:network-export`
- `npm run check:privacy`

### C4. Performance Trace Summary Improvements

Current state:

- `diagnostics` and trace summaries expose bounded metadata.

Gap:

- Coding agents need opinionated performance hints, not just counts.

Implementation plan:

Add derived hints:

- large resource count
- slow navigation timing
- long tasks if available
- failed request count
- third-party request count
- console error count
- render-blocking candidate count if available
- "run Lighthouse next" recommendation

Acceptance criteria:

- Diagnostics output answers "what is probably wrong?" without raw trace dumps.
- Hints are labeled as heuristics, not authoritative audits.

Suggested verification:

- Extend `check:diagnostics`.
- Fixture trace summaries.

### C5. Optional Device, Viewport, And Network Emulation

Current state:

- Basic browser interaction and screenshots exist.

Gap:

- DevTools and Playwright-style tools often support viewport/device/network testing.

Implementation plan:

Only add this after C1-C4:

- `set-viewport`
- `emulate-network`
- `clear-emulation`
- maybe geolocation only if clearly needed and explicitly confirmed

Safety rules:

- Treat emulation as system state.
- Require confirmation.
- Always provide a reset command.

Acceptance criteria:

- Agents can reproduce responsive/performance issues locally.
- State is easy to clear.

## Track D: High-Level `act` / `agent` Design

This track needs a product decision before implementation.

### What The Question Really Means

There are four different levels that often get mixed together:

1. Deterministic low-level tools.
   - Example: click this selector, type this text, take screenshot.
   - Chrome MCP Bridge already has this.
   - Safest and easiest to verify.
2. Read-only planning.
   - Example: "I want to log in; show me the likely next actions and selectors."
   - This is close to Stagehand `observe`.
   - Safe because it does not mutate the page.
3. Confirmed high-level action.
   - Example: "Click the login button" becomes observe -> choose selector -> show plan -> require confirmation -> click.
   - More ergonomic but riskier because the bridge chooses how to act.
4. Autonomous agent.
   - Example: "Book the appointment" loops through observe, decide, act, read, recover.
   - Powerful, but much harder to bound in a real logged-in browser.

### Recommended Direction

Implement `act-preview` first.

`act-preview` should:

- accept a natural-language intent
- inspect current page state with existing read-only tools
- return candidate deterministic actions
- include selectors, confidence, risk tier, and required confirmations
- include a recommended exact CLI/MCP command
- never mutate page state
- never call a remote LLM inside the bridge

Possible later step:

- `act-apply` executes one specific previewed action by ID, with explicit confirmation.

Avoid for now:

- full autonomous `agent-run`
- multi-step mutation loops
- self-approval of confirmations
- cross-site workflows without user checkpoints

### D1. `act-preview`

Inputs:

- `intent`
- `tabId` optional
- `maxCandidates`
- `riskTolerance`
- `selectorPreference`

Output:

- candidates
- exact command proposal
- reasons
- required confirmations
- possible side effects
- "ask user first" recommendation when uncertain

Implementation details:

1. Reuse `observe` and `find-elements`.
2. Use deterministic ranking only.
3. Never send page text to a hosted model.
4. Keep large page context in local artifacts.
5. Treat form submit, checkout, delete, publish, send, and payment terms as high-risk.

Acceptance criteria:

- "click login", "open pricing", "fill search", and "download report" produce sensible previews.
- Risky actions are flagged.
- No mutation happens during preview.

Suggested verification:

- New fixture pages for login/search/export/delete-like controls.
- New `npm run check:act-preview`
- No live bridge needed for deterministic unit fixtures.

### D2. Optional `act-apply`

Only implement after `act-preview` is stable.

Rules:

- Requires a preview action ID.
- Requires `confirmed: true`.
- Rejects stale preview IDs after page navigation or timeout.
- Applies exactly one deterministic action.
- Returns evidence: before/after URL, title, selected action, and next recommended read.

Acceptance criteria:

- Agents cannot ask the bridge to invent a fresh high-level action at apply time.
- Apply is auditable.

### D3. Full `agent-run`

Research only for now.

If considered later, it needs:

- max steps
- max sites
- same-origin or allowlist policy
- checkpoint prompts
- forbidden action classifier
- full local audit log
- emergency stop
- no private-data reads without explicit separate confirmation

## Track E: Cloud And Scale Research-Only

Current decision:

- Do not implement cloud sessions now.
- Research and document the boundary.

Research plan:

1. Compare cloud-browser use cases where Chrome MCP Bridge should explicitly recommend another tool:
   - large-scale crawling
   - proxy/geolocation rotation
   - CAPTCHA-heavy public scraping
   - session recording for remote teams
   - disposable browser pools
2. Define a future adapter boundary:
   - local real-profile provider
   - remote browser provider
   - artifact provider
   - policy provider
3. Document why the local provider stays default.
4. Document security and cost risks of remote providers.
5. Do not add API keys, paid service integration, or remote execution yet.

Acceptance criteria:

- `docs/CLOUD-AND-SCALE.md` exists.
- It names what is out of scope and why.
- It does not advertise stealth, CAPTCHA bypass, or scraping private content.

Suggested verification:

- `npm run check:privacy`
- Manual security review.

## Track F: Architecture And Verification Hardening

### F1. Registry-First Feature Additions

Every new command must start in the shared command registry.

Required metadata:

- action name
- CLI name
- MCP name
- risk tier
- confirmation requirement
- default timeout
- direct payload schema
- docs summary
- live-bridge requirement
- artifact behavior
- profile inclusion

Acceptance criteria:

- CLI, MCP, docs, allowlist, self-test, and pack checks do not drift.

### F2. Artifact Policy

New heavy outputs must follow metadata-first rules:

- stdout/MCP returns summary and artifact path
- local artifacts hold large/raw data
- sensitive fields are redacted by default
- raw bodies/headers/page text require explicit flags and confirmations

Acceptance criteria:

- No new feature dumps large private content into MCP responses by default.

### F3. Runtime Smoke Expansion

Runtime smoke should grow only with high-value live workflows.

Add smoke coverage for:

- extension package reload after extension packaging exists
- download manager fixture
- network export fixture
- act-preview read-only fixture
- optional act-apply single safe action

Acceptance criteria:

- Runtime smoke stays bounded.
- Offline coverage plan remains useful when another session is using the bridge.

### F4. UBS And Security Rescans

Run UBS after security-sensitive changes:

- browser data reads
- extension message handling
- downloads
- network export
- file writes
- prompt/confirmation flows

Acceptance criteria:

- Confirmed reachable findings become fix plans.
- Pattern noise is documented but not blindly churned.

## Suggested PR Sequence

### PR 1: Planning And Decision Docs

Scope:

- Add this implementation plan.
- Link it from README and competitive roadmap.
- Keep code unchanged.

Verification:

- `git diff --check`
- `npm run check:privacy`

Exit criteria:

- Plan is committed.
- Open decision questions are visible.

### PR 2: MCP Prompts And Resources MVP

Scope:

- Implement `prompts/list`, `prompts/get`, `resources/list`, and `resources/read` if supported cleanly by the MCP SDK version in use.
- Add compact workflow prompts and resources.
- Add checks.

Verification:

- `npm run check`
- `npm run check:mcp-local-tools`
- New prompt/resource checks.

Exit criteria:

- Agents can retrieve workflow guidance without reading the full docs.

### PR 3: Profile-Aware Discovery And Onboarding

Scope:

- Add active profile and omitted-tool metadata.
- Improve `nextActions` in health/doctor/workspace/session-summary.
- Update client compatibility docs.

Verification:

- `npm run check`
- `npm run check:mcp-local-tools`
- Runtime doctor when live bridge is free.

Exit criteria:

- Compact-profile clients can explain missing tools.

### PR 4: Tool Advisor

Scope:

- Add registry-derived `advise` CLI command and `chrome_bridge_tool_advisor` MCP tool.
- Cover common user intents with deterministic rules.

Verification:

- `npm run check`
- New `npm run check:tool-advisor`
- `npm run check:registry`

Exit criteria:

- Agents can ask "which bridge tool should I use?" and get a safe answer.

### PR 5: Distribution Polish

Scope:

- Add client install page/cards.
- Add registry submission checklist.
- Add extension packaging script and docs.
- Add privacy-policy/store-submission draft if Chrome Web Store is desired.

Verification:

- `npm run check`
- `npm run check:pack`
- New distribution doc checker if added.

Exit criteria:

- Public setup story is client-neutral and release-ready.

### PR 6: Confirmed Download Manager

Scope:

- Add Chrome download listener workflow.
- Add safe confirmed click/download capture.
- Add fixture and tests.

Verification:

- `npm run check`
- `npm run check:download-manager`
- Live runtime smoke when bridge is free.

Exit criteria:

- Safe local download/export workflow works without stdout bloat.

### PR 7: Lighthouse Handoff, Then Optional Runner

Scope:

- Add `lighthouse-plan` first.
- Decide whether to add optional integrated runner later.

Verification:

- `npm run check`
- Existing and new Lighthouse fixtures.

Exit criteria:

- Agents can get from live page to local Lighthouse summary with minimal guessing.

### PR 8: HAR-Like Network Export

Scope:

- Add redacted network export artifacts.
- Add sensitive gates for full headers/bodies.

Verification:

- `npm run check`
- `npm run check:privacy`
- New `npm run check:network-export`
- UBS scan.

Exit criteria:

- Network debugging is useful without leaking private values by default.

### PR 9: Performance Hinting

Scope:

- Add derived diagnostics hints.
- Keep hints heuristic and bounded.

Verification:

- `npm run check:diagnostics`
- Fixture checks.

Exit criteria:

- Diagnostics answer "what should I inspect next?"

### PR 10: `act-preview`

Scope:

- Add read-only high-level action planning.
- No mutation.
- No remote LLM calls.

Verification:

- `npm run check`
- New `npm run check:act-preview`
- Runtime read-only spot check.

Exit criteria:

- Agent can ask for action candidates and receive exact safe commands.

### PR 11: Optional `act-apply`

Scope:

- Execute one previewed action by ID.
- Require confirmation.
- Reject stale previews.

Verification:

- `npm run check`
- Runtime smoke slice with safe local fixture.
- UBS scan.

Exit criteria:

- High-level action execution remains auditable and bounded.

### PR 12: Cross-Platform Service Installers

Scope:

- Keep macOS LaunchAgent.
- Add Linux systemd user service docs/script.
- Add Windows Task Scheduler or startup script docs.

Verification:

- Platform-specific dry-run tests where available.
- `npm run check:pack`

Exit criteria:

- Non-macOS users have a clear persistent daemon path.

### PR 13: Cloud And Scale Research Doc

Scope:

- Add research-only `docs/CLOUD-AND-SCALE.md`.
- Explain local vs hosted tradeoffs.
- Document future adapter boundary without implementation.

Verification:

- `npm run check:privacy`

Exit criteria:

- Product boundary is explicit and does not drift into hosted-browser promises.

### PR 14: Alias Package Decision And Release

Scope:

- If approved, create or prepare `chrome-mcp-bridge` alias package.
- Update publishing docs and migration notes.

Verification:

- `npm run check`
- `npm run check:pack`
- `npm run check:audit`
- Manual npm publish dry-run.

Exit criteria:

- Alias is safe, non-breaking, and documented.

## Dependency Graph

Recommended order:

1. Planning docs.
2. MCP prompts/resources.
3. Profile-aware discovery.
4. Tool advisor.
5. Distribution docs and package polish.
6. Download manager.
7. Lighthouse handoff/runner.
8. Network export.
9. Diagnostics hinting.
10. `act-preview`.
11. Optional `act-apply`.
12. Cross-platform installers.
13. Cloud/scale research.
14. Alias package/release.

Parallelizable work:

- Distribution docs can run in parallel with MCP prompts/resources.
- Cloud/scale research can run in parallel with browser features.
- Cross-platform installers can run after packaging decisions, independent of `act-preview`.

Do not start before prerequisites:

- Do not implement `act-apply` before `act-preview`.
- Do not publish alias package before deciding naming migration.
- Do not add a Lighthouse runner before deciding dependency policy.
- Do not add network body export without sensitive confirmation and redaction design.

## Default Verification Matrix

Run for docs-only changes:

```bash
git diff --check
npm run check:privacy
```

Run for CLI/MCP registry changes:

```bash
npm run check
npm run check:audit
npm run check:pack
```

Run for extension/live-browser changes:

```bash
npm run check
npm run check:audit
npm run check:pack
node ./bin/chrome-bridge.mjs reload-extension --confirm
node ./bin/chrome-bridge.mjs doctor --live-checks
node ./bin/chrome-bridge.mjs runtime-smoke --summary-only --out /tmp/chrome-bridge-runtime-smoke.json
```

Run after security-sensitive changes:

```bash
/opt/homebrew/bin/bash /opt/homebrew/bin/ubs --format=json --ci --only=js --report-json /tmp/codex-chrome-bridge-ubs.json .
```

Treat UBS output as evidence, not a blind rewrite queue. Fix confirmed reachable issues first.

## Decision Questions

### Q1. Alias package and repository naming

Do we want `chrome-mcp-bridge` to become a public npm alias soon, while keeping `codex-chrome-bridge` as the stable compatibility package?

Why this matters:

- It improves search and positioning.
- It creates release-process overhead.
- It may require ownership checks, migration docs, and extra package maintenance.

Recommended default:

- Yes to an npm alias package if the name is available.
- No repository rename until the alias has proven useful.

### Q2. Chrome Web Store submission

Do we want to prepare and submit the extension to the Chrome Web Store, or stay with unpacked developer install for now?

Why this matters:

- Store distribution reduces friction.
- It requires privacy-policy wording, screenshots, review, and versioned extension packages.
- Store review may reject or question broad permissions unless the safety model is extremely clear.

Recommended default:

- Build reproducible extension packaging and privacy docs now.
- Decide store submission after the package artifact is clean.

### Q3. Download manager risk boundary

Should Chrome MCP Bridge be allowed to click a confirmed export/download button and capture the resulting local file path?

Why this matters:

- It closes a visible competitor gap.
- It introduces local file handling and event-listener complexity.
- It must not become a general unattended downloader.

Recommended default:

- Yes, but only for scoped tabs, explicit confirmation, bounded timeout, and metadata-only output.

### Q4. Lighthouse dependency policy

Should the project add an integrated Lighthouse runner, or only generate handoff commands and ingest reports?

Why this matters:

- Integrated runner is smoother.
- It may add dependency weight, install friction, and version drift.
- Handoff keeps the bridge lighter and safer.

Recommended default:

- Implement `lighthouse-plan` first.
- Add integrated runner later only if the workflow feels too clumsy.

### Q5. High-level `act` and `agent`

How much autonomy should the bridge provide inside the user's real logged-in Chrome?

The options are:

1. `act-preview` only: the bridge proposes actions, but never executes them.
2. `act-preview` plus confirmed `act-apply`: the bridge executes exactly one previewed action after confirmation.
3. Full `agent-run`: the bridge loops through multi-step browser actions.

Why this matters:

- `act-preview` is safe and useful.
- `act-apply` is ergonomic but must be auditable.
- `agent-run` can be powerful, but it is risky in real accounts and much harder to verify.

Recommended default:

- Build `act-preview`.
- Revisit confirmed `act-apply` after real use.
- Keep full `agent-run` research-only.

### Q6. Cloud and scale

Should the project keep cloud/browser-farm functionality as research-only, with no API keys and no implementation?

Why this matters:

- Hosted cloud browsers solve different problems.
- Adding remote providers changes privacy, cost, trust, and support expectations.
- The local-first story is currently the strongest differentiator.

Recommended default:

- Research and document only.
- Do not implement cloud providers in this cycle.

### Q7. Cross-platform daemon support

Which persistent install path matters most after macOS LaunchAgent?

Options:

- Linux systemd user service.
- Windows Task Scheduler/startup script.
- Both, docs-first.

Why this matters:

- Cross-platform daemon support improves adoption.
- Testing Windows/Linux from macOS can be limited.
- Docs-first may be safer than scripts-first.

Recommended default:

- Add docs-first Linux and Windows instructions, then scripts after user feedback.

## Recommended Next Slice

Start with PR 1 through PR 4:

1. Land this plan.
2. Add MCP prompts/resources.
3. Add profile-aware discovery/onboarding.
4. Add the deterministic tool advisor.

Reason:

- These changes improve every client immediately.
- They reduce token burn.
- They do not touch risky browser mutation paths.
- They create the UX foundation needed before adding downloads, network export, or high-level action planning.
