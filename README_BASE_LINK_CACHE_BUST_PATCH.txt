MyPeptidePrice base affiliate link cache-bust patch

Purpose:
- Forces homepage and GLP page to request a new catalog-ui asset version.
- Forces the catalog UI to request a new edge-cache key for both the bundled fallback and Netlify Blob snapshot.
- This prevents the previous deep-link snapshot from replacing the newly rebuilt base affiliate URLs while the older CDN object is still cached.

Upload files:
- index.html
- glp-weight-loss.html
- assets/catalog-ui.js

After deploy, reload the homepage. A catalog refresh is not required if Refresh now was already run after the base-link patch.
