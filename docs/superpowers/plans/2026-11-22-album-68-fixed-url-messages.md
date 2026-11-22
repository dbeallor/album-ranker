# ALBUM-68 plan: fixed messages instead of URL text

**Spec:** [2026-11-22-album-68-fixed-url-messages.md](../specs/2026-11-22-album-68-fixed-url-messages.md)

Verify after each task: `npm test`, `npm run typecheck`, `npm run lint`.

## Task 1: search codes
- `lib/library-service.ts`: add `code` to each `addCatalogAlbumToLibrary` failure; export `ADD_ALBUM_ERRORS` (codes `year`, `catalog_id`, `artist_id`, `title`, `artist`, `cover`, `release_year`); `message` comes from the map.
- `app/search/actions.ts`: redirect `error=<code>&item=<catalogId>`.
- `app/search/page.tsx`: show `ADD_ALBUM_ERRORS[code]` only for a known code.
- Update tests; add a table-driven page test (known codes, unknown text shows nothing).

## Task 2: remove and library
- `app/library/remove/[albumId]/actions.ts`: stale redirects `error=stale`; success redirects `/library?removed=1&matchups=N`.
- Remove page: `error=stale` builds the matchup message from its own count; other values show nothing.
- `app/library/page.tsx`: show only when `removed === "1"`; text `Removed the album.` / `Removed the album and its N matchup(s).`
- Update tests.

## Task 3: import
- `app/import/actions.ts`: `fail` takes a code (`not_found`, `missing_details`, `in_library` + `album=<id>`, `invalid`); map `resolveReviewItem` failure codes (`not_found`/`not_open` handled as today, `album_in_library`, `invalid`).
- `app/import/page.tsx`: map code to message per spec; `in_library` reads album and entry from the db, falling back to `That album is already in your library.`; unknown code shows nothing (item and page level).
- Update tests; table-driven page test.
