# As-built: Update the app UI for the library and analytics flow

**Shipped:** in PR #TBD
**Ticket:** ALBUM-38
**Spec:** [2026-11-22-album-38-library-analytics-ui.md](../specs/2026-11-22-album-38-library-analytics-ui.md)

## Differs from the spec

- On the library page, Apply sits below the Filters `<details>`, not directly under Sort by and Direction. With Filters open, Apply above it would be out of reach without scrolling back up. It is still always visible and full width on a phone.
- The Direction select's first option reads "Default", not "Default for this sort", which was clipped at 375px.
- The library form has five named fields (`sort`, `dir`, `q`, `scope`, `played`), not six.
- `playwright.config.ts` clears `test-results/db` before the app starts, so each e2e run begins with an empty database. The new click-through adds albums and ran out of stub albums on repeated runs otherwise.
- The "View library" and "Play matchups" links sit in a `Cluster` inside the added message.
