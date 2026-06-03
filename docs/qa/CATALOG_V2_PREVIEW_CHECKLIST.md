# Catalog V2 Preview Checklist

The live homepage remains separate. Test the parallel preview at `/catalog-v2.html`.

## Required checks

1. Open `/catalog-v2.html` and confirm cards render even if optional enrichment fails.
2. Search `Retatrutide`, `RETA`, `ION-3R`, and `PEP-RT`.
3. Search `Semaglutide`, `SEMA`, and `PEP-SM`.
4. Search `Tirzepatide`, `TIRZ`, `PEP-TZ`, and `PEP-TRZ`.
5. Confirm blends remain separate cards.
6. Confirm the mobile dock searches and resets correctly.
7. Open `/catalog-v2-debug.html` after loading the preview.
8. Confirm `silent_drops` is `0`.
9. Review `visible_unmapped` rows and add aliases only where a raw vendor name should roll into an existing canonical family.
10. Do not replace the production homepage until the preview is approved.
