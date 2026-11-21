# ALBUM-6 per-year ranking screen: plan

**Spec:** [2026-11-21-album-6-year-ranking-screen.md](../specs/2026-11-21-album-6-year-ranking-screen.md)

`npm ci` has run and `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` are in `package.json`. Read the relevant guides in `node_modules/next/dist/docs/` before touching pages, dynamic routes (`params` is async) or server actions. Use `lib/db/test-db.ts` (`memoryDb`, `seedAlbums`) for DB tests; never open the file DB. Follow the matchups split: logic in `lib/*-service.ts` taking `db` (no `server-only`), `"use server"` wrappers in `app/years/actions.ts` calling `getDb()`.

## Task 1: placements logic (pure, `lib/year-placements.ts`, no db or React import)
- Type `Placements = { ranked: number[]; honorableMentions: number[]; listed: number[] }` (album ids, ranked in rank order).
- `applyMove(placements, albumId, target: { area: "ranked" | "honorable_mention" | "listed"; index?: number })`: removes the album from wherever it is, inserts at `index` in ranked (end when omitted), appends to the other areas. A ranked list over 10 pushes the last ranked album to honorable mentions; return `{ placements, pushedOut: number | null }`.
- `moveUp` / `moveDown` helpers (or `applyMove` with index) and `removeAlbum`.
- Table test: drop within ranked (4 to 1 shifts others down), between areas, into full ranked, remove, append default.

## Task 2: service (`lib/year-service.ts`, takes `db`)
- `loadYearView(db, year)`: entries joined to albums with rounded rating from `loadRatings` (none for listed). Ranked slots keep stored rank positions (gaps stay until a save); HM and listed sorted by artist then title.
- `listYears(db)`: years with counts.
- `saveYear(db, year, placements)`: validate (year int 1900..2100, ids positive ints, no duplicates, at most 10 ranked), call `setYearPlacements` (ranks 1..N), return the new view plus `removedDecadeEntries` titles. Errors returned as `{ error }`, nothing stored.
- `addFromCatalog(db, year, catalogAlbum, area, { move })`: validate the result (non-empty strings of reasonable length, year null or int, cover null or `https://coverartarchive.org/`); find by catalog id or `createAlbum` (artist by name only); if the album has an entry on another year and `move` is not set, return `{ conflict: { year, placement, rank, title } }` with nothing stored; on this year already return `{ error: "<title> is already on this page" }`; ranked adds to the end (refused when full); `move` uses `moveFromOtherYears`.
- `addManual(db, year, { title, artist, releaseYear?, area })`: no catalog id, no cover.
- Tests (in-memory db), one per rule in spec § Tests / Service, including the reorder-then-reload acceptance and ratings coming from the replay.

## Task 3: actions and pages
- `app/years/actions.ts` (`"use server"`): `saveYear`, `searchCatalog` (wraps `searchAlbums`), `addFromCatalog`, `addManualAlbum`.
- `app/years/page.tsx`: year index with counts and a "Go to year" form (GET to `/years/<n>` via a small client or `redirect` action); `connection()`.
- `app/years/[year]/page.tsx`: validates `params.year` (404 via `notFound()`), previous and next links, renders the client screen with the initial view and the actions; `connection()`.
- Home page link to `/years` (keep the "Album ranker" heading; `app/page.test.tsx` must pass).
- `components/cover.tsx`: add optional `size` prop (default 125).

## Task 4: screen (`components/year-screen.tsx`, client)
- Three areas with cards (cover at 80, title, artist, rating for ranked/HM), ten numbered ranked slots with "Empty", empty-state lines, no-albums line.
- `@dnd-kit` with Mouse, Touch (200 ms delay) and Keyboard sensors; drop handler calls `applyMove` from Task 1. Card buttons: Move up, Move down, "Move to" (the two other areas), Remove, all calling the same `applyMove`.
- Optimistic update, saves serialized (queue), revert and `role="alert"` message on failure, notice for pushed-out album and removed decade entries.
- Add panel: search, results with three add buttons (ranked disabled with hint when full), move-from-another-year prompt (Move / Cancel), manual form behind "Can't find it? Add it by hand".
- Component test, actions mocked: add into each area, reorder with move buttons, move between the three areas via "Move to", remove, move-from-other-year prompt (Move and Cancel), full-ranked rule, empty states, revert after a failed save.

## Task 5: docs
- README: a short "Year pages" note; `docs/stack.md` only if it lists routes or dependencies (add dnd-kit to the table if so).

## Verify
`npm test`, `npm run lint`, `npm run typecheck`, `npm run build`. Never commit `.env`, `data/` or SQLite files.
