# ALBUM-53 matchup variety: plan

Spec: [2026-11-22-album-53-matchup-variety.md](../specs/2026-11-22-album-53-matchup-variety.md)

## Task 1: picker (`lib/elo/pick.ts`)

- Add exported `MIN_ESTABLISHED_FOR_PLACEMENT = 8` and `RECENT_MATCHUPS = 3`.
- `placementOpponent` returns undefined when `establishedByRating(...)` has fewer than `MIN_ESTABLISHED_FOR_PLACEMENT` albums (the ordinary closest-rating opponent then runs).
- Recent set: established albums in the last `RECENT_MATCHUPS` counted matchups that involve at least one new album (fewer than `PLACEMENT_MATCHUPS` matchups). Matchups between two established albums are not placement matchups and are skipped when collecting them.
- Candidate order: window not-recent, window recent, outside not-recent, outside recent; each group by distance to `mid`, then index. Played/avoided still skipped.

## Task 2: tests (`lib/elo/pick.test.ts`)

Table-driven, per the spec's Tests section: one established album (30 new, 20 seeded answers, no album in over a quarter of matchups, picks equal the ordinary picker's); 7 vs 8 established; recent opponents (20 established, 10 new, no established album in two consecutive matchups, first opponent within 2 places of the middle); window before recency. Existing tests keep their assertions.

## Task 3: README

Update the placement sentence in the Play section: names the 8-established-albums minimum and the recency rule.

## Verify

`npm test`, `npm run lint`, `npm run typecheck`.
