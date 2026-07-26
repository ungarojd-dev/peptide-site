# Deals Portal

A no-code way to manage every vendor deal on the site, the same way the blog
admin works. You edit one simple form; the site updates everywhere.

## How it flows

1. You open `/admin` and edit deals in the **Deals & Promotions** collection.
2. Publishing commits `data/deals.json` to GitHub.
3. Netlify rebuilds and runs `scripts/build-promotions.mjs`, which expands your
   simple entries into the full `data/promotions.json` the site reads.
4. The announcement strip, deal carousel, row labels, and Today's Deals roundup
   all update from that one file. You never edit `promotions.json` by hand.

## One-time setup

**1. Merge the collection into your Decap config.**
Open your existing `/admin/config.yml` (the one powering the blog) and add the
`deals` collection from `admin/deals-config.yml` under its `collections:` list.

**2. Add the expander to the Netlify build command**, BEFORE the fallback build:

```
node scripts/build-promotions.mjs && node scripts/build-catalog-fallback.mjs && node scripts/build-catalog-seo.mjs && node scripts/build-programmatic-pages.mjs
```

If a deal is malformed (missing vendor, unknown type), `build-promotions.mjs`
exits non-zero and **the deploy fails safely** rather than pushing bad data.

## Adding a deal (the common cases)

**A normal stacking sale** ("40% off, SAMMYC stacks 15%"):
type `Sitewide sale`, headline `40% off sitewide`, sale percent `40`, code
percent `15`, set start/end dates, tick the surfaces under "Show in".

**A flat sale that does NOT stack** (Mile High "34% off with any code"):
type `Sitewide sale`, headline `34% off`, **flat rate** `34`, leave sale/code
percent blank.

**A category-limited sale** (GLP-only weekend):
as above, then set **Limit to categories** to `GLP-1 & Incretin`.

**A first-order code** (Coffee & Peppers):
type `First order`, code `NEWCOFFEE20`.

**Ending a deal early:** set its end date to today (or delete the entry).

## What still needs code (rare)

- A brand-new **deal type** the site has never shown.
- Changes to how discounts **stack or price** (that logic lives in the engine).

Everything else, adding/editing/ending deals, changing dates, moving a deal
between surfaces, is fully self-serve here.
