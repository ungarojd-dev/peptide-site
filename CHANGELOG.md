# Changelog

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

