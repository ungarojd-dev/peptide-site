MyPeptidePrice giveaway visibility and background null-guard patch

Changes:
- Makes the active Southern Aminos giveaway the first rolodex slide while it is active.
- Updates the giveaway wording: three winners, each receives $300 in store credit and one white 10-slot vial case.
- Bumps the promotions fetch cache key to promotions-v2 so browsers load the updated deal data immediately.
- Includes the first-run background refresh null-state guard.

No catalog refresh is required for the giveaway display change. A catalog refresh is still recommended after deploy to verify the background worker.
