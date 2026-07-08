# MyPeptidePrice.com deployment and maintenance guide

## What this repo contains
This repository is the live static site for MyPeptidePrice.com. It includes the public HTML pages, shared frontend assets, catalog configuration, Netlify Functions, the bundled fallback catalog, and maintenance scripts.

The site is intentionally framework-free: static HTML, CSS, vanilla JavaScript, Netlify Functions, and Netlify Blobs.

## Deploying updates
Upload the replacement files to the root of the GitHub repository connected to Netlify, then commit to `main`. Netlify deploys the static files and bundles the functions automatically.

For a complete rebuild, replace the visible repo contents locally while keeping the hidden `.git` folder intact, then commit and push through GitHub Desktop.

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

## Affiliate URL rules
Vendor affiliate routing is controlled from:

```text
data/vendor-config.json
```

Product-card links currently use confirmed base affiliate URLs while partner-level product deep-link tracking is verified. Each vendor can later be switched back to product deep links independently.


## Compliance gate
The public site includes a session-based research-use acceptance gate. Visitors must accept it once per browser session before accessing the public site. Legal pages remain accessible for review.

## Local validation
Run:

```bash
npm install
npm test
```

The validation suite checks catalog grouping, explicit exclusions, silent drops, HTML references, and local build integrity.
