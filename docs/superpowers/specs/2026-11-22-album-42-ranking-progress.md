# Show progress toward a settled overall ranking

**Status:** Draft (revised after the user's change request)
**Date:** 2026-11-22
**Ticket:** [ALBUM-42](https://github.com/dbeallor/album-ranker/issues/42)

## Goal

Tell the user how many matchups are left before the overall order is approximately right, as one progress bar over the **total number of matchups**. The goal is not a fixed number. It is an estimate that moves: it is computed from a statistical **order confidence** in the Elo ratings, so adding albums raises it (the bar drops) and playing matchups lowers it (the bar rises).

There is nothing per album. The first draft had a "settled or needs more" status per album; the user asked to drop that. Getting every album enough matchups belongs to the separate picker ticket (#43, Favour new and under-played albums in the matchup picker).

The percentage and the confidence show at the top of `/analytics` on all five views, and on `/matchups` next to the matchup count.

## What exists today (checked against `main` at `ebf7273`)

- `computeRatings` (`lib/elo/replay.ts`) starts every library album at 1500 and replays the stored matchups with Elo (K = 32), returning the ratings and `used`, the matchups that counted (both albums in the library).
- `loadLibrary` (`lib/library-albums.ts`) returns the library albums (with `rating`) and `used`. `loadAnalytics` (`lib/analytics.ts`) calls it per request.
- `/matchups` shows "N matchups played". Answer, skip and undo return a `MatchupView` (`lib/matchups-service.ts`) that the screen swaps in, so anything the screen shows has to be in that view to stay current. `loadMatchupState` (`lib/ratings.ts`) already has the ratings and `used`.
- Nothing measures how sure the ratings are. `components/ui` has no progress bar.

## Options for the statistical measure

The user asked for a measure that says "the overall order should be approximately right", ideally an overall confidence in the Elo scores, that changes as albums are added. All four options are computed by replay from the stored matchups on each request, with nothing stored.

| | The goal ("approximately right") | Moves when albums are added? | Strengths | Weaknesses |
|---|---|---|---|---|
| **A. Fixed matchups per album** | k × albums matchups in total (say 12 per album). | Yes, linearly. | Trivial and easy to explain. | Not statistical, and says nothing about how the matchups are spread. 200 matchups among 10 albums count the same as 200 spread over 100. |
| **B. Sorting information bound** | About c × log2(albums!) matchups in total. | Yes. | A recognised bound for ordering n items. | Assumes noiseless, well-chosen matchups, so c is a guess. Ignores what has been played and how Elo ratings behave. |
| **C. Order confidence from rating uncertainty (recommended)** | The expected share of album pairs that are in the right order reaches 90%. The goal in matchups is how many more are needed to get there. | Yes. A new album is unknown, so confidence drops and the goal rises. | One quantified number the user asked for ("overall confidence in the Elo scores"). Uses where the matchups actually went. A concentrated set of matchups scores low, an even one scores high. | A model with a few assumptions (below). Needs a short explanation on the page. |
| **D. Rank stability over time** | The order from N matchups ago and now agree. | Only indirectly. | No model, purely empirical. | Needs the history replayed at several points. Noisy early, and can say "stable" while a stale, under-played album sits in the wrong place. Does not give a matchup count to go. |

### Recommendation: option C

It is the only option that gives both the confidence number and a matchup goal from the same model, and it reacts to the two things the user named: adding albums, and playing them. It needs no new tables. Option D is a possible later cross-check.

## The measure (option C)

A pure function in `lib/elo/progress.ts`. The model is a standard Bayesian one for ratings:

1. **Prior.** Before any matchup, an album's true rating is unknown: it is spread around the start rating with a standard deviation of **S = 200** Elo points. (Elo's own scale: 200 points is about a 76% expected score.)
2. **Information from each matchup.** A counted matchup tells the model about both albums. Information in Elo units is `q² · p · (1 − p)`, where `q = ln(10) / 400` and `p` is the expected score from the two albums' current ratings. A matchup between near-equal albums (`p = 0.5`) carries the most. A lopsided one carries less. A tie counts like any other matchup.
3. **Uncertainty per album.** `v_i = 1 / (1/S² + I_i)`, where `I_i` is the sum of the information from the album's counted matchups. An album with no matchups has `v = S²`. Uncertainty only goes down as it plays.
4. **Confidence for one pair.** For two albums with `s² = v_i + v_j` and `τ² = 2S² − s²`, the chance the current order of the pair matches the true order is `1/2 + arctan(τ / s) / π`. With no matchups it is exactly 50% (a coin flip). As `s` shrinks it rises toward 100%.
5. **Order confidence** is the mean of the pair chances over all pairs of library albums: the expected share of pairs in the right order. It runs from 50% (nothing known) to 100%.
6. **The goal.** The target confidence is **90%**. The function finds the smallest number of **extra matchups** `m` that brings the order confidence to 90%, assuming the new matchups go to near-equal albums (`p = 0.5`, so each adds the largest amount of information) and are spread evenly over all albums. `remaining = m`, and `goal = played + remaining`, where `played` is the counted matchups so far. It is 0 once the confidence is already 90% or more.
7. **Progress** is `100 × played / goal`, from 0 to 100, and 100 only when `remaining` is 0.

```ts
export const PRIOR_SPREAD = 200;     // S, Elo points
export const TARGET_CONFIDENCE = 0.9;

export type RankingProgress = {
  albumCount: number;
  played: number;      // counted matchups
  confidence: number;  // 0.5 to 1
  target: number;      // 0.9
  remaining: number;   // estimated matchups still to play
  goal: number;        // played + remaining
  percent: number;     // 0 to 100, unrounded
};

/** Null with fewer than two albums, since there are no pairs to order. */
computeProgress(ratings: Map<number, number>, used: Pick<ReplayMatchup, "albumAId" | "albumBId">[]): RankingProgress | null
formatPercent(value: number): string   // whole percent, rounded down
```

The search for `m` is a deterministic bisection (grow `m` by doubling, then bisect to the integer), so no randomness, no clock, and the same data gives the same numbers. The cost is one pass over all pairs per step, so about 500,000 pairs for a library of 1,000 albums.

### What the numbers look like

Starting from nothing (no matchups), every album is equally unknown, so the goal comes out the same shape for any library: about **14.3 matchups per album**.

| Albums | Goal from a clean start | Confidence at the start |
|---|---|---|
| 10 | 143 matchups | 50% |
| 100 | 1,430 matchups | 50% |
| 1,000 | 14,293 matchups | 50% |

For 100 albums with 700 matchups spread evenly (each album in 14), the confidence is about 86%, about 730 more are needed, and the bar reads about 49%. Add 10 new albums with no matchups and the confidence falls to about 84%, about 910 more are needed, and the bar drops to about 44%. (Worked out by running the formulas above in a throwaway script, not measured on the real database.)

## What changes

- **`lib/elo/progress.ts`** (new): the function above and its constants.
- **`lib/analytics.ts`:** `loadAnalytics` also returns the `RankingProgress | null`, from the library ratings and `used`.
- **`components/ui/progress.tsx`** (new): a wrapper over the native `<progress>` element (value and max, so no inline style and screen readers get the value), styled in a CSS module with tokens only.
- **`components/ranking-progress.tsx`** (new): the panel on `/analytics`, above the view tabs, on every view:
  - the heading "Ranking progress", the whole percent and the bar;
  - "N of about M matchups", then "About R more to go" (or "Target reached" at 0);
  - "Order confidence 74% · target 90%", and one line saying what it means: "The expected share of album pairs that are in the right order. Adding albums lowers it; playing matchups raises it.";
  - a "Play matchups" button to `/matchups`;
  - with fewer than two albums, an empty state instead ("Add at least two albums to your library to track ranking progress.", with a link to `/search`), never "NaN%".
- **`/matchups`:** `MatchupView` gains `progress: RankingProgress | null`. Every path that builds a view fills it: the page load, answer, skip and both branches of undo. The screen shows "N% there · about R more to go" beside "N matchups played", so it updates after every answer without a reload. With null it is hidden.
- The panel is library-wide. It does not change with the scope picker.

## Tests

Sized to the repo's rule: one table-driven test per rule, none for styling.

- `lib/elo/progress.test.ts`, one table:
  - no albums and one album return null;
  - no matchups: confidence exactly 50%, percent 0, `goal = remaining`, about 14.3 per album (a range check for 10 and 100 albums);
  - two albums and a hand-computed case from the formulas above (the result is checked against the closed form in the test);
  - more matchups raise the confidence and the percent, and lower `remaining`;
  - confidence at or above 90% gives `remaining` 0 and percent exactly 100, and never over 100;
  - adding an album with no matchups lowers the confidence and the percent and raises the goal;
  - the same number of matchups concentrated on two albums of ten scores lower than spread evenly;
  - a lopsided matchup (a large rating gap) adds less confidence than an even one;
  - a tie counts as a matchup;
  - the same input twice gives equal output;
  - `formatPercent` rounds down (99.9 reads 99, 100 reads 100).
- `app/analytics/page.test.tsx`: the panel (percent, "N of about M matchups", confidence, the `/matchups` link) shows on all five views, follows no scope, and the empty state shows with fewer than two albums. The existing table expectations do not change, since no column is added.
- `lib/matchups-service.test.ts` and `components/matchup-screen.test.tsx`: `progress` is filled by load, answer, skip and undo and changes after an answer; the screen shows it and hides it when null. The existing `MatchupView` literals gain the field.
- `lib/design-system.test.ts` must keep passing.
- A performance check in the build: a 1,000-album library computes in well under a second (the test records the time; it does not assert on it).

## Proof

Throwaway in-memory databases only; nothing runs against `data/album-ranker.db`. The progress test prints a table of confidence, remaining and percent for libraries of 10, 100 and 1,000 albums, before and after an even set of matchups and after adding ten albums. Screenshots on a ticket preview over a throwaway database: `/analytics` (the panel on the Albums view and on one other view) and `/matchups` with the progress line. Not proven: how close the goal comes to the user's real sense of "enough", since no agent reads the real database.

## Leaves out

- Per-album status, a "settled" badge, a status column, distinct-opponent rules, or any per-album count (the user dropped them; #43 owns getting every album enough matchups).
- Any change to how Elo ratings or the artist rating are calculated, or to which pair the picker chooses.
- Stopping or locking matchups once the target is reached. The bar just shows 100%.
- Per-scope percentages, a setting for the target or the prior, and trend charts over time.
- No new tables or columns, no migration, nothing stored.

## Calls I made

Surprising first.

- **The goal moves.** `goal = played + estimated remaining`, so the bar can go down: adding albums, or matchups that change the ratings, can raise the estimate. This is what the user asked for ("ever-changing"). The bar is the share of the way there, not a fixed countdown.
- **I dropped everything per album**, as the user said: no status, no needs-more counts, no distinct-opponent rule. The first draft's formula and acceptance cases are replaced by the ones above. The ticket's per-album unit tests no longer apply.
- **The measure is a Bayesian "expected share of pairs in the right order" (option C).** The user asked for a statistical measure and "an overall confidence rating in the Elo scores", and this is the one that also yields a matchup goal. The options table is there so they can pick another.
- **The tuning constants are mine:** target confidence 90% ("about 9 of 10 pairs in the right order"), prior spread of true ratings 200 Elo points, and assumed future matchups of near-equal albums spread evenly. They are four named constants in one file. A higher target or a wider prior raises the goal.
- **The confidence uses the matchups' information, not the spread the ratings currently show.** Early Elo ratings are compressed (few matchups, K = 32), so reading the spread off them would make the goal swing while the ratings settle. The cost is that it cannot notice a library whose real tastes are unusually flat or unusually wide.
- **Elo with a constant K is noisier than the model says.** The model treats each rating as an average of its matchups, so it is a little optimistic. Not modelled.
- **The projection assumes matchups are spread evenly.** If the picker favours the least-played albums (#43), the real number needed should be lower, and the estimate will fall as that lands. Until then it is a cautious number.
- **Fewer than two albums shows an empty state**, not 0%. With one album there is no pair to order.
- **Percentages show rounded down**, so "100%" appears only when the estimate says nothing remains, and "90%" confidence only when it has reached the target.
- **The panel is library-wide, on all five views, and does not follow the scope picker.** The ticket asks for an overall number.
- **`MatchupView` grows a `progress` field** so the percentage stays live without a reload. That is implied by the ticket's "shows the same overall percentage" but not spelled out.
- **A new `components/ui/progress.tsx`** over the native `<progress>` element, because `components/ui` has no bar and the ticket says to use those parts only.
- **Speed.** The confidence looks at every pair of albums, so the cost grows with the square of the library. If the 1,000-album timing in the build is slow (over about 250 ms), the build switches to a fixed, evenly strided sample of pairs; the function's signature and results to the nearest percent stay the same.
- **No page test for `/matchups`.** The server page only passes the field through; the service and screen tests cover it.
