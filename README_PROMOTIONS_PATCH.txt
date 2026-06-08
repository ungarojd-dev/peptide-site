MyPeptidePrice active promotions patch

Added:
- data/promotions.json as the single source of truth for active deals
- sticky current-deals rolodex fed from promotions.json
- View all active deals modal with full promotion terms
- compact promotion badges inside matching comparison-card vendor rows
- vendor-directory promotion badges
- automatic start and end dates for Southern giveaway windows and the Mile High boosted SAMMYC promotion
- temporary Mile High 20% SAMMYC after-code calculation from June 8 through June 14
- Solyn standard SAMMYC estimate updated to 10% based on current partner terms

After deployment, run Refresh now once from /catalog-status so the stored snapshot reflects the Mile High promotional rate and Solyn adjustment.
