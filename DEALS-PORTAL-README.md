# Deals Portal

Manage every vendor deal from a form at /admin. No code, no zip files.

## What's included

- admin/index.html      the /admin page that loads the editor
- admin/config.yml      the form definition + login wiring
- data/deals.json       the simple deal source you edit
- scripts/build-promotions.mjs  expands deals into the file the site reads

## SETUP (do these once)

You already have Netlify Identity enabled and your user added, so login is done.
Two things remain:

### 1. Turn on Git Gateway
This lets the /admin editor commit to your repo using your Identity login.
- Go to app.netlify.com, your mypeptideprice site
- Identity, then Services (or "Configuration and usage")
- Find "Git Gateway" and click Enable
- (It connects Identity to your GitHub repo. One click.)

### 2. Add the build step
So edits actually expand and go live:
- Netlify, Project configuration, Build & deploy, Build command, Edit
- Add to the FRONT of the existing command:
  node scripts/build-promotions.mjs &&
- Save

Then deploy this zip once. Setup is complete forever.

## USING IT

1. Go to mypeptideprice.com/admin
2. Log in (your Netlify Identity email)
3. Click Deals & Promotions, then All Deals
4. To add: click the + on the Deals list, fill the form, click Publish
5. To end early: open the deal, set End date to today, Publish (or delete it)
6. Live in ~2 minutes, everywhere at once

## DEAL TYPES (cheat sheet)

- Normal stacking sale (Glow "40% + SAMMYC 15%"):
  type Sitewide sale, sale percent 40, code percent 15
- Flat sale, no stacking (Mile High "34% with any code"):
  type Sitewide sale, FLAT RATE 34, leave sale/code blank
- GLP-only sale: as above, set Limit to categories = GLP-1 & Incretin
- First-order code (Coffee NEWCOFFEE20): type First order, code NEWCOFFEE20

## SAFETY

If a deal is malformed (no vendor, bad type), the build fails and the bad
deal never goes live. You'll see a failed deploy in Netlify, not a broken site.

## WHAT STILL NEEDS CODE (rare)

- A brand-new deal type the site has never shown
- Changes to how discounts stack or price (engine logic)

Everything else is self-serve here.
