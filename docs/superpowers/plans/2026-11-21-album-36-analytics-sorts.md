# ALBUM-36 plan: artist rating and the last library sorts

Spec: [2026-11-21-album-36-analytics-sorts.md](../specs/2026-11-21-album-36-analytics-sorts.md). Tests use in-memory or throwaway databases only; never touch `data/album-ranker.db`. Each task ends with `npm test`, `npm run lint` and `npm run typecheck` green, then commit and push on `feat/album-36-analytics-sorts`. Read the Next docs in `node_modules/next/dist/docs/` before touching a page.

## Task 1: artist rating

- `lib/elo/artist-score.ts`: `artistScore(ratings)` = `1500 + 100 * ln(1 + sum(max(0, r - 1500)) / 100)`; undefined for no albums. Update the doc comment.
- `lib/elo/artist-score.test.ts`: table for no albums, one album at 1500, albums below 1500, 1700 x1/x3/x6 values, and six scores higher than three with excess less than double.
- `lib/analytics.test.ts`: replace the old averaging comment and expected scores; add the three-versus-six artists and the all-unplayed artist ranking below an artist with a played album above 1500.
- `app/artists/[id]/page.test.tsx`, `lib/artists.test.ts`, `app/analytics/page.test.tsx`: fix any asserted scores.

## Task 2: last matchup date and the tie-break order

- `lib/elo/record.ts`: `AlbumRecord` gets `lastAt: string | null`, the latest `createdAt` among the counted matchups for the album (`computeRecords` takes `createdAt` in its `used` pick). Test: none, one, several.
- `lib/library-view.ts`: `LibraryAlbum.lastMatchupAt`; export `bestFirst` = rating desc, artist name (case-insensitive), title (case-insensitive), album id. Use it as the tail of every sort (the rating sort's and title sort's tail included); the artist sort keeps its tail (artist id, year, title, rating, id). Add sort keys `ties` (default desc) and `lastmatchup` (default desc, no matchup last in both directions, like win rate); add to `SORT_KEYS`, `SORT_LABELS`, `DEFAULT_DIRS`.
- `lib/library-albums.ts`: fill `lastMatchupAt`; compute the lifetime `rank` with `bestFirst`.
- `lib/analytics.ts`: `buildAlbumRanking` and the top-album picks use `bestFirst`.
- Tests: `lib/library-view.test.ts` table gains `ties` and `lastmatchup` both directions, no-matchup-last either way, and a tie-break case (rating, artist, title, id). `lib/analytics.test.ts`: tie-break by artist then title; an album's rank in its decade, era and year agrees with its lifetime place filtered. Fix other test fixtures that build `LibraryAlbum` (add `lastMatchupAt`) and `app/library/page.test.tsx`.

## Task 3: docs and proof

- Update README or `docs/` text that describes the artist score or the sort options, if any.
- Capture the proof (the three-versus-six table from the artist-score test output and screenshots over a throwaway database) for the PR, not for the repo.
