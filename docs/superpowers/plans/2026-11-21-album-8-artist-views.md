# Artist views implementation plan

**Spec:** [2026-11-21-album-8-artist-views.md](../specs/2026-11-21-album-8-artist-views.md)
**Ticket:** ALBUM-8

Read `node_modules/next/dist/docs/` for the pages, `notFound()` and `searchParams` APIs before writing pages (this Next.js has breaking changes). Follow the patterns in `app/matchups/page.tsx`, `lib/ratings.ts`, `components/cover.tsx` and `app/page.test.tsx`.

## Task 1: list building and loader (`lib/artists.ts`, `lib/artists.test.ts`)

- Pure `buildArtistList(albums, decade?)` per the spec: scope to the decade when given, use `artistScore`, order by score desc, then name (case-insensitive), then id; rank 1..n; `ratedAlbumCount`.
- `loadArtistList(db, decade?)` (rated albums from `loadRatings`, `listAllYearEntries`, `listAlbums`; no `server-only`).
- `loadArtistPage(db, artistId)`: artist name, overall score and rated count, placed albums (rated and listed, ordered by year then album id) with cover, title, year, placement, rank, rating (null when listed). Undefined when the artist does not exist.
- Tests (table-driven): artist across three decades; 1600 and 1700 gives 1600; listed and unrated left out; tie order; empty decade; matchup swaps two artists' order (overall and the shared decade) against `memoryDb()`.

## Task 2: pages (`app/artists/page.tsx`, `app/artists/[id]/page.tsx`, home link, tests)

- `/artists`: `await connection()`, `searchParams` decade validated against 1950..2020 step 10 (else `notFound()`), picker links with `aria-current="page"` on the current one, table with Rank, Artist (link), Score (rounded), Rated albums, empty messages from the spec.
- `/artists/[id]`: validate whole-number id, `notFound()` for unknown, heading, score line, album list with `Cover`, placement text, rating text, "All artists" link, "No placed albums." empty state.
- Add "Artists" link to `app/page.tsx` (update `app/page.test.tsx` if it checks links).
- One render test per page against an in-memory database (mock `@/lib/db/server` `getDb`), as the spec lists. No styling tests.

## Verify

`npm test`, `npm run lint`, `npm run typecheck` all green. Do not commit `data/` or SQLite files.
