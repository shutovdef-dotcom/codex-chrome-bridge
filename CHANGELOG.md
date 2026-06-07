# Changelog

## Unreleased

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
