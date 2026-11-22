# Backfill replaces dead Cover Art Archive links with Deezer covers

**Status:** Shipped
**Shipped:** in PR #60, as specified
**Date:** 2026-11-22
**Ticket:** [ALBUM-59](https://github.com/dbeallor/album-ranker/issues/59)
**Follows:** [ALBUM-55 cover backfill](2026-11-22-album-55-cover-backfill.md), [ALBUM-48 album art fallback](2026-11-22-album-48-album-art-fallback.md)

## Goal

Before #48, every album was saved with its Cover Art Archive (CAA) `front-250` URL whether or not the archive had a cover. The user's library has 678 albums, all with such a link and none with a null cover, so `npm run backfill-covers` (#55) found nothing to do. Where the archive has no cover, the link is dead and the page shows the placeholder.

The backfill now also checks each stored CAA link. A dead one (CAA answers 404) is replaced by the Deezer cover for an album with the same title and artist, when Deezer has one. A link that works is never changed.

## How it runs

Same command, no flag: `npm run backfill-covers` now does both jobs in one run.

```
npm run backfill-covers
Checking 0 albums with no cover and 678 Cover Art Archive links in data/album-ranker.db
This makes about one request a second, so allow about 12 minutes.
Checked 25 of 678 albums
...
Missing covers
Filled:       0
Still none:   0   (no cover on CAA or a matching one on Deezer)
Failed:       0   (a lookup failed; run again to retry)
Skipped:      0   (no catalog id)

Cover Art Archive links
Checked:    678
Kept:       590   (the link works)
Replaced:    61   (dead link, now the Deezer cover)
Still dead:  22   (dead link, no matching cover on Deezer; left as it is)
Failed:       5   (a check failed; run again to retry)
Skipped:      0   (no catalog id, or not this album's own CAA link)
```

The numbers above are made up; nobody knows yet how many links are dead.

- `scripts/backfill-covers.ts` keeps its wiring and prints the two counts, the time estimate, progress and both summaries. Exit codes stay as #55: 0 when the run finishes, even with failed albums; 1 on an unexpected error.
- The logic stays in `lib/catalog/backfill-covers.ts`. `backfillCovers(db, deps)` runs the missing-cover pass as today and then the link pass, and returns both summaries.

## What the link pass does

1. **Pick the albums.** Every album whose `cover_url` is on the host `coverartarchive.org` (parsed, not prefix-matched, through the same URL check `isAllowedCoverUrl` uses), in id order. Covers on the Deezer CDN are never looked at.
2. **Skip what can't be checked.** An album with no `catalog_id`, or whose stored URL is not `https://coverartarchive.org/release-group/<its catalog id>/front-250`, is counted as **skipped** and gets no request. The check works from the catalog id, so it would be checking a different URL from the stored one.
3. **Check with the same lookup.** Call `lookupCover` from #55 with the album's catalog id, title and artist. That is one CAA `HEAD`, and on a plain 404 one Deezer search with the #48 title-and-artist match. No new matching rules and no change to `cover-art.ts`.
4. **Act on the answer.**
   - `found` with the CAA URL (CAA answered 2xx or 3xx): **kept**, nothing written.
   - `found` with a Deezer URL that passes `isAllowedCoverUrl`: **replaced**. The update is `UPDATE albums SET cover_url = ? WHERE id = ? AND cover_url = ?` with the old link as the last value, so a cover changed in the meantime is never overwritten. Zero changed rows counts as kept.
   - `none` (CAA 404 and no Deezer match, or Deezer's stock "no artwork" image): **still dead**. The link stays.
   - `failed` (any other CAA answer, a network error or timeout, or a failed Deezer search): **failed**. Nothing is written, and the next run checks it again. A failure is logged to stderr with the album's title, as today.
5. **Checked** is kept + replaced + still dead + failed. Skipped albums are not checked.

## Pace

Every album that gets a lookup, in either pass, starts at least one second after the previous one started. That is at most two requests a second (a CAA `HEAD` and maybe a Deezer search), under MusicBrainz's one-a-second rule that the import already keeps, and far under Deezer's 50 requests per 5 seconds. 678 albums take about 11 to 12 minutes. Skipped albums don't wait.

The pause is a `sleep` dependency plus a `now` clock, as in `lib/catalog/search.ts`, so tests run without waiting. The gap is a constant, `LOOKUP_GAP_MS = 1000`.

## Running it twice

The second run looks at what the first left: kept links (checked again, kept again), still-dead links (checked again, still dead), failed ones (retried). Replaced albums now have a Deezer cover and are not looked at. So two runs end with the same database as one run, given the same answers from CAA and Deezer.

## Tests

Fake fetch, a fake sleep and clock, and the in-memory test database. One table-driven test per rule, added to `lib/catalog/backfill-covers.test.ts`:

- The link pass by CAA and Deezer answer: CAA 307 → kept and unchanged; CAA 404 with a Deezer match → replaced with the Deezer URL; CAA 404 and no match → still dead, link unchanged; CAA 500, CAA network error, Deezer 500 → failed, link unchanged.
- Skipped with no request: no catalog id; a CAA URL for another id; a Deezer CDN cover is not selected at all.
- A cover changed between the lookup and the update is not overwritten.
- Pace: lookups wait so each starts at least `LOOKUP_GAP_MS` after the previous one; skipped albums add no wait.
- Running twice gives the same database as once, and the second run asks Deezer nothing for replaced albums.
- `formatBackfillSummary` prints both sections.
- The #55 tests for the missing-cover pass keep passing, with their expected summary moved under the new shape.

## Leaves out

- Picking or uploading a cover by hand.
- Replacing covers already on the Deezer CDN.
- Changing how covers are resolved when an album is added.
- Setting a still-dead link to null. The ticket keeps it; the page already shows the placeholder for it.
- Checking CAA links that aren't the album's own release-group `front-250` URL.
- Albums with no catalog id, as in #55.

## Calls I made

- **One command, no flag.** The user ran `npm run backfill-covers` to fix missing covers, and a dead link is a missing cover. A flag would be one more thing to remember for a one-off fix. The cost is that every run checks every CAA link again, about 12 minutes for this library; the script says so before it starts.
- **One lookup a second, for both passes.** CAA publishes no limit; one a second matches what MusicBrainz asks and what the import already does, and is far under Deezer's limit. #55's missing-cover pass ran with no pause; it now uses the same pace, which makes no difference for this library (nothing is null).
- **A CAA link that isn't the album's own URL is skipped, not checked.** `lookupCover` checks the URL built from the catalog id, so a different stored URL would be judged by the wrong request. No such link is expected; skipping it is the safe answer.
- **The replace is guarded on the old link** (`AND cover_url = <old link>`), the same idea as #55's `AND cover_url IS NULL`, so an add or another run that changed the cover is never overwritten.
- **No change to `cover-art.ts`.** `lookupCover` already says found, none or failed, which is exactly what the link pass needs.
- **README** "Backfill covers" section updated to say the command also checks Cover Art Archive links, and how long it takes.
