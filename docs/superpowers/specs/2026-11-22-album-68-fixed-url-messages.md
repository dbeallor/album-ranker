# Fixed messages instead of text from the URL

**Status:** Shipped
**Shipped:** in PR #75, as specified
**Date:** 2026-11-22
**Ticket:** [ALBUM-68](https://github.com/dbeallor/album-ranker/issues/68)
**Follows:** [ALBUM-64 security sweep report](2026-11-22-album-64-security-sweep-report.md) (finding S4)

## Goal

The red and green messages on the import, search, library and remove pages never show text taken from the URL. Today a link such as `/import?error=<any text>` puts that text in the app's own alert. After this change the URL carries a short code, the page maps the code to a message the app wrote, and an unknown code shows nothing.

The login page already works this way (`MESSAGES` in `app/login/page.tsx`). The other pages follow it.

## What changes

### Import review (`/import`)

`app/import/actions.ts` redirects with `error=<code>` (and `item=<id>` as today) instead of the message. The page maps the code:

| Code | Message | When |
|---|---|---|
| `not_found` | That review item could not be found. | bad or unknown item id (both today's "could not be found" text and `resolveReviewItem`'s `not_found`) |
| `missing_details` | That album is missing its catalog details. | the form lacks catalog id, title or artist |
| `in_library` | `<title> is already in your library (<year>).` | `album_in_library` |
| `invalid` | That album couldn't be saved. Check its details and try again. | a `DataError` (`invalid` code) |

- `in_library` also sends `album=<albumId>`. The page reads that album and its library entry from the database to build the message. If the id is not a whole number or the album is no longer in the library, it shows `That album is already in your library.`
- An unknown or empty `error` shows no message, at the item or at the top of the page.
- The success messages (`done`, `already`, `moved`) already come from the database. No change.

### Search (`/search`)

`addCatalogAlbumToLibrary` (`lib/library-service.ts`) returns a `code` with each failure. The messages move into one exported map in the same file, `ADD_ALBUM_ERRORS`, keyed by code: `year`, `catalog_id`, `artist_id`, `title`, `artist`, `cover`, `release_year`, each with today's text. The failure keeps its `message` (taken from the map) so other callers are unchanged.

`app/search/actions.ts` redirects with `error=<code>&item=<catalogId>`. The page shows `ADD_ALBUM_ERRORS[code]` under that result, and nothing for an unknown code.

### Remove an album (`/library/remove/<id>`)

The stale case redirects with `error=stale`. The page already counts the album's matchups, so it builds `This album now has <N> matchups. Check and confirm again.` from that count. Any other `error` value shows nothing.

### Library (`/library`)

The remove action stops putting the album title in the URL. It redirects to `/library?removed=1&matchups=<N>`. The page shows `Removed the album.` or `Removed the album and its <N> matchups.` (`1 matchup` for one). `removed` is shown only when it is `1`, and `matchups` keeps today's digits-only check.

### Tests

One table-driven test per page covers the rule: each code shows its message, and an unknown code (made-up text) shows no text from the URL. The action tests check the redirect URLs carry codes. Existing tests that expect message text in a URL change to codes.

## Leaves out

- The `q` search text on `/search` and `/import`. It shows in the search box and in "No albums found for ...", where it reads as what you typed, not as an app message.
- The login page: it already maps codes.
- Security headers (S5 to S8): [ALBUM-69](https://github.com/dbeallor/album-ranker/issues/69).

## Calls I made

- **The library's removed message drops the album title.** The album is deleted by then, so the page can't look the title up, and any title in the URL can be made up. The message says `Removed the album.` The ticket allowed capping the length instead; a short made-up title still reads as an app message, so I dropped it.
- Import `invalid` (a `DataError`) shows one fixed message instead of the error's own text. Those texts come from the database layer, some name internal ids, and the case only happens with a hand-made form post.
- Import `not_found` now says `That review item could not be found.` for both the bad-id and the missing-item case. Today the second one says `Import review item <N> does not exist.`
- Import `in_library` keeps the title and year by reading them from the database with the album id in the URL, so that message is unchanged.
- Remove `stale` builds its count from the page's own count, which is the current one, instead of the count at the time of the click. They are the same unless a matchup was played in between.
- Search messages live in `lib/library-service.ts` next to the checks that produce them, so a new check adds its code and message in one place.

## Touches

None of data, money, auth, user email or migrations. Only what the pages show and the redirect URLs change.
