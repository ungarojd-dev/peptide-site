MyPeptidePrice.com compliance gate session patch

Changes:
- Revises the entry-gate layout to more closely match the requested acceptance-screen structure.
- Uses sessionStorage instead of localStorage. Visitors must accept again in each new browser session.
- Keeps acceptance active across reloads and same-tab navigation during the current session.
- Forces a new CSS and JavaScript cache version.

Upload the contents of the patch ZIP to the repository root and replace matching files.
