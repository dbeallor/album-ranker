# As-built: smarter import matching and a dependable import review page

**Shipped:** in PR #52
**Ticket:** ALBUM-49
**Spec:** [2026-11-22-album-49-import-matching.md](../specs/2026-11-22-album-49-import-matching.md)

## Differs from the spec

- The spec says a repeat click redirects to `?done=<id>`. It redirects to `?done=<id>&already=1`, because the stored item status can't tell a repeat click from a first one.
- The spec says the status message says "Added" or "Moved". The schema doesn't record which, so the action adds `moved=1` to the redirect (`?done=<id>&moved=1`) when `resolveReviewItem` reports a `movedFromYear`, and the page reads it. A reload keeps the same text because the URL keeps the flag. There is no difference from the spec on this now.
- The spec's "close" title rule also treats titles that differ only by separators ("Getz/Gilberto" vs "Getz / Gilberto") as close, and the artist word check ignores "and" (so "&" and "/" collaborations compare equal).
- When the last open item is handled, the fragment points at the last remaining open item, and there is none when nothing is left.
- The `done` message is a success tone for added, moved and skipped, and info for already handled.
- The close-match rules are stricter than the spec's first draft: a typo is one word one edit off (never a word with a digit or a roman numeral, so "Vol. 2" and "Vol. 3" or "II" and "III" are not close), and an artist name inside a longer one is close only when the shorter has 2 or more words besides "the" and "and" ("Prince" is not close to "Prince Buster").
- The ladder stops early only on a result whose title and artist are both exact. A close result (a reissue such as "X: Deluxe") keeps it searching, and the choice is made over everything gathered. A failed catalog request keeps the answers of the steps already done for that row, so a retry repeats only the failed step.
- The review page's default search can take up to about 4 sequential catalog requests (about 4.4 s uncached, at 1.1 s between requests).
- In the artist-and-title fields query the artist's "the" and "and" are left out (unless nothing else is left), so one of them can't match any artist.
