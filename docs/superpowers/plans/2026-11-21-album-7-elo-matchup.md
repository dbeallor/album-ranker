# ALBUM-7 Elo engine and matchup screen: plan

**Spec:** [2026-11-21-album-7-elo-matchup.md](../specs/2026-11-21-album-7-elo-matchup.md)

Run `npm install` first (no node_modules in the worktree). Read the relevant guides in `node_modules/next/dist/docs/` before touching pages or server actions (Next here has breaking changes; `searchParams` is async; server-only modules import `server-only`). Use `lib/db/test-db.ts` (`memoryDb`, `seedAlbums`) for DB tests; never open the file DB.

## Task 1: engine (`lib/elo/`, pure, no `server-only`, no db import)
- `elo.ts`: constants `START_RATING=1500`, `K=32`; `expectedScore(a,b)`; `applyResult(ratingA, ratingB, result: "a"|"b"|"tie")` returning new pair.
- `replay.ts`: `computeRatings({ entries, matchups })` where entries are `{albumId, year, placement, rank}` and matchups `{id, albumAId, albumBId, result, createdAt}`; returns `{ ratings: Map<albumId, number>, used: matchups actually replayed }`. Implied results per spec (year ascending; rank order; then honorable mentions by album id); explicit matchups sorted by createdAt then id; skip those with an unrated album.
- `artist-score.ts`: `artistScore(ratings: number[])` (undefined for none), and a decade variant taking albums with year.
- `pick.ts`: `pickMatchup({ albums:[{id,year,rating}], matchups (used only), avoid: Set of pair keys, random: () => number })` returning `{a,b} | undefined`, per spec § Matchup picking (fewest matchups, random among ties via `random`, passes over albums with no unplayed opponent, closest rating, lower id tiebreak, fallback to played pairs, avoid list, undefined when impossible). Export `pairKey(idA,idB)`.
- Tests (table-driven, fixed inputs) as listed in the spec § Tests: Elo update, implied results/replay order, determinism, unrated matchup skipped, undo-equals-previous, artist score, picking rules.

## Task 2: loader and actions
- `lib/ratings.ts` (`server-only`-free so tests can import; takes `db`): `loadRatings(db)` reading `listAllYearEntries`, `listMatchups` and returning ratings + used matchups; `loadMatchupState(db, avoid, random)` returning `{ pair: {a: AlbumCard, b: AlbumCard} | null, count, ratings }` where AlbumCard has id, title, artist name, year, coverUrl.
- `app/matchups/actions.ts` (`"use server"`, uses `getDb()`): `answerMatchup(albumAId, albumBId, result, avoid)`, `skipMatchup(a, b, avoid)`, `undoMatchup(avoid)`. Each returns the next state `{ pair, count, lastAnswer: {text} | null, canUndo }` or `{ error }`. `answerMatchup` re-checks both albums are rated and in different years, else error and nothing stored. Undo uses `undoLastMatchup`, then returns the undone pair as the next pair. Put the logic in plain functions taking `db` (e.g. `lib/matchups-service.ts`) so action tests use an in-memory db; the `"use server"` file only wraps them with `getDb()`. Validate inputs (integers, result enum).
- Tests against an in-memory db: answer moves both ratings; undo restores exactly and re-serves the pair; same-year, listed and unknown-album pairs refused with nothing stored.

## Task 3: screen
- `app/matchups/page.tsx`: server component loading the first state with `getDb()`; renders client component `components/matchup-screen.tsx` with initial state and the three actions as props (so the component test passes mocks).
- Client component: two cards (`Cover`, title, artist, year) side by side, "I like this more" under each, "Tie", "Skip", "Undo" (disabled when `canUndo` false), "N matchups played", last-answer line, error message in `role="alert"`, "no pair" message with a link home. Skipped pairs kept in component state as pair keys sent to the actions as `avoid`.
- Extend `components/cover.tsx` only if needed for a missing cover URL (placeholder).
- Link to `/matchups` from `app/page.tsx` (keep the "Album ranker" heading; `app/page.test.tsx` must pass).
- One component test with mocked actions: pick, tie, skip, undo render next pair/counter/line; undo disabled at zero.

## Task 4: docs
- README: a short "Matchups" note. `docs/stack.md` only if it lists routes or modules.

## Verify
`npm test`, `npm run lint`, `npm run typecheck`, `npm run build`. Never commit `.env`, `data/` or SQLite files.
