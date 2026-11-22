# As-built: add albums to the library and run matchups over all of it

**Shipped:** in PR #PR
**Ticket:** ALBUM-35
**Spec:** [2026-11-21-album-35-add-albums-library.md](../specs/2026-11-21-album-35-add-albums-library.md)

## Differs from the spec

- The spec puts "It has no matchups." on the confirmation page's second line. Shipped: the second line is always `<artist> · <year> · N matchups` (so "0 matchups"), and "It has no matchups." appears in the body sentence.
- The spec says removing an album that is not in the library fails with "That album isn't in your library." The service does return that message, but the action then redirects to `/library` without showing it (the confirmation page would 404 for that album). A stale matchup count does show its message on the confirmation page.
- The spec's proof lists screenshots of each step on a ticket preview. None were taken; the PR's `Not proven` says so.
