# Solyn Labs setup notes

This update adds Solyn Labs as a live API vendor without storing API secrets in the repo.

## Netlify environment variables to add

In Netlify, go to Site configuration, Environment variables, then add:

- SOLYN_CK
- SOLYN_CS

Use the Consumer Key and Consumer Secret provided by Solyn Labs.

## Files changed

- index.html, adds Solyn to the sale bar, vendor dropdown, discount config, and live feed list.
- vendors.html, adds Solyn Labs as a tracked vendor.
- faq.html, adds Solyn Labs to the discount list.
- glp-weight-loss.html, adds Solyn Labs to GLP vendor filtering and loads Solyn GLP products from the live feed.
- netlify/functions/solyn-products.js, fetches and normalizes Solyn WooCommerce products.
- netlify/functions/all-products.js, includes Solyn in the combined product feed.

## Test after deploy

Open these URLs after Netlify redeploys:

- /.netlify/functions/solyn-products
- /.netlify/functions/all-products

If Solyn returns a 500 error, the most likely issue is missing Netlify environment variables or Solyn needing to whitelist Netlify outbound requests.
