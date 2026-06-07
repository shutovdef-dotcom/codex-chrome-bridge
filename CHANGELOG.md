# Changelog

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
