# ALBUM-34 plan: matchup-only ratings, library, analytics

Spec: [2026-11-21-album-34-elo-library-table.md](../specs/2026-11-21-album-34-elo-library-table.md). Read Next docs in `node_modules/next/dist/docs/` before writing pages. Run `npm install` first (no `node_modules` yet). Tests use throwaway/in-memory databases only; never touch `data/album-ranker.db`.

Commit and push after each task (`git push` on `feat/album-34-elo-library-table`). Each task ends with `npm test`, `npm run lint`, `npm run typecheck` green (when a task removes code, delete its tests too).

## Task 1: data layer and ratings

- `lib/db/migrations/003_library.sql` as in the spec; `lib/db/library.ts` (+ test); `lib/db/types.ts` updates.
- `lib/elo/replay.ts`: `computeRatings({ albumIds, matchups })`, delete `impliedResults`; `lib/elo/record.ts` (+ tests); update `replay.test.ts`.
- `lib/scopes.ts` (+ test).
- `lib/ratings.ts` reads the library; `lib/matchups-service.ts`, `lib/artists.ts` use library years.
- `lib/db/backup.ts`, `scripts/backup.ts`, `scripts/restore.ts`: counts become albums, library albums, matchups (pre-003 db: library count = year entry count).
- Migration test per spec.

## Task 2: import onto the library

`lib/import/*`, `app/import/*`, `components/import-review.tsx`: write to the library, drop rank and decade logic and summary lines, `album_in_library`, "In your library (year)". Update tests and fixtures.

## Task 3: remove year screen, year entries, decade lists

Delete the files listed under "Removed" in the spec, drop their tests, fix imports, nav (`components/ui/site-header.tsx`) and home page links. Add redirects (`next.config` redirects or route handlers, per the Next docs) for old URLs.

## Task 4: library page

`lib/library-view.ts` (+ table-driven test), `app/library/page.tsx`, sort/filter form, divider headings. Page test.

## Task 5: analytics page

Analytics loader (`lib/analytics.ts` + test), `app/analytics/page.tsx`, artist page update (year, rating, W-L-T). Page tests.

## Task 6: docs and proof

README/AGENTS-listed living docs that mention year screen, decades, artists page; `docs/superpowers/` as-built per the open-pr closeout; migration proof on a throwaway database copy (script in the scratchpad, not committed).
