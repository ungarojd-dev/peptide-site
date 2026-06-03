# Catalog engine v4 preview checklist

Deploy this ZIP to a GitHub test branch and open the Netlify Deploy Preview before merging to main.

## Required checks

1. Homepage loads cards immediately from the static fallback.
2. Live snapshot replaces or supplements fallback cards after acceptance.
3. Search for `RETA`, `Retatrutide`, `ION-3R`, and `PEP-RT`.
4. Click the homepage `Reta` shortcut and confirm the Peptide RT card appears.
5. Confirm Glow Aminos and Flawless Compounds display individual RETA size variations when their WooCommerce APIs provide them.
6. Click `Sema` and `Tirz` and confirm shorthand variants group correctly.
7. Confirm blends remain separate cards, including TRZ + RT and Cagri combinations.
8. Check the compact sticky mobile filter dock on a phone-sized viewport.
9. Open `/glp-weight-loss.html` and repeat the Sema, Tirz, and Reta checks.
10. Open `/catalog-debug.html` and review vendor counts and uncategorized rows.

## Failure behavior check

The catalog should still display the stable snapshot if the optional enrichment request fails. The enrichment layer must never blank the product grid.
