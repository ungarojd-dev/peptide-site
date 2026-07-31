# Files the admin portal owns

These two are edited at `/admin` and change independently of code:

    data/deals.json
    data/giveaways.json

Anything edited in the portal is committed straight to the repo by Decap. A code
package built from an older checkout therefore contains stale copies, and
unzipping it over the repo silently reverts every deal and giveaway added since.

That has already happened once, wiping an Aurora sale and giveaway.

## Before applying any code package

Check whether these two files changed in the portal since the package was built.
If they did, keep the repo's copies rather than the ones in the zip:

1. Unzip the package somewhere separate, not straight over the repo.
2. Copy everything across EXCEPT `data/deals.json` and `data/giveaways.json`.
3. Only take those two when the package was built specifically to change them.

## Rule of thumb

Code packages should not carry these files at all unless the change is about
them. When they are included, the package notes should say so explicitly and
say what they contain.
