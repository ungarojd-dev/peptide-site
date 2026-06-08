BACKGROUND REFRESH TRIGGER REPAIR + SOUTHERN GIVEAWAY COPY UPDATE

Changes:
- Explicitly declares catalog-refresh-background as a Netlify Background Function in netlify.toml.
- Uses the active deployed request origin when invoking the worker.
- Stores a visible error state if worker invocation fails.
- Updates the catalog-status helper text for the first tracked run.
- Corrects Southern Aminos giveaway wording for both June 8-12 and June 15-19 windows.

After deploy:
1. Open /catalog-status
2. Enter the private CATALOG_REFRESH_TOKEN
3. Click Refresh now once
4. Wait for queued, running, then complete
5. Click Inspect diagnostics if needed

The prior successful snapshot remains live while a refresh is running or if a new refresh fails.
