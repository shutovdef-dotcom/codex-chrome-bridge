# Chrome Extension Setup

Codex Chrome Bridge uses an unpacked Chrome extension from the `extension/` directory.

## Install

1. Open `chrome://extensions/`.
2. Enable Developer mode.
3. Click "Load unpacked".
4. Select the `extension/` folder from this repository.
5. Start the bridge server:

```bash
npm run server
```

6. Check health:

```bash
node ./bin/chrome-bridge.mjs health
```

The extension is ready when `extension.connected` is `true` and `extension.info.version` matches `package.json`.

## Reload After Edits

If extension permissions or source files change, reload the unpacked extension in `chrome://extensions/`.

Once the extension is connected, future source edits can often be applied with:

```bash
node ./bin/chrome-bridge.mjs reload-extension --confirm
```

Permission changes still require a manual Chrome extension reload.

## Human Prompt Page

`ask.html` is a local extension page used by the `ask` CLI command and `chrome_bridge_ask_user` MCP tool. It opens inside the `Codex Bridge` tab group and sends the user's answer back to the extension background script.

Prompt cleanup uses the same ungroup-before-close path as `close-tab` and `close-group`, so short-lived prompt tabs do not leave behind new saved closed `Codex Bridge` groups when Chrome cleanup runs.

## Permissions

The extension currently requests:

- `activeTab`
- `alarms`
- `bookmarks`
- `cookies`
- `debugger`
- `history`
- `offscreen`
- `scripting`
- `storage`
- `tabGroups`
- `tabs`
- `<all_urls>` host permissions

These permissions are broad because the tool works with real Chrome tabs. Use this only with a local bridge server you control.
