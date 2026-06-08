# CLI Reference

Run commands from the project root:

```bash
node ./bin/chrome-bridge.mjs <command>
```

Or install/link the package and use:

```bash
chrome-bridge <command>
```

## Server and Diagnostics

The command blocks below are generated from the shared registry by `npm run docs:commands`.

<!-- BEGIN GENERATED CLI USAGE: server-diagnostics -->
```bash
chrome-bridge server [--port 17376]
chrome-bridge health
chrome-bridge windows [--all --confirm]
chrome-bridge doctor [--live-checks] [--copy-path] [--open-extensions]
chrome-bridge extension-path
chrome-bridge codex-config
chrome-bridge command-catalog [--markdown]
chrome-bridge reload-extension --confirm
chrome-bridge self-test
chrome-bridge runtime-smoke [--keep-tab]
```
<!-- END GENERATED CLI USAGE: server-diagnostics -->

## Tabs and Navigation

<!-- BEGIN GENERATED CLI USAGE: tabs-navigation -->
```bash
chrome-bridge group [--tabs]
chrome-bridge tabs [--all --confirm]
chrome-bridge workspace [--tabs]
chrome-bridge set-workspace [--name <name>] [--group-title <title>] [--group-color <color>] [--policy-mode scoped|strict] --confirm
chrome-bridge clear-workspace --confirm
chrome-bridge ensure-tab [url] [--active]
chrome-bridge adopt-tab [--tab <id>] --confirm
chrome-bridge open <url> [--tab <id>] [--active] [--new] [--allow-external]
chrome-bridge activate [--tab <id>] [--focus-window] [--allow-external]
chrome-bridge close-tab [--tab <id>] --confirm [--allow-external]
chrome-bridge close-group --confirm
chrome-bridge back [--tab <id>] [--allow-external]
chrome-bridge forward [--tab <id>] [--allow-external]
chrome-bridge reload [--tab <id>] [--bypass-cache] [--allow-external]
```
<!-- END GENERATED CLI USAGE: tabs-navigation -->

By default, tab operations stay inside the configured workspace tab group, initially `Codex Bridge`.

`workspace` reports the local workspace defaults, policy mode, group counts, and optionally scoped tabs. `set-workspace` stores local defaults for the group title/color and explicit policy mode. It requires `--confirm`. `scoped` keeps outside tabs explicit-only through `--allow-external`; `strict` blocks outside tabs even when `--allow-external` is passed.

`tabs --all` and `windows --all` require `--confirm` because they can expose unrelated tab URLs and titles outside the scoped workspace group.

`doctor` is offline by default and reports local paths plus setup hints without contacting the bridge or Chrome. Use `--live-checks` only when no other session is using the bridge; it probes `/health` and Chrome Apple Events settings. `--copy-path` writes the extension path to the clipboard, and `--open-extensions` opens Chrome's extensions page.

`command-catalog` prints the shared registry metadata used by self-test and docs checks: extension action names, local diagnostic/tooling commands, risk tiers, default timeouts, live-bridge flags, CLI aliases, MCP tool names, direct `/command` payload keys, and confirmation requirements. Use `--markdown` for tables. The generated checked-in version is [COMMAND-CATALOG.md](COMMAND-CATALOG.md).

`reload-extension --confirm` asks the unpacked extension to reload itself after local extension file edits. Use it only after confirming no other session is relying on the current extension instance.

Navigation commands accept `http:`, `https:`, and `about:blank` URLs. Extension-context requests and cookie URL filters accept `http:` and `https:` URLs. Unsafe script/data/file-style URL schemes are rejected before a command reaches the extension.

## Page Reads

<!-- BEGIN GENERATED CLI USAGE: page-reads -->
```bash
chrome-bridge wait --selector <css> [--timeout-ms 10000] [--hidden-ok] [--tab <id>] [--allow-external]
chrome-bridge observe [--tab <id>] [--limit 80] [--max-text-chars 160] [--allow-external]
chrome-bridge find-elements [--role <role>] [--text <text>] [--near-text <text>] [--placeholder <text>] [--href <text>] [--action <kind>] [--risk <risk>] [--limit 80] [--tab <id>] [--allow-external]
chrome-bridge extract [--kind all|tables|forms|lists|keyValues] [--max-items 50] [--tab <id>] [--allow-external]
chrome-bridge snapshot [--tab <id>] [--max-chars 50000] [--allow-external]
chrome-bridge text [--tab <id>] [--max-chars 50000] [--allow-external]
chrome-bridge html [--tab <id>] [--selector <css>] [--max-chars 100000] [--inner] [--allow-external]
chrome-bridge screenshot [--tab <id>] --out <file> [--full-page] [--selector <css>] [--allow-external]
chrome-bridge pdf [--tab <id>] --out <file> [--landscape] [--omit-background] [--page-ranges <ranges>] [--scale <0.1-2>] [--allow-external]
chrome-bridge scroll --tab <id> --y <pixels> [--allow-external]
```
<!-- END GENERATED CLI USAGE: page-reads -->

