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

```bash
chrome-bridge server [--port 17376]
chrome-bridge health
chrome-bridge doctor [--copy-path] [--open-extensions]
chrome-bridge extension-path
chrome-bridge codex-config
chrome-bridge self-test
chrome-bridge runtime-smoke [--keep-tab]
```

## Tabs and Navigation

```bash
chrome-bridge group [--tabs]
chrome-bridge tabs [--all]
chrome-bridge ensure-tab [url] [--active]
chrome-bridge open <url> [--tab <id>] [--active] [--new]
chrome-bridge activate [--tab <id>] [--focus-window] [--allow-external]
chrome-bridge close-tab [--tab <id>] --confirm [--allow-external]
chrome-bridge close-group --confirm
chrome-bridge back [--tab <id>] [--allow-external]
chrome-bridge forward [--tab <id>] [--allow-external]
chrome-bridge reload [--tab <id>] [--bypass-cache] [--allow-external]
```

By default, tab operations stay inside the `Codex Bridge` tab group.

## Page Reads

```bash
chrome-bridge wait --selector <css> [--timeout-ms 10000] [--hidden-ok] [--tab <id>] [--allow-external]
chrome-bridge snapshot [--tab <id>] [--max-chars 50000] [--allow-external]
chrome-bridge text [--tab <id>] [--max-chars 50000] [--allow-external]
chrome-bridge html [--tab <id>] [--selector <css>] [--max-chars 100000] [--inner] [--allow-external]
chrome-bridge screenshot [--tab <id>] --out <file> [--full-page] [--selector <css>] [--allow-external]
chrome-bridge scroll --tab <id> --y <pixels> [--allow-external]
```

## Interactions

Interactions require `--confirm`.

```bash
chrome-bridge click --tab <id> --selector <css> --confirm [--allow-external]
chrome-bridge click-at --x <px> --y <px> --confirm [--trusted] [--tab <id>] [--allow-external]
chrome-bridge hover [--selector <css>] [--x <px> --y <px>] [--trusted] [--tab <id>] [--allow-external]
chrome-bridge type --tab <id> --selector <css> --text <text> --confirm [--trusted] [--allow-external]
chrome-bridge press --key <key> --confirm [--selector <css>] [--trusted] [--tab <id>] [--allow-external]
chrome-bridge select --selector <css> --confirm [--value <value> | --label <label> | --index <n>] [--tab <id>] [--allow-external]
```

Use `--trusted` when you need Chrome Debugger input events rather than DOM-dispatched events.

## Trace

```bash
chrome-bridge trace-start --confirm [--tab <id>] [--max-events 500] [--no-network] [--no-console] [--include-extension-events] [--allow-external]
chrome-bridge trace-events [--tab <id>] [--limit 100] [--allow-external]
chrome-bridge trace-stop [--tab <id>] [--limit 100] [--allow-external]
```

Trace captures bounded console and network metadata. It does not capture request or response bodies by default.

## Browser Data

These commands require `--confirm`.

```bash
chrome-bridge history [--query <text>] --confirm [--limit 25]
chrome-bridge bookmarks [--query <text>] --confirm [--limit 50]
chrome-bridge cookies [--url <url> | --domain <domain>] --confirm [--include-values --confirm-sensitive] [--limit 50]
chrome-bridge storage [--tab <id>] --confirm [--include-values --confirm-sensitive] [--allow-external]
chrome-bridge request <url> --confirm [--method GET] [--headers-json <json>] [--body <text>] [--credentials include --confirm-sensitive] [--max-chars 20000]
```

Cookie values, whole-cookie-jar queries, storage values, and credentialed requests require `--confirm-sensitive`.

