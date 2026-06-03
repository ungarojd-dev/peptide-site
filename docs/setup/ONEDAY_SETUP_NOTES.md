# Oneday Compounds Setup Notes

Changed files:

- `netlify/functions/oneday-products.js`
- `netlify/functions/all-products.js`
- `index.html`
- `glp-weight-loss.html`
- `vendors.html`
- `faq.html`
- `llms.txt`

Netlify environment variables needed:

- `ONEDAY_CK`
- `ONEDAY_CS`
- `ONEDAY_BASE_URL` set to `https://onedaycompounds.net`
- `ONEDAY_AFFILIATE_URL` set to `https://onedaycompounds.net/?ref=subileue`

Customer discount:

- Oneday Compounds is configured as 10% off for after-code pricing.
- The public affiliate URL uses `ref=subileue`.
- API credentials are only referenced through Netlify environment variables and are not included in public frontend files.

Deploy checklist:

1. Add the four environment variables in Netlify.
2. Upload these files to GitHub.
3. Let Netlify redeploy.
4. Test `/.netlify/functions/oneday-products` after deploy.
5. Test `/.netlify/functions/all-products` and confirm Oneday appears in the `vendors` array.
6. On the homepage, filter Vendor to Oneday Compounds and confirm products render.
7. On the GLP page, filter Vendor to Oneday Compounds and confirm GLP products render if their API returns matching products.


## Feed filtering

Shipping protection, package insurance, and gift card style add-on products are intentionally filtered out of the Oneday feed so they do not appear as comparison products.
