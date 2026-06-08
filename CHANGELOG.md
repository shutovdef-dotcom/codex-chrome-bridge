# Changelog

## Unreleased

- Expanded the generated MCP reference block from a plain tool list into a registry-derived table with contract IDs, risk tiers, timeouts, confirmation requirements, live-bridge flags, and summaries.
- Ungroup bridge-owned tabs before closing them in `close-tab`, `close-group`, prompt cleanup, and runtime smoke cleanup so Chrome does not create new saved closed `Codex Bridge` group chips.
- Added `adopt-tab` / `chrome_bridge_adopt_tab` to pull an already-open Chrome tab into the scoped `Codex Bridge` group with explicit confirmation.
- Added `pdf` / `chrome_bridge_pdf` to export the selected real Chrome tab as a PDF.
- Added `observe` / `chrome_bridge_observe` for read-only ranked actionable element discovery.
- Added `find-elements` / `chrome_bridge_find_elements` filters on top of ranked element discovery, including nearby-text matching for form and section context.
- Added `extract` / `chrome_bridge_extract` for structured tables, forms, lists, and key-value blocks.
- Made form extraction privacy-preserving by reporting field structure and value state without returning current form values.
- Added safe debug artifacts via `session-summary`, `debug-bundle`, `chrome_bridge_session_summary`, and `chrome_bridge_debug_bundle`.
- Made `doctor` offline by default; live bridge and Chrome Apple Events probes now require explicit `--live-checks`.
- Made `codex-config` emit the current Node executable instead of a hardcoded Homebrew path.
- Added confirmation gates for `reload-extension`, `chrome_bridge_reload_extension`, and direct `reloadExtension` so extension reloads cannot interrupt active sessions accidentally.
- Made `debug-bundle` privacy-first by omitting page snapshot, observe output, and screenshot artifacts unless explicit include flags are passed.
- Made `debug-bundle` redact URL/title/text/value fields in default JSON artifacts and summarize trace events unless full trace events are explicitly requested.
- Added `trace-summary` / `chrome_bridge_trace_summary` so agents and debug bundles can inspect trace metadata without retrieving the full event log.
- Added workspace policy state and strict-policy recommendations to `session-summary` and debug bundles.
- Added workflow helpers for select option discovery, dry-run-first form filling, JavaScript dialog handling, and file input upload.
- Made `fill-form` previews privacy-preserving by reporting field value states instead of current or planned raw values.
- Made `select-options` privacy-preserving by omitting current selection state while still listing available options.
- Added local workspace policy commands via `workspace`, `set-workspace`, `clear-workspace`, and matching MCP tools.
- Added `strict` workspace policy mode to block outside tabs even when `allowExternal` is passed.
- Added a shared Node-side command registry for bridge version metadata, action schemas, risk tiers, default timeouts, CLI commands, MCP tool names, manifest expectations, and self-test parity.
- Wired server, CLI, and MCP command dispatch defaults to the shared registry timeout metadata.
- Added local command catalog surfaces via `command-catalog` and `chrome_bridge_command_catalog`, covering both extension actions and local diagnostic/tooling commands.
- Added generated `docs/COMMAND-CATALOG.md` and `npm run docs:commands`, with self-test drift checking against the shared registry.
- Expanded generated command catalog Markdown with default timeouts and payload keys so agent-facing docs match the registry metadata.
- Expanded generated command catalog Markdown with registry-owned CLI usage signatures and made CLI `--help` derive from the same registry.
- Made the CLI reference usage blocks generated from registry-owned CLI usage groups.
- Made the MCP reference tool block generated from the shared registry.
- Clarified generated command catalog payload-key metadata as direct `/command` payload keys so MCP agents do not confuse it with MCP argument schemas.
- Fixed the generated `open` CLI usage signature to document its supported `--allow-external` flag.
- Added `npm run check:registry` to verify command registry invariants, package/manifest/registry version and permission parity, complete CLI/MCP catalog coverage, generated catalog drift, and representative payload validation cases.
- Added registry metadata and static checks for debugger-backed actions so trace, trusted input, screenshots, PDF export, dialogs, and uploads stay serialized per tab.
- Added `npm run check:bridge-contract` to verify local bridge boundary behavior without Chrome, including disabled long-poll fallback, unsupported action rejection, malformed JSON/payload/timeout rejection, unsafe host rejection, stale/missing extension-version fail-closed behavior, shutdown cleanup, and extension error code/detail propagation.
- Hardened extension ingress so WebSocket and optional long-poll extension requests require a `chrome-extension://` origin and contract tests reject missing or non-extension origins.
- Hardened bridge shutdown so extension WebSockets close cleanly and pending commands fail fast with `BRIDGE_SHUTTING_DOWN`.
- Added `npm run check:docs` to keep exact CLI usage signatures, generated MCP tool metadata, and MCP reference coverage in sync with the shared command registry.
- Added `npm run check:privacy` to scan repository files for local home paths, private-key headers, common provider tokens, and obvious secret assignments.
- Hardened `npm run check:pack` so it parses the dry-run tarball and verifies required runtime, extension, shared registry, generated docs, and verification files are included.
- Added registry checks that keep the GitHub Check workflow aligned with the supported Node.js matrix, audit gate, package gate, and no-live-browser CI policy.
- Split the extension service worker by moving injected page helpers to `extension/page-scripts.js` and workspace normalization to `extension/workspace-policy.js`.
- Hardened the bridge command surface: unsupported actions are rejected, stale or not-yet-reported extension versions now fail closed instead of drifting silently, and extension error codes/details are preserved for CLI/MCP diagnostics.
- Added server-side JSON, payload, timeout, unsafe URL-scheme, and loopback-only bind validation for direct HTTP clients.
- Hardened oversized JSON request handling so direct HTTP clients receive structured `413 REQUEST_TOO_LARGE` responses instead of socket-level failures.
- Tightened direct `/command` envelope validation so unknown top-level fields fail before extension dispatch.
- Hardened JSON POST handling so `/command` and extension fallback result/hello endpoints require `Content-Type: application/json`, reducing blind localhost CSRF risk from simple browser requests.
- Hardened direct `/command` ingress so requests carrying browser or extension origins are rejected before payload parsing or extension dispatch; browser-extension traffic must use the dedicated extension ingress.
- Scoped CORS responses to extension ingress paths so direct `/command` preflight does not advertise browser-extension access.
- Hardened extension ingress handling so reported extension IDs must match the `chrome-extension://` origin on WebSocket hello and optional long-poll hello/result requests.
- Hardened the optional long-poll fallback so poll requests are pinned to the previously reported extension ID when one is known.
- Added confirmation gates for `tabs --all`, `windows --all`, and matching MCP/direct/extension `includeAll` reads so unrelated tab URLs and titles require explicit approval.
- Added stable `503 EXTENSION_NOT_CONNECTED` responses for valid commands sent before the Chrome extension connects.
- Tightened direct `uploadFile` payload validation so `files` must be an array of string paths, matching the MCP schema.
- Tightened direct `/command` nested payload validation for form fields, request headers, and prompt choices so HTTP clients match the MCP schema instead of relying on extension-side string coercion.
- Tightened direct `/command` enum validation for extraction kind and extension-request credentials to match the MCP schema.
- Tightened extension-context request method validation to the shared `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, and `OPTIONS` allowlist across CLI, MCP, and direct `/command`.
- Tightened direct `/command` numeric bounds for observe/find, extraction, reads, PDF scale, tracing, browser-data limits, request size, storage value length, and user prompt timeouts to match MCP constraints.
- Tightened direct `/command` required-field validation for navigation URLs, selectors, coordinates, text/key input, upload files, request URLs, and user prompt questions.
- Tightened MCP URL schemas so navigation allows only `http:`, `https:`, and `about:blank`, while cookie/request URLs allow only `http:` and `https:`.
- Tightened direct `/command` confirmation and sensitive-confirmation gates so direct HTTP clients fail before extension dispatch.
- Tightened command schemas so `confirmSensitive` is accepted only on actions that can expose private values.
- Tightened `adoptTab` schema so existing-tab adoption stays a distinct confirmed workflow rather than accepting the outside-tab `allowExternal` override.
- Tightened `press` trusted input behavior so Chrome Debugger key events are opt-in with `trusted=true` / `--trusted`, matching the documented CLI/MCP contract.
- Disabled the HTTP long-poll extension transport by default; the extension uses WebSocket ingress unless fallback mode is explicitly enabled.
- Removed trace response-body capture so trace behavior matches the documented privacy model.
- Added an AI/GEO discovery summary in `README.md`, plus `llms.txt` and package keywords for clearer agent search and indexing.
- Added top-level community health files: `CODE_OF_CONDUCT.md`, `SUPPORT.md`, PR template, and typed issue forms.
- Added Dependabot configuration and CodeQL scanning.
- Expanded CI to check Node.js 20, 22, and 24, audit high-severity vulnerabilities, and verify package contents.
- Reworked README with badges, clearer positioning, quick links, safety guidance, and contributor entry points.

## 0.4.0 - 2026-06-07

- Added multi-window listing via CLI `windows`, extension action `windows`, and MCP tool `chrome_bridge_windows`.
- Added human-in-the-loop prompts via CLI `ask`, extension action `askUser`, local `ask.html` page, and MCP tool `chrome_bridge_ask_user`.
- Added syntax checks for the prompt page script.
- Documented CAPTCHA/manual-step policy: ask the user; do not bypass automatically.

## 0.3.0 - 2026-06-07

Initial public project packaging.

- Added Chrome tab group scoping under `Codex Bridge`.
- Added CLI and MCP surfaces for tabs, navigation, waits, reads, screenshots, interactions, trace, history, bookmarks, cookies, storage, and requests.
- Added read-mostly safety gates and sensitive-data confirmation gates.
- Added `self-test` and `runtime-smoke`.
- Added macOS LaunchAgent install helpers.
- Added public documentation.