`observe` is read-only. It returns ranked actionable elements with selectors, labels, roles, suggested action kinds, and risk hints so agents can choose targets before using confirmed interaction commands.

`find-elements --near-text` filters candidates by nearby container text, which helps target controls next to a label, heading, or form section without requiring exact button text.

`extract --kind forms` returns form structure and field value state, but not current field values.

## Interactions

Interactions require `--confirm`.

<!-- BEGIN GENERATED CLI USAGE: interactions -->
```bash
chrome-bridge click --tab <id> --selector <css> --confirm [--allow-external]
chrome-bridge click-at --x <px> --y <px> --confirm [--trusted] [--tab <id>] [--allow-external]
chrome-bridge hover [--selector <css>] [--x <px> --y <px>] [--trusted] [--tab <id>] [--allow-external]
chrome-bridge type --tab <id> --selector <css> --text <text> --confirm [--trusted] [--allow-external]
chrome-bridge press --key <key> --confirm [--selector <css>] [--trusted] [--tab <id>] [--allow-external]
chrome-bridge select --selector <css> --confirm [--value <value> | --label <label> | --index <n>] [--tab <id>] [--allow-external]
chrome-bridge select-options --selector <css> [--tab <id>] [--allow-external]
chrome-bridge fill-form --fields-json <json> [--dry-run] [--confirm] [--tab <id>] [--allow-external]
chrome-bridge handle-dialog --confirm [--dismiss] [--prompt-text <text>] [--tab <id>] [--allow-external]
chrome-bridge upload-file --selector <css> (--file <path> | --files-json <json>) --confirm [--tab <id>] [--allow-external]
```
<!-- END GENERATED CLI USAGE: interactions -->

Use `--trusted` when you need Chrome Debugger input events rather than DOM-dispatched events.

`fill-form` previews changes with `--dry-run`; applying values requires `--confirm`. It does not submit the form or return current/planned raw field values.

`select-options` lists available options without returning the current selected value or selected option.

`upload-file` accepts a single `--file` path or a `--files-json` array of string paths.

## Trace

<!-- BEGIN GENERATED CLI USAGE: trace -->
```bash
chrome-bridge trace-start --confirm [--tab <id>] [--max-events 500] [--no-network] [--no-console] [--include-extension-events] [--allow-external]
chrome-bridge trace-summary [--tab <id>] [--allow-external]
chrome-bridge trace-events [--tab <id>] [--limit 100] [--allow-external]
chrome-bridge trace-stop [--tab <id>] [--limit 100] [--allow-external]
```
<!-- END GENERATED CLI USAGE: trace -->

Trace captures bounded console and network metadata. It does not capture request or response bodies. Use `trace-summary` when you only need active state, timing, and event counts without returning console or network event logs.

## Browser Data

These commands require `--confirm`.

<!-- BEGIN GENERATED CLI USAGE: browser-data -->
```bash
chrome-bridge history [--query <text>] --confirm [--limit 25]
chrome-bridge bookmarks [--query <text>] --confirm [--limit 50]
chrome-bridge cookies [--url <url> | --domain <domain>] --confirm [--include-values --confirm-sensitive] [--limit 50]
chrome-bridge storage [--tab <id>] --confirm [--include-values --confirm-sensitive] [--allow-external]
chrome-bridge request <url> --confirm [--method GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS] [--headers-json <json>] [--body <text>] [--credentials include --confirm-sensitive] [--max-chars 20000]
```
<!-- END GENERATED CLI USAGE: browser-data -->

Cookie values, whole-cookie-jar queries, storage values, and credentialed requests require `--confirm-sensitive`.

## Human-in-the-Loop

<!-- BEGIN GENERATED CLI USAGE: human-in-the-loop -->
```bash
chrome-bridge ask --question <text> [--choices-json <json>] [--no-text] [--timeout-ms 300000] [--keep-tab]
chrome-bridge session-summary
chrome-bridge debug-bundle --out <dir> [--tab <id>] [--allow-external] [--include-snapshot] [--include-observe] [--include-screenshot] [--include-trace-events]
```
<!-- END GENERATED CLI USAGE: human-in-the-loop -->

The command opens a local extension page inside the `Codex Bridge` group and waits for the user to respond.

`--choices-json` accepts either strings or `{ "value": "...", "label": "..." }` objects:

```bash
chrome-bridge ask --question "Continue?" --choices-json '["Yes","No"]' --no-text
```

`session-summary` includes bridge health, scoped group state, workspace policy state, and recommendations such as extension reload, first-tab setup, or active `strict` policy warnings. `debug-bundle` writes the same summary into `session-summary.json`.

`debug-bundle` redacts URL/title/text/value fields in its default JSON files and writes `trace-summary.json` rather than full trace events. Use `--include-snapshot`, `--include-observe`, `--include-screenshot`, or `--include-trace-events` only when the resulting local bundle may safely contain page text, element labels, pixels, URLs, or console/log text from the active browser page.
