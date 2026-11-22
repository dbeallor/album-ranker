# ALBUM-35 plan: add albums to the library, matchups over all of it

Spec: [2026-11-21-album-35-add-albums-library.md](../specs/2026-11-21-album-35-add-albums-library.md). Read the Next docs in `node_modules/next/dist/docs/` before writing pages or server actions (this Next has breaking changes). Run `npm install` first (no `node_modules` yet). Tests use in-memory databases only; never touch `data/album-ranker.db`.

Commit and push after each task (`git push` on `feat/album-35-add-albums-library`). Each task ends with `npm test`, `npm run lint`, `npm run typecheck` green.

## Task 1: data layer, picker, services

- `lib/db/library.ts`: `libraryYearsByCatalogId(db, catalogIds)` returning `Map<catalogId, year>` for albums in the library. `lib/db/matchups.ts`: `countMatchupsForAlbum(db, albumId)` (either side). Tests in the existing test files.
- `lib/elo/pick.ts`: drop `year` from `PickAlbum`; `opponentsOf` is every other album; fix the doc comment. Update `pick.test.ts` (same-year pair allowed, fewer than two albums returns undefined, existing rules keep their tests).
- `lib/ratings.ts`: stop loading years for the picker (`AlbumCard.year` stays). `lib/matchups-service.ts`: remove the same-year check in `answerMatchup` and the year comparison in `undoMatchup`. Update `matchups-service.test.ts` (the "same year" refusal becomes an accepted answer; undo serves a same-year pair again).
- `lib/library-service.ts` (+ test): `addCatalogAlbumToLibrary(db, input)` and `removeFromLibrary(db, albumId, expectedMatchups)` exactly as the spec's "Adding from search" and "Removing from the library" describe (validation, one transaction, no-op on a repeat add, stale-count refusal, not-in-library failure). Result types `{ ok: true, ... } | { ok: false, message }`. Table-driven tests per the spec's Tests list.

## Task 2: pages and actions

- `app/search/actions.ts` (thin server action reading `FormData`, redirecting as the spec says, following the `app/import/actions.ts` pattern) and `app/search/page.tsx`: per-result form with the year box (catalog year as default, hint when none), "In your library (year)" with no form, `added` message, per-result `error`. Page tests extended (mock `@/lib/db/server` as `app/library/page.test.tsx` does).
- `app/library/remove/[albumId]/page.tsx` + `actions.ts`: confirmation page (count wordings, 404 when not in library, "Keep it" link), action with the stale-count path. Page test.
- `app/library/page.tsx`: "Remove" link on each card, `removed` message. Update `app/library/page.test.tsx`.
- `components/matchup-screen.tsx`: empty message "Add at least two albums to your library to start matchups." with a link to `/search`; update its test.
- Use `components/ui` only; no raw colors or inline styles (`lib/design-system.test.ts` enforces it).

## Task 3: docs

- `README.md`: Search (adding a result), Library (Remove), Matchups ("any two library albums" instead of "different years").
- Import test: add one only if the existing tests do not already cover two same-year sheet rows both landing in the library and a second run adding nothing.
- Closeout docs (as-built, spec status) are written by `open-pr`, not here.
