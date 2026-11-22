# Ranking progress: plan

**Spec:** [2026-11-22-album-42-ranking-progress.md](../specs/2026-11-22-album-42-ranking-progress.md) (approved)
**Ticket:** [ALBUM-42](https://github.com/dbeallor/album-ranker/issues/42)

Verification after every task: `npm test`, `npm run lint`, `npm run typecheck`. Tests run against in-memory databases (`lib/db/test-db.ts`), never `data/`. No migration, nothing stored. Read the relevant guide in `node_modules/next/dist/docs/` before changing page code (AGENTS.md). Use `components/ui` parts and tokens only; `lib/design-system.test.ts` must pass (no raw colors, no inline `style` beyond its allowlist).

Reuse: `ReplayMatchup` in `lib/elo/replay.ts`, `loadLibrary` in `lib/library-albums.ts`, `loadAnalytics` in `lib/analytics.ts`, `loadMatchupState` in `lib/ratings.ts`, `MatchupView` in `lib/matchups-service.ts`, `EmptyState`, `Button`/`ButtonLink`, `Card`, `Cluster`, `Stack`, `Message` from `components/ui`.

## Task 1: the measure (`lib/elo/progress.ts`, `lib/elo/progress.test.ts`)

Pure: no database, React or `server-only` import. Write the table test first.

```ts
export const PRIOR_SPREAD = 200;        // S, Elo points
export const TARGET_CONFIDENCE = 0.9;

export type RankingProgress = {
  albumCount: number;
  played: number;      // counted matchups
  confidence: number;  // 0.5 to 1
  target: number;      // TARGET_CONFIDENCE
  remaining: number;   // integer, estimated matchups still to play
  goal: number;        // played + remaining
  percent: number;     // 0 to 100, unrounded
};

export function computeProgress(
  ratings: Map<number, number>,
  used: Pick<ReplayMatchup, "albumAId" | "albumBId">[],
): RankingProgress | null; // null with fewer than two albums
export function formatPercent(value: number): string; // whole percent, rounded down
```

Algorithm (all in Elo points; `q = ln(10) / 400`):

1. `ids` = the keys of `ratings`; fewer than 2 gives null.
2. Information per album: for each used matchup with both ids in `ratings`, `p = 1 / (1 + 10^((rB - rA) / 400))` from the ratings map, `info = q² · p · (1 - p)`, added to both albums. `played` = the number of such matchups (ties count like any other).
3. Precision per album `prec_i = 1 / S² + info_i`.
4. `confidenceAt(extra)`: each album's precision becomes `prec_i + (2 · extra / n) · q² / 4` (`n` = album count; future matchups are between near-equal albums, spread evenly). For every pair, `s² = 1/prec_i + 1/prec_j`, `τ² = max(0, 2S² − s²)`, pair chance `0.5 + atan(τ / s) / π`. The result is the mean over all pairs.
5. `confidence = confidenceAt(0)`. If it is at least the target, `remaining = 0`. Otherwise double `hi` from 1 until `confidenceAt(hi) >= target` (with a loop bound), then bisect to the smallest integer `m` with `confidenceAt(m) >= target`. `remaining = m` (deterministic, no randomness).
6. `goal = played + remaining`, `percent = goal === 0 ? 0 : 100 · played / goal`.
7. `formatPercent(v)` is `String(Math.floor(v + 1e-9))` so 99.9 reads "99", 100 reads "100", and a confidence exactly at 90 reads "90".

Hot loop: avoid allocating per pair; precompute `1/prec_i` once per `confidenceAt`. Measure the time for 1,000 albums (print it in the test output, no assertion). If it takes over about 250 ms, replace the all-pairs mean with a fixed, evenly strided sample of pairs (deterministic) once `n` is large, keeping the signature and results to the nearest percent.

Table test, one table (`it.each`), rules from the spec § Tests:

- 0 and 1 albums: null.
- No matchups: confidence exactly 0.5, `percent` 0, `goal === remaining`, and for 10 and 100 albums `remaining / n` within [14.2, 14.4].
- Two albums at 1500 and a hand-computed case: the test recomputes the closed form (`info = q²/4` per matchup, `v = 1/(1/S² + k·q²/4)` for k matchups each, `s² = 2v`, `τ² = 2S² − s²`) and compares with `toBeCloseTo`.
- More matchups: confidence and percent go up, `remaining` goes down.
- Confidence at or above the target: `remaining` 0 and `percent` exactly 100, never above 100.
- Adding an album with no matchups: confidence and percent fall, goal rises.
- Same number of matchups concentrated on two of ten albums gives a lower confidence than spread evenly.
- A lopsided matchup (rating gap 400) adds less confidence than an even one (same count of matchups).
- A tie counts as a matchup (a `used` entry has no result field, so this is the played count).
- Same input twice gives deep-equal output.
- `formatPercent`: 99.9 gives "99", 100 gives "100", 90 gives "90", 0 gives "0".

## Task 2: the progress bar and the analytics panel

- `components/ui/progress.tsx` and `progress.module.css`: a wrapper over native `<progress>` taking `value`, `max` (default 100) and `aria-label` or a `label` prop; tokens only (`--color-surface-sunken` track, `--color-accent` fill, `--radius-full`, style the `::-webkit-progress-*` and `::-moz-progress-bar` pseudo elements); no inline style. Match how the other `components/ui` parts are written (a props type, `cx`, a CSS module).
- `components/ranking-progress.tsx` (server component, with a CSS module if it needs layout): takes `progress: RankingProgress | null`.
  - null: `EmptyState` "Add at least two albums to your library to track ranking progress." with a `ButtonLink` to `/search`.
  - otherwise a `Card` with the heading "Ranking progress", the whole percent (`formatPercent(percent)` followed by "%") as a number, the `Progress` bar (`aria-label` "Ranking progress"), the line "{played} of about {goal} matchups" (numbers with `toLocaleString("en-US")`), then "About {remaining} more to go" or "Target reached" when `remaining` is 0, then "Order confidence {formatPercent(confidence · 100)}% · target {formatPercent(target · 100)}%", one line of muted text: "The expected share of album pairs that are in the right order. Adding albums lowers it; playing matchups raises it.", and a `ButtonLink` "Play matchups" to `/matchups`.
- `lib/analytics.ts`: `loadAnalytics` also returns `progress: RankingProgress | null` from `computeProgress(new Map(albums.map((a) => [a.albumId, a.rating])), used)`. Do not change `AnalyticsData` or the existing return fields.
- `app/analytics/page.tsx`: render `<RankingProgress progress={progress} />` under the `PageHeader` and above the view tabs, on every view. The scope never affects it. No table column changes.
- `app/analytics/page.test.tsx`: the panel shows on all five views (`it.each` over `albums`, `artists`, `years`, `decades`, `eras`), with the percent, "of about" matchups line, the order confidence line, and a link named "Play matchups" to `/matchups`; the panel is the same under a scope (`scope=year-1975`); with fewer than two library albums (a second `describe` or a fresh in-memory database with one album) the empty state shows and "NaN" does not. The existing table expectations stay as they are.
- Add a small test for `components/ranking-progress.tsx` only if the page test cannot reach a branch; otherwise the page test covers it.

## Task 3: the matchup page

- `lib/ratings.ts`: `loadMatchupState` also returns `progress: RankingProgress | null`, computed from the ratings it already has and `used`.
- `lib/matchups-service.ts`: `MatchupView` gains `progress: RankingProgress | null`. Every path that builds a view fills it: `view()` (used by answer, skip and the fallback undo branch), and the undo branch that builds the view by hand (compute from `loadRatings(db)` and its `used`, after the delete). Keep one helper so the paths cannot drift.
- `app/matchups/page.tsx`: pass `progress` into `initial`.
- `components/matchup-screen.tsx`: next to "{count} matchups played" (keep that exact text in its own element so the existing `getByText("N matchups played")` assertions still match), show a second muted line "{formatPercent(percent)}% there · about {remaining} more to go" (or "Target reached" with 0 remaining); hidden when `progress` is null. Reuse the existing muted style.
- `lib/matchups-service.test.ts` and `components/matchup-screen.test.tsx`: update the `MatchupView` literals with the field; test that `progress` is filled by load, answer, skip and undo and that the percent changes after an answer on a throwaway database; the screen shows the line and hides it when null.

## Task 4: verify and finish

- `npm test`, `npm run lint`, `npm run typecheck` all green.
- Run the proof from the spec on throwaway data only (never `data/album-ranker.db`): the progress test prints the table of confidence, remaining and percent for 10, 100 and 1,000 albums, before and after an even set of matchups and after adding ten albums. Save the printed output to a scratch file and report it; do not commit it.
- Do not commit `data/`, any SQLite file, `.env` or recordings. Commit with conventional messages (`feat: ALBUM-42 ...`) and push the branch `feat/album-42-ranking-progress`.
