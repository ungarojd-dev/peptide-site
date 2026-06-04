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
The browser loads a bundled catalog fallback immediately and requests one cached endpoint: `/.netlify/functions/catalog-snapshot`. A scheduled function refreshes all vendor feeds every 15 minutes, groups comparable products, and writes the latest snapshot to Netlify Blobs. A failed vendor retains its previous successful rows or its bundled fallback rows.

## Protected diagnostics
Open `/catalog-status` after deployment. Enter the private `CATALOG_REFRESH_TOKEN` value to inspect feed status or run a manual refresh.

## Local validation
Run:

```bash
npm install
npm test
```
