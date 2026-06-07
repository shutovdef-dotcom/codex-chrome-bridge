# Publishing Checklist

Use this checklist before making the repository public.

## Local Checks

```bash
npm ci
npm run check
npm run check:audit
npm run check:pack
npm run server
node ./bin/chrome-bridge.mjs health
node ./bin/chrome-bridge.mjs runtime-smoke
```

## Repository Metadata

- Confirm `shutovdef-dotcom` is the intended GitHub owner in `package.json` and README examples.
- Set `author` in `package.json` if desired.
- Confirm the license. The repository currently uses MIT.
- Review `SECURITY.md`.
- Review issue templates.
- Confirm `CODE_OF_CONDUCT.md`, `SUPPORT.md`, and `.github/PULL_REQUEST_TEMPLATE.md` match the maintainer policy.
- Confirm Dependabot and CodeQL workflows are enabled after push.

## Privacy Review

Before publishing:

```bash
rg -n "/Users/|secret|token|password|api[_-]?key|cookie|private" . -g '!node_modules/**' -g '!package-lock.json'
```

Expected matches should be docs or safety text, not real secrets or private paths.

## GitHub

```bash
git init
git add .
git commit -m "feat: publish codex chrome bridge"
git branch -M main
git remote add origin git@github.com:shutovdef-dotcom/codex-chrome-bridge.git
git push -u origin main
```

Only push after reviewing the final diff.
