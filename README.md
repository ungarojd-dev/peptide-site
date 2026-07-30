# MyPeptidePrice.com deployment and maintenance guide

## What this repo contains
This repository is the live static site for MyPeptidePrice.com. It includes the public HTML pages, shared frontend assets, catalog configuration, Netlify Functions, the bundled fallback catalog, and maintenance scripts.

The site is intentionally framework-free: static HTML, CSS, vanilla JavaScript, Netlify Functions, and Netlify Blobs.

## Deploying updates
Upload the replacement files to the root of the GitHub repository connected to Netlify, then commit to `main`. Netlify deploys the static files and bundles the functions automatically.

For a complete rebuild, replace the visible repo contents locally while keeping the hidden `.git` folder intact, then commit and push through GitHub Desktop.

## Deploy-time catalog build

Every Netlify deploy runs, in order:

```
node scripts/build-promotions.mjs
node scripts/build-catalog-live.mjs
node scripts/build-catalog-seo.mjs
node scripts/build-programmatic-pages.mjs
```

`build-catalog-live.mjs` pulls the live vendor feeds and writes
`data/catalog-fallback-snapshot.json`, so the bundled snapshot and all generated
static pages ship with real product deep links and the full vendor roster. There
is no manual snapshot step.

It never fails the build. If fewer vendors load than expected, or every feed
fails, it keeps the committed snapshot and logs a warning, because a stale but
complete snapshot beats a fresh partial one baked into 100+ pages.

Build environment variables, all optional:

- `SKIP_CATALOG_LIVE=1` bypass the live pull and use the committed snapshot
- `CATALOG_ALLOW_MISSING` comma-separated vendor names permitted to be absent
- `CATALOG_MIN_VENDORS` override the minimum vendor count

The build log reports the deep-link rate. Solyn Labs and Oneday Compounds are
intentionally held on base URLs, so roughly 90 base URLs is expected. A drop to
zero deep links means the `use_product_deep_links` flags are not being read.

`scripts/build-catalog-fallback.mjs` is NOT in the deploy chain. It rebuilds from
the committed seed, which has no product URLs and only 14 vendors, and would
revert every static page to base affiliate URLs. Use `npm run build:fallback:seed`
only for offline engine testing.

## Required Netlify environment variables
- `GLACIER_CK`
- `GLACIER_CS`
- `ION_CK`
- `ION_CS`
- `SOUTHERN_CK`
- `SOUTHERN_CS`
- `FLAWLESS_CK`
- `FLAWLESS_CS`
- `GLOW_CK`
- `GLOW_CS`
- `AURORA_CK`
- `AURORA_CS`
- `MILEHIGH_CK`
- `MILEHIGH_CS`
- `SOLYN_CK`
- `SOLYN_CS`
- `ONEDAY_CK`
- `ONEDAY_CS`
- `ONEDAY_BASE_URL`, optional
- `ONEDAY_AFFILIATE_URL`, optional
- `CATALOG_REFRESH_TOKEN`, private random value for the protected diagnostics page and manual refresh endpoint

Instant Peptides and LabSourced Peptides use public JSON feeds and do not require credentials.

## Catalog runtime design
The browser loads a bundled catalog fallback immediately and requests one cached endpoint:

```text
/.netlify/functions/catalog-snapshot
```

A short scheduled trigger runs every 15 minutes and queues a Netlify Background Function. The background worker refreshes all vendor feeds, groups comparable products, and writes the latest snapshot to Netlify Blobs. Slow vendor APIs do not block visitors from loading the homepage.

If a vendor feed fails, the refresh retains that vendor's previous successful rows, or its bundled fallback rows when needed. The prior working public snapshot stays live while a new refresh is running.

## Protected diagnostics
Open:

```text
/catalog-status
```

Enter the private `CATALOG_REFRESH_TOKEN` value to inspect feed status or queue a manual background refresh. The page polls automatically while a refresh is queued or running.

Expected refresh states:

```text
queued
running
complete
error
```

## Promotions
Current vendor promotions are controlled from:

```text
data/promotions.json
```

The homepage and GLP landing page use that file for the rotating vendor-deals rolodex, the all-deals panel, and vendor-row deal badges. Date-limited offers automatically appear and expire according to their configured windows.

Promotion percentages are disclosure-only and do not alter catalog price calculations. Vendor feeds supply the current source price, which may already reflect a sale, and the catalog applies only the standing `SAMMYC` rate from `data/vendor-config.json`. Applicable vendor rows show only a generic `Sale live` pill. Sale percentages, bundle wording, boosted rates, and first-order offers are not shown on catalog cards.

## Affiliate URL rules
Vendor affiliate routing is controlled from:

```text
data/vendor-config.json
```

Product-card links currently use confirmed base affiliate URLs while partner-level product deep-link tracking is verified. Each vendor can later be switched back to product deep links independently.

## VANTYX Supply banner
The homepage includes a compact VANTYX Supply banner below the hero. It is intentionally separate from the peptide comparison catalog because VANTYX is a lab and research supply partner rather than a peptide vendor. The banner promotes code `SAMMYC` for 10% off.

## Compliance gate
The public site includes a session-based research-use acceptance gate. Visitors must accept it once per browser session before accessing the public site. Legal pages remain accessible for review.

## Local validation
Run:

```bash
npm install
npm test
```

The validation suite checks catalog grouping, explicit exclusions, silent drops, HTML references, and local build integrity.
