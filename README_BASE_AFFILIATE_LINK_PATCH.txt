MYPeptidePrice base affiliate URL patch

Purpose
- Force all comparison-card clickouts to use the exact vendor-approved base affiliate URLs.
- Keep direct product URLs available internally so they can be re-enabled vendor-by-vendor after written confirmation.

Changed files
- data/vendor-config.json
- netlify/functions/_shared/catalog-engine.mjs
- data/catalog-fallback-snapshot.json

After upload
1. Wait for Netlify to publish.
2. Open /catalog-status.
3. Enter the private refresh token.
4. Click Refresh now once.
5. Spot-check comparison-card clickouts.

Future deep-link re-enable
- In data/vendor-config.json, set use_product_deep_links to true only for vendors that confirm attribution works on direct product links.
- Deploy and refresh the snapshot once.
