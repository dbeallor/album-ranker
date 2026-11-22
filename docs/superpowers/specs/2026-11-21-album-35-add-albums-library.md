# Add albums to the library and run matchups over all of it

**Status:** Shipped
**Shipped:** in PR #41, with differences: [as-built](../as-built/2026-11-21-album-35-add-albums-library.md)
**Date:** 2026-11-21
**Ticket:** [ALBUM-35](https://github.com/dbeallor/album-ranker/issues/35)
**Follows:** [ALBUM-34 library table](2026-11-21-album-34-elo-library-table.md), [catalog search](2026-11-21-album-5-catalog-search.md), [Elo matchups](2026-11-21-album-7-elo-matchup.md)

## Goal

The user adds any catalog album to the library from `/search`, removes one from the library page, and the matchup screen pairs any two library albums, whatever their years. Matchups stay the only thing that rates an album.

ALBUM-34 shipped first and already did two things this ticket lists: the library page with its sort-by-year dividers, and an import that writes no decade entries (the `decade_list_entries` table is gone). This ticket changes no import code. Where ALBUM-34's spec and the ticket text differ, ALBUM-34 wins, as the ticket says.

## What changes for the user

- **`/search`**: each result gets a "Year in your library" box and an "Add to library" button. The box starts as the catalog's year. A result the library already holds shows "In your library (1964)" instead, with no form.
- **`/library`**: each card gets a "Remove" link that opens a confirmation page.
- **`/matchups`**: any two library albums can meet, including two from the same year. Nothing else about picking changes.
- No new screen lets the user place, rank or order an album by hand.

## Adding from search

Each result on `/search` is a small form posting to a server action, so it works without JavaScript like the import review page does. Fields:

| Field | Source |
|---|---|
| `catalogId`, `title`, `artist`, `artistId`, `releaseYear`, `coverUrl` | hidden, copied from the result |
| `year` | visible number box, 1900 to 2100, required |
| `q` | hidden, the search text, so the redirect lands back on the same results |

**The year.** The box holds the catalog year (`CatalogAlbum.year`). When the catalog has none, the box is empty and a line under it says "The catalog has no year. Enter the year to file it under." The browser blocks an empty submit (`required`), and the server checks again.

**The server action** (`app/search/actions.ts`, thin) calls `addCatalogAlbumToLibrary(db, input)` in `lib/library-service.ts`, which:

1. Checks the input, since the browser can send anything: `year` a whole number 1900 to 2100 ("Enter a year from 1900 to 2100."); `catalogId` looks like a MusicBrainz id (36 characters of hex and dashes); `title` and `artist` non-empty after trimming and at most 300 characters; `coverUrl` empty or starting with `https://coverartarchive.org/`; `releaseYear` a whole number or empty.
2. In one transaction: reuses the album with that `catalogId` if there is one, else `createAlbum` (artist shared by its catalog artist id, as the import does). Then `addToLibrary` with the chosen year.
3. An album already in the library is a no-op, not an error: the library keeps its year and nothing is written. So a double click, a second tab or a repeat post does nothing.

It returns `{ ok: true, added }` or `{ ok: false, message }`. The action redirects to `/search?q=…&added=<catalogId>` on success and `/search?q=…&error=<message>&item=<catalogId>` on failure. The page shows "Added <title> to your library." for `added` (only if that album is in the library), and the error under the result named by `item`.

The library year is the user's choice and may differ from `albums.release_year`; the catalog year is stored as `release_year` unchanged.

"In your library" is decided by `catalogId`: `findAlbumByCatalogId` then `getLibraryEntry`, in one new helper, `libraryYearsByCatalogId(db, catalogIds)` in `lib/db/library.ts`.

## Removing from the library

Each library card gets a "Remove" link to `/library/remove/<albumId>`, a confirmation page (404 when the album is not in the library):

> **Remove *Kind of Blue* from your library?**
> Miles Davis · 1959 · 7 matchups
>
> This deletes the album and its 7 matchups. The ratings of the albums it played will change. This can't be undone.
>
> [Remove album] [Keep it]

With no matchups the second line reads "It has no matchups." and one matchup reads "its 1 matchup". "Keep it" links back to `/library`. "Remove album" is the danger button.

**The action** posts `albumId` and `matchups` (the count the page showed). `removeFromLibrary(db, albumId, expectedMatchups)` in `lib/library-service.ts`, in one transaction:

- Not in the library: fails with "That album isn't in your library."
- The matchup count is not `expectedMatchups` (an answer landed in another tab): nothing is deleted; the action sends the user back to the confirmation page with "This album now has N matchups. Check and confirm again."
- Otherwise `deleteAlbum` deletes the album, its library row and its matchups (all cascade) and its artist if no albums remain. Import review items that pointed at it keep their status and lose the link (`ON DELETE SET NULL`, already in the schema).

Success redirects to `/library?removed=<title>&matchups=<n>`, which shows "Removed <title> and its n matchups." The count comes from `countMatchupsForAlbum(db, albumId)` in `lib/db/matchups.ts`: stored matchups with the album on either side.

Nothing else is deleted. Undo for matchups, and the skip list in the matchup screen, keep working: a skipped or undone pair with a removed album is dropped and a new pair is picked (the existing "no longer in the library" handling).

## Matchups over the whole library

- `pickMatchup`: the `year` field leaves `PickAlbum`, and `opponentsOf(album)` is every other album. The rest stays: the first album has the fewest matchups (random among ties, skipping albums with no unplayed opponent), its opponent is the closest-rated unplayed, unavoided album (lower id on a tie), and when every pair was played it falls back to the closest-rated opponent. It returns `undefined` only when there are fewer than two albums.
- `answerMatchup`: the same-year check goes. Both albums must still be in the library, and different, as before.
- `undoMatchup`: serves the undone pair again when both albums are still in the library; the year comparison goes.
- `loadMatchupState` stops loading years for the picker. `AlbumCard.year` stays, since the matchup screen shows each album's year.
- Empty state on `/matchups`: "Add at least two albums to your library to start matchups." with a link to `/search`, replacing "no two albums from different years".

## Import

No code change. `writeRow` already adds the album to the library with the sheet's year and source key, and the source key already makes a second run skip rows it wrote. Decade ranks are read and ignored. This ticket adds one test that two sheet rows from the same year both land in the library and a second run adds nothing, if the existing tests do not already cover both.

Removing an album that came from the sheet drops its source key, so the next `npm run import` of the same sheet adds it back. See Calls I made.

## Files

- New: `lib/library-service.ts` (+ test), `app/search/actions.ts`, `app/library/remove/[albumId]/page.tsx`, `app/library/remove/[albumId]/actions.ts` (+ page test).
- Changed: `app/search/page.tsx`, `app/library/page.tsx`, `lib/elo/pick.ts`, `lib/matchups-service.ts`, `lib/ratings.ts`, `components/matchup-screen.tsx`, `lib/db/library.ts`, `lib/db/matchups.ts`, their tests, and `README.md` (search, library and matchup sections).
- New controls use `components/ui` (`Button`, `ButtonLink`, `TextField`, `Message`, `Stack`, `Card`). No new CSS beyond what a layout needs.
- No migration. No change to ratings, the import or the schema.

## Tests

One table-driven test per rule, sized to `AGENTS.md` § Testing:

- `lib/library-service.test.ts`: add (new album and artist, catalog year as the library year, a different year, existing album not yet in the library), add twice is a no-op that keeps the first year, bad year (0, 1899, 2101, 1964.5, empty, text), bad `catalogId`, empty title, foreign cover URL. Remove (album and matchups gone, others' matchups kept, ratings of opponents back to what replay gives, artist kept while it has other albums), remove with a stale matchup count, remove an album not in the library.
- `lib/elo/pick.test.ts`: two albums from the same year can pair; fewer than two albums returns undefined; the existing rules (fewest matchups, closest rating, unplayed first, avoid, fallback) keep their tests.
- `lib/matchups-service.test.ts`: the "same year" case becomes an accepted answer; a pair with an album outside the library is still refused; undo serves a same-year pair again.
- `lib/db/library.test.ts` and `lib/db/matchups.test.ts`: `libraryYearsByCatalogId`, `countMatchupsForAlbum` (either side).
- Page tests: `/search` shows the year box filled, empty with the hint for a yearless album, "In your library (1964)" without a form, the added message and the per-result error; the remove page shows the count and its three count wordings and 404s for an album not in the library; `/library` cards link to it and show the removed message.
- Import: the one test above, if missing.

## Proof

On a ticket preview over a throwaway database, with the catalog stubbed as the Playwright tests do: search, add an album with its catalog year, add a yearless one with a year, reload `/library` and see both; add a second album from the same year and answer a matchup between them; open Remove and confirm it names the matchup count; remove it and see the count drop. Screenshots of each step. No agent runs anything against `data/album-ranker.db`.

## Leaves out

- Editing a library album's year after it is added (the ticket asks only for a year at add time; `setLibraryYear` exists for a later screen).
- Undo for a removal. The confirmation page is the only guard; `npm run db:backup` is the safety net.
- A "removed" list that stops the import adding a removed sheet album back.
- Adding an album the catalog does not have (a manual album).
- Bulk add or bulk remove.
- The visual pass (ALBUM-38), the other analytics (ALBUM-36) and decade lists (ALBUM-37).

## Calls I made

- **Removing deletes the album row, not only its library row.** Its matchups cascade from the album, and a leftover album outside the library would have no use. Adding it again from search recreates it, with no matchups.
- **Removing an album that came from the sheet lets the next import add it back**, because the album's source key goes with it. A tombstone would be a new table, so I left it out; the confirmation page does not mention this.
- **A two-step remove on its own page**, not a browser `confirm()` or a hidden `<details>` on 661 cards, so the matchup count is computed fresh and it works without JavaScript.
- **The confirmation posts the matchup count it showed**, and a different count at submit time cancels the delete and asks again, so the user never deletes more matchups than they were told.
- **Adding an album already in the library is a no-op that keeps its year**, not an error and not a year change.
- **The add form posts the catalog fields as hidden inputs**, as the import review page does, and the server re-checks them (id shape, lengths, cover host, year range) instead of looking the album up again, so adding works after the search cache expires or the catalog is busy.
- **The catalog year is stored as `release_year`; the library year is separate.** Changing the year in the box affects only the library year.
- **The year box accepts 1900 to 2100**, the range ALBUM-34's `library_albums` table enforces. A catalog album outside it needs a year in range before it can be added.
- **The import needs no change**: ALBUM-34 already dropped decade entries, so the ticket's import bullet is done; I only add a test if one is missing.
- **The matchup screen's empty message changes** to ask for two library albums and link to search.
- **No end-to-end test.** The existing Playwright setup has no throwaway database for writes; the proof is run by hand on a ticket preview.
