# Chrome Bridge Examples Gallery

This gallery shows cheap-first, metadata-first Chrome Bridge workflows for common agent tasks. Each example writes full page inputs or bulky reports to local artifacts with `--out` and `--artifact-dir` instead of flooding stdout.

The fixtures under `examples/fixtures/` are intentionally small and synthetic. They are not scraped from private sites. `npm run check:examples-gallery` exercises the same shared extraction helpers against those fixtures so examples stay tied to real behavior.

## Article

Use this when a page looks like a news post, blog post, or documentation article and you need a compact title, author, date, headings, summary, and source URL.

```bash
node ./bin/chrome-bridge.mjs extract --preset article \
  --out /tmp/chrome-bridge-article.json \
  --artifact-dir /tmp/chrome-bridge-artifacts
```

The preset reads text plus HTML, stores the raw inputs locally, and returns only schema metadata, artifact paths, counts, and diagnostics in stdout.

Fixture: `examples/fixtures/article-news.html`.

## Product Page

Use this when a page looks like a product, integration, package, extension listing, or SaaS feature page and you need a compact product name, SKU, availability, price hints, download links, and source URL.

```bash
node ./bin/chrome-bridge.mjs extract --preset product-page \
  --out /tmp/chrome-bridge-product.json \
  --artifact-dir /tmp/chrome-bridge-artifacts
```

The fixture includes schema.org JSON-LD because real product pages often expose canonical SKU, offer, and availability data outside visible text.

Fixture: `examples/fixtures/product-page.html`.

## Pricing Table

Use this when a page has pricing plans in a table or card layout and you need bounded plan names, prices, features, currency hints, and source URL.

```bash
node ./bin/chrome-bridge.mjs extract --preset pricing-table \
  --out /tmp/chrome-bridge-pricing.json \
  --artifact-dir /tmp/chrome-bridge-artifacts
```

The preset supports conventional tables and common pricing-card markup. Keep the artifact and inspect it with `read-artifact` or `jq` before deciding whether another custom preset is warranted.

Fixture: `examples/fixtures/pricing-table.html`.

Related fixture: `examples/fixtures/pricing-linear.html` covers real-world pages where plan names, prices, and features are exposed as sequential visible text rather than table/card markup.

## Download Discovery

Use this before clicking export buttons or attempting browser downloads. The command inspects page HTML/text, reports candidate links and export controls, and does not click, download, or fetch candidate URLs.

```bash
node ./bin/chrome-bridge.mjs download-discovery \
  --out /tmp/chrome-bridge-downloads.json \
  --artifact-dir /tmp/chrome-bridge-artifacts
```

The result includes candidate counts, top links, top actions, selector hints, and safety metadata. Treat it as a planning step before any confirmed mutation.

Fixture: `examples/fixtures/downloads.html`.

## Confirmed Download

Use this after `download-discovery`, `observe`, or `find-elements` has already identified the exact export control you want. The command clicks one confirmed selector, waits for exactly one browser download, and returns only local file metadata.

```bash
node ./bin/chrome-bridge.mjs download \
  --selector "[data-testid='export-xlsx']" \
  --confirm \
  --download-timeout-ms 45000
```

The result is intentionally metadata-first: local path, file name, extension, byte counts, and timing. It does not inline raw download URLs or file contents.

Fixture: `examples/fixtures/downloads.html`.

## Lighthouse Ingest

Use this after Lighthouse has already produced a local JSON report. Chrome Bridge does not run Lighthouse here; it ingests a local report and emits scores plus a bounded list of failing audits.

```bash
node ./bin/chrome-bridge.mjs lighthouse-ingest \
  --report /tmp/lighthouse-report.json \
  --out /tmp/chrome-bridge-lighthouse-summary.json
```

The raw Lighthouse report stays at `reportPath`; stdout and the summary artifact omit bulky audit payloads by default.

Fixture: `examples/fixtures/lighthouse-report.json`.

## MCP Client Config Files

Use these when you want checked-in installable templates instead of regenerating a snippet every time:

- `examples/mcp-clients/claude-code.mcp.json`
- `examples/mcp-clients/cursor.mcp.json`
- `examples/mcp-clients/codex.config.toml`
- `examples/mcp-clients/vscode.mcp.json`
- `examples/mcp-clients/windsurf.mcp.json`
- `examples/mcp-clients/hermes.config.yaml`
- `examples/mcp-clients/generic.mcp.json`

Replace `/absolute/path/to/codex-chrome-bridge` with the real local repository path before using them. Cursor and Windsurf stay on `core`; the generic stdio template stays on `read`.

## Verification

```bash
npm run check:examples-gallery
npm run check:client-config-examples
```

These checkers validate the examples gallery, fixtures, checked-in client templates, package exposure, metadata-first output expectations, and fixture-backed extraction behavior.
