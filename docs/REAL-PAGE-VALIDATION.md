# Real Page Validation

Last updated: 2026-06-12

This note records representative public-page validation for the metadata-first examples and structured extraction presets. The goal is to tune only repeatable gaps that show up on real pages, then capture those gaps as local fixtures.

## 2026-06-12 Pass

Commands used the installed Chrome Bridge copy against public pages in the user's real Chrome, with outputs under `/tmp/chrome-bridge-real-pages-20260612/`.

| Surface | Public page | Result |
| --- | --- | --- |
| `extract --preset article` | `https://web.dev/articles/vitals` | Passed. Extracted title, published date, headings, summary, canonical URL, and artifact paths. |
| `extract --preset product-page` | `https://www.npmjs.com/package/playwright` | Passed as a package/product-like page. Extracted title and canonical URL; SKU/availability/price/downloads were correctly absent. |
| `extract --preset pricing-table` | `https://www.browserless.io/pricing` | Found a repeatable gap: the page exposes pricing plans as sequential visible text instead of table/card markup. |
| `download-discovery` | `https://nodejs.org/en/download` | Passed. Returned bounded candidate/action counts and local artifacts without clicking or fetching candidate URLs. |

## Fixture-Backed Tuning

The Browserless-style pricing gap is now captured by `examples/fixtures/pricing-linear.html` and `npm run check:examples-gallery`.

The tuning adds a bounded text-only pricing fallback that:

- Extracts sequential plan names, split prices such as `$25` plus `/month`, custom enterprise pricing, and nearby feature lines.
- Stops scanning a candidate when CTA/label boundaries such as `Buy Now` or `Popular option` appear before a price.
- Avoids adding a new preset because the existing `pricing-table` schema is still the right shape.

## Current Decision

No new preset is justified yet. The real-page pass only found a repeatable layout gap inside an existing preset. Continue adding examples and fixtures when real pages expose stable, repeated schema needs.
