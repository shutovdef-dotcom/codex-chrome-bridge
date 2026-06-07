# Support

## Where to Ask

- For bugs, use the bug report issue form.
- For feature ideas, use the feature request issue form.
- For security vulnerabilities, follow [SECURITY.md](SECURITY.md).

## Before Opening an Issue

Please run:

```bash
npm run check
node ./bin/chrome-bridge.mjs health
node ./bin/chrome-bridge.mjs doctor
```

For browser-runtime problems, also include whether the unpacked extension was reloaded after the latest source change.

## Privacy

Do not post:

- cookies or cookie values
- access tokens
- private dashboard screenshots
- account identifiers
- private URLs
- full browser history, bookmark exports, or storage values

Redact anything that identifies a real account before sharing logs.

