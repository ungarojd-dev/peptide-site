# Changelog

## 2026-07-14, v3 rebrand, full sitewide presentation rebuild

Dark theme, mobile-first, on the v3 brand system.

**Approach.** Rebuilt on top of `main`, not on the `v3-rebrand` branch. Main's catalog
behavior is proven in production, so `site.js` and `catalog-ui.js` are untouched and only
the presentation layer changed. All of main's current data and business decisions carry
over unchanged (VANTYX removal, current promotions, complete redirects and sitemap, Mile
High display name). The v3 branch's catalog JS/CSS rewrite was discarded; its brand assets
were kept.

**Brand.**
- Tokens rewritten to the exact guideline values. Every color on the v3 branch was
  off-spec (olive was `#4E5D3C`, should be `#6A7929`) and has been corrected.
  Jet Black `#0D0F0C`, Olive `#6A7929`, Cream White `#F4F1E8`, Graphite Olive `#2E3320`,
  Sand Olive `#8C9271`, Forest Green `#1D3A2B`.
- Typography moved from Playfair Display + Nunito to Manrope (display) + Inter (body).
- Real logo assets now in use. The header previously faked the wordmark with styled text
  spans; it now uses `logo-symbol.png` and `logo-wordmark.png`.
- Favicons, `site.webmanifest`, and OG image replaced with the rebrand set.
- `theme-color` meta added sitewide so mobile browser chrome renders dark.

**Accessibility.**
- Olive on Jet Black measures about 4.0:1, which fails WCAG AA for body text. Olive is
  therefore accent-only: borders, large headings, active states, price emphasis. Secondary
  text uses Sand Olive, about 5.9:1, which passes AA.
- 44px minimum tap targets. Visible keyboard focus. Reduced motion respected.

**Fixes made during the rebuild.**
- Out-of-stock leading offer: `catalog-ui.js` sorts suppliers purely on price and does not
  push out-of-stock rows to the bottom, so the cheapest row can be unbuyable. The "Lowest"
  treatment is now withheld when the top row is out of stock or has no price. CSS-only, no
  JS change.
- The vendor logo on `vendors.html` had no size constraint and was pushing card content
  off-screen at mobile widths.
- Vendor names in the comparison ladder no longer truncate.
- The four price-comparison pages each embedded an identical copy of a light-theme
  `<style>` block referencing tokens that no longer exist. Removed and consolidated into
  `site.css`.

**Note.** `[hidden] { display: none !important; }` in `site.css` is load-bearing. `site.js`
toggles the compliance gate, disclaimer, and promo panel via the native `hidden` attribute.
Layout rules out-specify it and force those modals permanently open without this guard.

Verified: 17/17 pages render with zero horizontal overflow at 390px.

## 2026-07-07, Removed VANTYX Supply partner banner

- Removed the VANTYX Supply homepage banner section, its click-tracking handler, and all related CSS.
- VANTYX Supply is no longer promoted anywhere on the site.

## 2026-06-19, Glacier Father's Day promo QA fix

- Corrected the live promotions data file for Glacier Aminos from 10% off to 15% off.
- Updated the promotion cache buster so the homepage carousel pulls the corrected `/data/promotions.json` payload.

## 2026-06-19, Glacier Father's Day promo update

- Updated Glacier Aminos Father's Day promotion from 10% off sitewide to 15% off sitewide.
- Kept the SAMMYC stackable discount language and the additional Zelle stackable 10% off note.
- Bumped promotion cache buster so the updated deal copy loads after deployment.


- Replaced vendor logos with the optimized uploaded WebP logo set and added the VANTYX Supply logo to the homepage banner.
## June 2026
- Corrected the standard Glacier Aminos `SAMMYC` estimate from 5% to 10% across comparison pricing and the vendor directory.
- Rebuilt the catalog around one stored snapshot instead of visitor-time vendor API fan-out.
- Added direct adapters for the tracked vendor APIs with stale-row fallback protection.
- Added background catalog refresh processing, manual refresh controls, refresh status polling, and overlap protection.
- Added base affiliate URL routing while product-level deep-link attribution is verified with partners.
- Added a session-based research-use compliance gate and full disclaimer page.
- Restored the sticky mobile vendor-deals rolodex and swipeable mobile category filters.
- Added data-driven promotions, a full active-deals panel, vendor-row promo badges, and scheduled Southern Aminos giveaway windows.
- Added the compact VANTYX Supply homepage banner with code `SAMMYC` for 10% off lab and research supplies.
- Consolidated deployment notes into one maintenance guide and removed one-off patch README files.
- Added Glacier Aminos June 12 through June 19 rolodex-only stackable promotion.

## 2026-06-15

- Relaxed catalog exclusions so product-like listings such as raw peptide, topical, nasal, cosmetic peptide, KSPTN, and Lemon Bottle rows are no longer filtered out.
- Kept only non-catalog exclusions such as shipping protection, product protection, gift cards, and merch.
- Bumped catalog cache keys so the relaxed exclusion rules are pulled after deploy.
## 2026-06-15

- Surfaced raw vendor listing names inside comparison rows so Glacier code names like GLA-1 SM, GLA-2 TRZ, and GLA-3 RT are visible under their canonical comparison cards.
- Mapped Glacier GLA-2.5 TRZ/RT listings to the Retatrutide and Tirzepatide blend card instead of the plain Tirzepatide card.

## 2026-06-16

- Updated product cards to open on an All listings view so each size and vendor listing is visible by default.
- Preserved individual vendor variation rows instead of collapsing every vendor down to one row per product size.
- Added visible size/listing labels inside vendor rows for Glacier and other variable products.