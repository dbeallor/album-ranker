# Backfill covers for library albums saved without one

**Status:** Shipped
**Shipped:** in PR #57, as specified
**Date:** 2026-11-22
**Ticket:** [ALBUM-55](https://github.com/dbeallor/album-ranker/issues/55)
**Follows:** [ALBUM-48 album art fallback](2026-11-22-album-48-album-art-fallback.md)

## Goal

Albums stored before #48 shipped, or added while the Cover Art Archive (CAA) had no cover, still have `albums.cover_url` set to null and show the grey placeholder. A one-off command fills those covers using the same lookup as #48. It never touches an album that already has a cover.

## How it runs

A script, run like the import: `npm run backfill-covers`. No button in the app.

```
npm run backfill-covers
Checking 42 albums with no cover in data/album-ranker.db
Checked 25 of 42 albums
...
Filled:     17
Still none: 21   (no cover on CAA or a matching one on Deezer)
Failed:      2   (a lookup failed; run again to retry)
Skipped:     3   (no catalog id)
```

- `scripts/backfill-covers.ts` wires the real fetch, user agent and the `COVER_ART_ARCHIVE_URL` / `DEEZER_URL` config, the same way `scripts/import.ts` does, opens the database at `DATABASE_PATH`, runs the backfill and prints the summary. It exits 0 when the run finishes, even with failed albums, and 1 only on an unexpected error.
- `package.json` gains `"backfill-covers": "node --conditions=react-server scripts/backfill-covers.ts"`.
- The logic lives in `lib/catalog/backfill-covers.ts` as `backfillCovers(db, deps)`, so tests drive it with an in-memory database and a fake fetch.

## What the backfill does

1. **Pick the albums.** Every album whose `cover_url` is null, in id order. Albums with no `catalog_id` are counted as **skipped** and not looked up.
2. **Look each one up, one at a time.** Albums are checked one after another, never in parallel, so a large library stays well under Deezer's limit (50 requests per 5 s) and is gentle with CAA. Each album costs one CAA `HEAD` and, when CAA has nothing, one Deezer search.
3. **Same matching as #48.** CAA first; on a plain 404, Deezer with the same normalised title-and-artist match and the same CDN host check. No new matching rules.
4. **A failure changes nothing.** This is the one difference from add time. When adding an album, a CAA timeout or 5xx keeps the CAA URL. In the backfill, a CAA answer other than 2xx, 3xx or 404, a CAA network error or timeout, or a failed Deezer request (non-2xx, network error, bad JSON) leaves `cover_url` null and counts the album as **failed**, so a rerun tries it again.
5. **Write only into an empty slot.** The update is `UPDATE albums SET cover_url = ? WHERE id = ? AND cover_url IS NULL`, and the URL is checked with `isAllowedCoverUrl` before writing. A cover stored in the meantime (by an add in the app) is never overwritten.
6. **No match** (CAA 404 and no matching Deezer album, or Deezer's stock "no artwork" image) leaves the album on the placeholder and counts it as **still none**.
7. Progress prints every 25 albums. Failures are logged to stderr with the album's title, as at add time.

Running it twice does what running it once does: the second run only looks at albums still at null, and fills the same ones a first run would have.

### Changing `resolveCover` to tell "nothing" from "couldn't tell"

`createResolveCover` today returns `string | null` and hides failures (CAA failure → CAA URL; Deezer failure → null). The backfill needs to know the difference, so `lib/catalog/cover-art.ts` gains a second function on the same deps:

- `lookupCover(query): Promise<{ kind: "found"; url: string } | { kind: "none" } | { kind: "failed" }>`.
- `resolveCover` becomes a thin wrapper over it with today's behaviour unchanged: `found` → the URL, `none` → null, `failed` at the CAA step → the CAA URL, `failed` at the Deezer step → null. The three add-time callers do not change.

## Tests

Fake fetch and the in-memory test database throughout, one table-driven test per rule.

- `lib/catalog/cover-art.test.ts`: `lookupCover` gives `found` for CAA 2xx/3xx and for a Deezer match, `none` for CAA 404 plus no Deezer match, `failed` for CAA 500, CAA network error, Deezer 500, Deezer network error and bad JSON. The existing `resolveCover` cases keep passing unchanged.
- `lib/catalog/backfill-covers.test.ts`:
  - an album with no cover and a CAA cover is filled with the CAA URL; one with a Deezer match gets the Deezer URL;
  - an album that already has a cover is not looked up and keeps its URL;
  - no `catalog_id` → skipped, no request; no match → still none; a failed lookup → failed and still null;
  - a cover written between the lookup and the update is not overwritten;
  - running twice gives the same database as running once, and the second run makes requests only for the albums still at null.

## Leaves out

- A "Refresh cover" action in the app.
- Picking or uploading a cover by hand.
- Replacing stored covers, including broken CAA links or the CAA URL that a CAA outage stored at add time.
- Albums with no `catalog_id` (a manual album): they stay on the placeholder. Looking them up on Deezer by title and artist alone is possible, but not in this ticket.
- Resolving covers on the search results page.

## Calls I made

- **Script only, no in-app action.** The gap is a one-time backlog from before #48; a script fixes it in one run with no new UI, no new server action and no new input to validate. An album that still lacks a cover after that is one CAA and Deezer don't have, so a per-album button would mostly say "still nothing".
- **A failed lookup stores nothing, unlike add time.** At add time a CAA outage keeps the CAA URL. In the backfill that would permanently store a URL that may be broken, and the ticket says failures must leave the album alone so a rerun retries. So the backfill counts a fourth outcome, "failed", next to filled, still none and skipped.
- **A new `lookupCover` beside `resolveCover`**, not a flag on `resolveCover`, so add-time behaviour stays exactly as #48 shipped it and its tests stay as they are.
- **Sequential, no extra delay.** Two requests per album at network speed stays well under Deezer's public limit for a library of a few hundred albums; no sleep between albums.
- **Exit code 0 even with failed albums.** Failures are expected (a flaky network) and the summary says to rerun; a non-zero code is kept for a crash.
- **README** gains a short "Backfill covers" note under the import section.
