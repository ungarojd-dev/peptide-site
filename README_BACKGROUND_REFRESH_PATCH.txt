MyPeptidePrice.com background catalog refresh patch

Purpose
- Moves slow vendor API refresh work out of the 30-second scheduled-function window.
- Adds catalog-refresh-background.mjs as a Netlify Background Function.
- Keeps the existing 15-minute scheduled trigger, but it now queues the background function and exits quickly.
- Changes the protected Refresh now button into a quick trigger that starts the background job and returns HTTP 202 immediately.
- Adds refresh-status storage in Netlify Blobs.
- Updates /catalog-status so it polls automatically and shows queued, running, complete, or error state.
- Preserves the previous successful snapshot if a new refresh fails.

Deploy
Upload the patch contents into the root of the existing GitHub repository and replace matching files. Netlify will deploy the new background function automatically.

After deployment
1. Open https://mypeptideprice.com/catalog-status
2. Enter the private CATALOG_REFRESH_TOKEN.
3. Click Refresh now once.
4. Leave the page open while it polls automatically.
5. Confirm refresh_status.state becomes complete.
