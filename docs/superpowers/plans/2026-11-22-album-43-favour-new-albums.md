# ALBUM-43 plan: favour new and under-played albums in the matchup picker

**Spec:** [2026-11-22-album-43-favour-new-albums.md](../specs/2026-11-22-album-43-favour-new-albums.md) (approved)
**Ticket:** [ALBUM-43](https://github.com/dbeallor/album-ranker/issues/43)

Touches only `lib/elo/pick.ts`, `lib/elo/pick.test.ts` and `README.md`. Test command `npm test`; also `npm run lint` and `npm run typecheck`. Never touch `data/`.

## Task 1: placement in `lib/elo/pick.ts`

- `PickMatchup` gains `result: EloResult` (import the type from `./elo`). `lib/ratings.ts` already passes `used` matchups that carry it; confirm typecheck passes with no change there.
- Export `PLACEMENT_MATCHUPS = 8`.
- Count matchups per album as today. `isNew(album) = count < PLACEMENT_MATCHUPS`.
- Export `placementSlot({ albumId, albums, matchups }): { lo: number; hi: number }`:
  - `E` = albums with `count >= PLACEMENT_MATCHUPS`, excluding `albumId`, sorted by rating ascending, id ascending on a tie. `n = E.length`. Start `[0, n]`.
  - Walk `matchups` in the order given. For each matchup that has `albumId` on one side and an album in `E` on the other (index `i`), work out `N`'s outcome (win, loss or tie from `result` and which side `albumId` is on) and update per the spec's table, with the contradiction rule (`lo > hi`: newest answer wins; win resets `hi = n`, loss resets `lo = 0`, tie resets to `[i, i + 1]`).
- In `pickMatchup`, after choosing the first album: if it is new, build `E` the same way and, if any `E` album is an unplayed, unavoided opponent, choose by placement:
  - `mid = floor((lo + hi - 1) / 2)`. Candidate indexes: if `lo < hi`, the window `lo..hi-1` ordered by `|idx - mid|` then lower index; if `lo === hi`, the two albums beside the slot, `lo - 1` and `lo` (those that exist), ordered by lower index. Then every other `E` index ordered by distance to `mid`, lower index first. Take the first candidate whose pair is unplayed and not in `avoid`.
  - If none, fall through to the existing closest-rating logic.
- Existing behaviour for established first albums, the "passes over an album with no unplayed opponent" rule, and the played-pair fallback stays as is. Keep the code small and commented only where the why is not obvious.

## Task 2: tests in `lib/elo/pick.test.ts`

The existing tests keep their assertions; the `played` helper gains a `result` (default `"tie"`) so it typechecks. One table-driven test per rule, as the spec lists:

- new album picked first, opponent the middle of the rating order, for odd and even numbers of established albums (established albums get `PLACEMENT_MATCHUPS` matchups among themselves via a helper that builds matchups);
- after a win the next opponent is rated higher than the first, after a loss lower, after a tie one of the two albums beside the first opponent;
- three new albums plus several established ones: for several `random` values and a run of simulated answers, no new-with-new pair while a new album has fewer than `PLACEMENT_MATCHUPS`;
- an album with `PLACEMENT_MATCHUPS` matchups, an all-new library, and a new album that has met every established album all use the old closest-rating logic;
- a played or avoided midpoint is skipped for the nearest valid candidate;
- `placementSlot` with a win then a loss against the same album ends with the newest answer winning;
- simulation: 20 established albums with true strengths equal to their index, ratings in true order, one new album, true slot chosen from bottom, middle, top and a few between; loop `pickMatchup`, answer from true strengths, push the result, up to 8 times; assert `placementSlot` is within 2 of the true slot at the end. Fixed seeded generator for `random`, no `Math.random`.

## Task 3: README

Add one sentence to the Matchups section of `README.md`: a new album (fewer than 8 matchups) is first matched against established albums, halving the rating order from the middle, before ordinary closest-rating pairing takes over. Link the ALBUM-43 spec.

## Done when

`npm test`, `npm run lint` and `npm run typecheck` pass, with the output shown. Commit as `feat: ALBUM-43 favour new and under-played albums in the matchup picker` and push to `feat/album-43-favour-new-albums`.
