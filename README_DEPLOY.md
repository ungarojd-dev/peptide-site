# MyPeptidePrice.com clean deploy package

## Deploy
Upload the contents of this folder to the root of the GitHub repository connected to Netlify. Netlify will deploy the static files and bundle the functions automatically.

## Required Netlify environment variables
- GLACIER_CK
- GLACIER_CS
- ION_CK
- ION_CS
- SOUTHERN_CK
- SOUTHERN_CS
- FLAWLESS_CK
- FLAWLESS_CS
- GLOW_CK
- GLOW_CS
- MILEHIGH_CK
- MILEHIGH_CS
- SOLYN_CK
- SOLYN_CS
- ONEDAY_CK
- ONEDAY_CS
- ONEDAY_BASE_URL, optional
- ONEDAY_AFFILIATE_URL, optional
- CATALOG_REFRESH_TOKEN, create a private random value for the protected status page and manual refresh endpoint

Instant Peptides and LabSourced Peptides use public JSON feeds and do not require credentials.

## Runtime design
The browser loads a bundled catalog fallback immediately and requests one cached endpoint: `/.netlify/functions/catalog-snapshot`. A short scheduled trigger runs every 15 minutes and queues a Netlify Background Function. The background worker refreshes all vendor feeds, groups comparable products, and writes the latest snapshot to Netlify Blobs without being constrained by the 30-second scheduled-function limit. A failed vendor retains its previous successful rows or its bundled fallback rows.

## Protected diagnostics
Open `/catalog-status` after deployment. Enter the private `CATALOG_REFRESH_TOKEN` value to inspect feed status or queue a manual background refresh. The page polls automatically while a refresh is queued or running.

## Local validation
Run:

```bash
npm install
npm test
```

## Summer sales rolodex and affiliate URL rules

The homepage and GLP landing page include a compact rotating vendor-deals rolodex powered by `data/promotions.json`. Product-card links currently use the confirmed base affiliate URLs in `data/vendor-config.json` while product-level affiliate tracking is verified with partners. Each vendor can later be switched back to product deep links independently.
