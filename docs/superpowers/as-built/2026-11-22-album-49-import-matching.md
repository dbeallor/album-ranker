# As-built: smarter import matching and a dependable import review page

**Shipped:** in PR #52
**Ticket:** ALBUM-49
**Spec:** [2026-11-22-album-49-import-matching.md](../specs/2026-11-22-album-49-import-matching.md)

## Differs from the spec

- The spec says a repeat click redirects to `?done=<id>`. It redirects to `?done=<id>&already=1`, because the stored item status can't tell a repeat click from a first one.
- The spec says the status message says "Added" or "Moved". The schema doesn't record which, so the page infers "Moved" when the library entry is more than 1 second older than the item's last update.
- The spec's "close" title rule also treats titles that differ only by separators ("Getz/Gilberto" vs "Getz / Gilberto") as close, and the artist word check ignores "and" (so "&" and "/" collaborations compare equal).
- When the last open item is handled, the fragment points at the last remaining open item, and there is none when nothing is left.
- The `done` message is a success tone for added, moved and skipped, and info for already handled.
