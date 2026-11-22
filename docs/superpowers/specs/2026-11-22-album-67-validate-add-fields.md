# Validate add and import form fields the same way, before any lookup

**Status:** Shipped
**Shipped:** in PR #74, as specified
**Date:** 2026-11-22
**Ticket:** [ALBUM-67](https://github.com/dbeallor/album-ranker/issues/67)
**Follows:** [ALBUM-64 security sweep report](2026-11-22-album-64-security-sweep-report.md), findings S3 and S9

## Goal

The two ways to add a catalog album, "Add" on `/search` and "Use this album" on `/import`, check the form with one validator. The check runs before the server asks the Cover Art Archive or Deezer for a cover, and cover lookups are spaced like MusicBrainz searches.

Today the search add checks every field (`addCatalogAlbumToLibrary`, `lib/library-service.ts`) but looks up the cover first. The import path (`candidateFrom`, `app/import/actions.ts`) checks only that three fields are not empty, so a changed hidden field can store an upper-case catalog id (the same album twice), `catalogId=x`, a title of hundreds of kilobytes, a release year of `99999`, or any text as the artist id.

## The shared validator

`lib/library-service.ts` exports `validateCatalogAlbum(input)`. It takes the raw catalog fields (`catalogId`, `title`, `artist`, `artistId`, `releaseYear`) and returns either the cleaned album or the first failure message:

| Field | Rule (same as the search add today) | Cleaned value | Message on failure |
|---|---|---|---|
| `catalogId` | a UUID, any case | lower-cased | That album's catalog id isn't valid. |
| `artistId` | empty, or UUIDs joined by `+`, at most 400 characters | lower-cased, empty becomes null | That album's artist id isn't valid. |
| `title` | not empty, at most 300 characters after trimming | trimmed | That album's title isn't valid. |
| `artist` | not empty, at most 300 characters after trimming | trimmed | That album's artist isn't valid. |
| `releaseYear` | empty, or a whole number from 1 to 2100 | a number, empty becomes null | That album's release year isn't valid. |

The checks run in the order above. The cover URL and the library year are not part of it: the import path takes neither from the form, and the search add keeps its own year check (1900 to 2100) and cover check.

`addCatalogAlbumToLibrary` calls `validateCatalogAlbum` instead of its inline checks, so its behaviour and messages do not change. The library-year check moves to an exported `validateLibraryYear` so the search action can run it first.

## Search add (`app/search/actions.ts`)

1. Check the library year and run `validateCatalogAlbum`. On a failure, redirect back with the message as today. No cover lookup.
2. If the album is already stored, add it with no lookup (it keeps its cover, as today).
3. Otherwise look up the cover with the cleaned (lower-cased) catalog id and trimmed names, then call `addCatalogAlbumToLibrary`.

## Import "Use this album" (`app/import/actions.ts`)

1. `candidateFrom` runs `validateCatalogAlbum` and returns its message on a failure. `chooseAlbumAction` sends that message back next to the item, like the other item errors. No cover lookup.
2. A valid candidate carries the cleaned values, so the catalog id reaching `withCover` and `resolveReviewItem` is lower case.
3. `withCover` is unchanged otherwise: a stored album gets no lookup.

## Lookup in `lib/import/resolve.ts`

`resolveReviewItem` lower-cases the catalog id before `findAlbumByCatalogId`, and stores the lower-cased id when it creates the album. This guards callers other than the action (the import script passes ids from MusicBrainz, which are lower case already).

## Pacing cover lookups

The server's `resolveCover` (`lib/catalog/server-cover.ts`) goes through a queue like the MusicBrainz client's: each lookup reserves a start time at least 1100 ms after the previous one started, and waits for it. One lookup is a Cover Art Archive `HEAD` and maybe one Deezer search, so this is at most two requests every 1.1 s. The queue is its own, separate from the MusicBrainz one (different services).

If the wait would be more than 5 seconds (the MusicBrainz client's limit), the lookup is skipped and the album is added with no cover. `npm run backfill-covers` fills it later. Adding the album matters more than its cover.

The pacing lives in `lib/catalog/cover-art.ts` as an option on `createResolveCover` (`now` and `sleep` dependencies, as in the MusicBrainz client), so tests run without waiting. The backfill script keeps its own pacer and does not use this one.

## Tests

One table-driven test per rule, with the existing mocks (in-memory database, mocked `resolveCover`):

- `app/import/actions.test.ts`: "Use this album" rejects each bad field (`catalogId=x`; an artist id that is not UUIDs; a title and an artist of 301 characters; release years `99999`, `0` and `abc`), stores nothing, keeps the item open, shows the message next to the item, and does not call `resolveCover`.
- `app/import/actions.test.ts`: an upper-case catalog id for an album already stored in lower case reuses that row; the library has one row for it.
- `app/search/actions.test.ts`: each failing form (bad year, bad catalog id, long title, bad release year) does not call `resolveCover`.
- `lib/import/resolve.test.ts`: an upper-case catalog id finds the stored lower-case album.
- `lib/library-service.test.ts`: `validateCatalogAlbum` by field, one table; the existing `addCatalogAlbumToLibrary` tests keep passing.
- `lib/catalog/cover-art.test.ts`: lookups through `createResolveCover` with pacing start at least 1100 ms apart; a lookup that would wait over 5 s returns null with no request.

`npm test`, `npm run lint` and `npm run typecheck` pass.

## Leaves out

- Caching cover lookups.
- Other catalog-response checks (S10 to S12, ticket #70).
- Any change to the forms the pages render; only the server checks change.
- Fixing rows already stored with bad values. The sweep found none in the user's library; a clean-up would be its own ticket.

## Calls I made

- A cover lookup that would wait more than 5 seconds is skipped and the album is added with no cover, instead of the add failing as "busy". The backfill fills the cover later.
- The cover pacing gap is 1100 ms, the MusicBrainz client's, not the backfill's 1000 ms, since the ticket asks to pace "like the MusicBrainz client".
- The cover queue is its own, not shared with MusicBrainz searches.
- The import path now rejects a release year that is not a whole number, where today it quietly stores no year.
- The import path now trims and lower-cases the artist id and rejects one that is not UUIDs; today it stores any text.
- The validator returns the first failure only, in the table's order, like the search add today.
- Cover URL and library year stay outside the shared validator, since the import form sends neither.
- The search add looks up the cover with the lower-cased catalog id and trimmed title and artist, not the raw form values.
