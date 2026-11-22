# Show progress toward settled rankings

**Status:** Draft
**Date:** 2026-11-22
**Ticket:** [ALBUM-42](https://github.com/dbeallor/album-ranker/issues/42)

## Goal

Tell the user how close the rankings are to definitive, so they know when enough matchups have been played: one overall percentage, plus a "settled" or "needs more" status for each album. The percentage shows at the top of `/analytics` (all five views) and next to the matchup count on `/matchups`. The Albums view also shows each album's status.

The ticket asks the user for a suggestion on how to measure "definitive". This spec lays out the options, recommends one, and builds that one. Choosing another is a change to one pure function (`lib/elo/progress.ts`); the pages, the data they read and the tests around them stay the same.

## What exists today (checked against `main` at `ebf7273`)

- `computeRatings` (`lib/elo/replay.ts`) starts every library album at 1500 and replays the stored matchups with Elo, returning the ratings and `used`, the matchups that counted (both albums in the library).
- `computeRecords` (`lib/elo/record.ts`) turns `used` into per-album played, wins, losses, ties and last matchup date. `loadLibrary` (`lib/library-albums.ts`) returns the library albums and `used`.
- `/analytics` (`app/analytics/page.tsx`) has the Albums, Artists, Years, Decades and Eras views. `loadAnalytics` (`lib/analytics.ts`) loads the library per request and returns the rows plus every library album.
- `/matchups` (`app/matchups/page.tsx`, `components/matchup-screen.tsx`) shows "N matchups played". Answer, skip and undo return a `MatchupView` (`lib/matchups-service.ts`) that the screen swaps in, so anything the screen shows has to be in that view to stay current.
- Nothing measures how sure a rating is. There is no progress bar or badge in `components/ui`.

## Options for "definitive"

All four are computed by replay from the stored matchups on each request, with nothing stored, as ratings are today.

| | What "settled" means | Overall % | Strengths | Weaknesses |
|---|---|---|---|---|
| **1. Matchup count against a target** | An album is settled at T matchups. | Mean of min(played, T) / T over all albums. | Cheap and easy to explain ("3 more matchups for this album"). A new album drops the percentage, as it should. | Does not check that the order is actually resolved. Eight matchups against the same opponent count as eight. |
| **2. Rating uncertainty (Glicko-style deviation)** | The album's deviation is under a threshold. It starts at 350 and shrinks with each matchup, faster against well-rated opponents. | Mean of per-album progress. | The most principled measure of how sure a rating is. Runs beside Elo without changing ratings. | A second rating model to explain, tune and test. "Why is this album at 87%?" has no short answer. |
| **3. Rank stability** | An album's neighbours in the ranking are resolved: they played it, or their rating gap exceeds a margin. | Share of resolved adjacent pairs. | Closest to "the order is definitive". | Noisy with few matchups, and the margin is hard to choose without real data. Hard to tell the user what to do next. |
| **4. Comparison-graph coverage** | At least k distinct opponents, and every album linked to the rest through played pairs. | Share of albums meeting it. | Catches an album that played one opponent many times. | Says nothing about how many matchups or how precise the rating is, so too weak alone. |

### Recommendation: option 1 with option 4's distinct-opponent minimum

An album is **settled** when it has at least 8 counted matchups **and** at least 5 distinct opponents. This is the ticket's recommendation. It is the only option where the answer to "what do I do next?" is a number the user can act on ("2 more matchups, 1 more opponent"), it needs no new model, and the distinct-opponent condition closes option 1's one real hole. Option 3 stays a later upgrade if the count turns out not to track the order well. It would replace the function body and nothing else.

## What changes

### The measure: `lib/elo/progress.ts` (new, pure)

```ts
export const TARGET_MATCHUPS = 8;
export const TARGET_OPPONENTS = 5;

export type AlbumProgress = {
  albumId: number;
  played: number;          // counted matchups with this album
  opponents: number;       // distinct library albums it played against
  matchupsNeeded: number;  // max(0, 8 - played)
  opponentsNeeded: number; // max(0, min(5, albums - 1) - opponents)
  settled: boolean;        // both needed counts are 0
  progress: number;        // 0 to 1
};

export type RankingProgress = {
  /** 0 to 100, unrounded. 0 with no albums. */
  percent: number;
  albumCount: number;
  settledCount: number;
  albums: Map<number, AlbumProgress>;
};

computeProgress(albumIds: number[], used: Pick<ReplayMatchup, "albumAId" | "albumBId">[]): RankingProgress
```

Rules:

- **Opponents needed is capped by the library.** An album can have at most `albums - 1` distinct opponents, so the target is `min(5, albums - 1)`. In a 3-album library the opponent condition is 2, not 5, so it can be met.
- **Per-album progress** is `min(1, played / 8, opponents / requiredOpponents)`; the opponent term is 1 when the required count is 0. So progress is 1 exactly when the album is settled, and being over the target never pushes it past 1.
- **Overall percent** is 100 times the mean of the per-album progress. It reaches 100 exactly when every album is settled, and a new album with no matchups lowers it.
- Only `used` matchups count, the same matchups behind the played column. A repeated pair counts toward played each time and toward opponents once. A tie counts as a played matchup. A skip stores nothing. Undo removes the matchup, so progress can go down.
- Pure and deterministic: no randomness, no clock, nothing stored. Loading the same data twice gives the same numbers.

Worked cases (library of 10 albums unless noted, target 8 matchups and 5 opponents):

| Album | Played | Opponents | Settled | Progress |
|---|---|---|---|---|
| New, no matchups | 0 | 0 | no | 0 |
| Half way | 4 | 4 | no | 0.5 (4/8; 4/5 is higher) |
| Played one rival 8 times | 8 | 1 | no | 0.2 (1/5) |
| At target | 8 | 5 | yes | 1 |
| Over target | 20 | 9 | yes | 1 |

### Showing it

**Display rounding.** The panel and the matchup screen show the whole percent rounded **down** (`formatPercent` in `lib/elo/progress.ts`), so 100% appears only when every album is settled and 99.6% never reads as done.

**Analytics panel.** A new `components/ranking-progress.tsx` renders above the view tabs on every view:

- the heading "Ranking progress", the whole percent as a number, and a bar;
- "X of Y albums settled";
- a "Play matchups" button linking to `/matchups`;
- with zero library albums, an empty state instead ("Add albums to your library to track ranking progress.") with a link to `/search`, never "NaN%".

The panel is library-wide. It does not change with the scope picker. `loadAnalytics` returns the `RankingProgress` next to the rows, computed from the library albums' ids and `used`.

**Progress bar.** A new `components/ui/progress.tsx` wraps the native `<progress>` element (value and max, so no inline style and screen readers get the value), styled in a CSS module with tokens only.

**Albums view status column.** One new last column, "Status", on the album ranking table: "Settled", or "Needs 3 more matchups", "Needs 2 more opponents", or "Needs 3 more matchups, 2 more opponents" (singular for 1). It reads the album's library-wide progress, so an album shows the same status in every scope. The other four views get the panel but no new column.

**Matchup page.** `MatchupView` gains `progressPercent: number | null` (the whole percent rounded down, null with no library albums). Every path that builds a view fills it: the page's initial load, answer, skip, and both branches of undo. The screen shows "N% settled" in its own line beside "N matchups played", so the percentage updates after each answer without a reload. With no albums the percent is hidden.

## Tests

Sized to the repo's rule: one table-driven test per rule, none for styling.

- `lib/elo/progress.test.ts`, one table:
  - no albums (0%, no NaN);
  - one album with no matchups (0%);
  - every album at the target (100%, all settled);
  - an album over the target does not push the total over 100;
  - adding an album with no matchups lowers the percentage;
  - 8 matchups against one opponent is `needs more` (opponentsNeeded 4) and drags the percent below 100;
  - the opponent target is capped by the library size (a 3-album library settles with 2 opponents);
  - ties and a repeated pair: ties count as played, a repeated pair counts once as an opponent;
  - the missing counts (`matchupsNeeded`, `opponentsNeeded`) for an in-between album;
  - the same input twice gives equal output;
  - `formatPercent` rounds down (99.9 reads 99, 100 reads 100).
- `app/analytics/page.test.tsx`: the panel (percent, "X of Y albums settled", the `/matchups` link) shows on all five views; the Albums view shows a status for every row, in lifetime and in a scoped view; the empty state with no albums. The existing row-text expectations gain the Status cell.
- `lib/matchups-service.test.ts` and `components/matchup-screen.test.tsx`: `progressPercent` is filled by load, answer, skip and undo and goes up after an answer that adds a first matchup; the screen shows it, and hides it when null. The existing `MatchupView` literals gain the field.
- `lib/design-system.test.ts` must keep passing (tokens only, no inline style).

## Proof

Throwaway in-memory databases only; nothing runs against `data/album-ranker.db`. The progress table test prints the worked cases above. Screenshots on a ticket preview over a throwaway database seeded with a few albums at different stages: `/analytics` (Albums view with statuses, and one other view) and `/matchups` with the percentage. Not proven: that the settled threshold matches the user's real feel of "enough", since no agent reads the real database.

## Leaves out

- Any change to how Elo ratings or the artist rating are calculated.
- Which pair the matchup picker chooses (#43, Favour new and under-played albums in the matchup picker). This ticket only reads matchups.
- Stopping or locking matchups once the rankings are settled.
- Per-scope percentages (era, decade, year), a second percentage per artist, and trend charts over time.
- A setting for the two targets. They are constants in one file.
- No new tables or columns, no migration, nothing stored.

## Calls I made

Surprising first.

- **The overall percentage uses the stricter per-album progress, not the ticket's literal sum.** The ticket's option 1 formula is the sum of min(played, 8) over albums divided by albums × 8. With the distinct-opponent condition added, that formula can read 100% while albums are still "needs more" (an album that played one rival 8 times). I use `min(1, played / 8, opponents / required)` per album, so 100% means every album is settled and the percent never contradicts the status column. Where the opponent condition is already met, the two formulas give the same number.
- **The measure is option 1 plus option 4's distinct-opponent minimum, as the ticket recommends.** Targets are 8 matchups and 5 distinct opponents, the ticket's numbers. The options table above is there so the user can pick otherwise; the change is local to `lib/elo/progress.ts` and its test table.
- **The opponent target is capped at `albums - 1`.** Without the cap an album in a small library could never be settled. A 3-album library needs 2 opponents per album.
- **"Settled" means enough matchups were played, not that the order is proven.** The page says "settled", as the ticket does. It is a count target; option 3 would be the upgrade if it turns out not to track the order.
- **The percentage shows rounded down.** So "100%" always means every album is settled.
- **The panel is library-wide, on all five views, and does not follow the scope picker.** Per-album status is also library-wide, so an album's status is the same in every scope. The ticket asks for a library-wide "overall percentage".
- **The matchup page percentage updates after every answer, skip and undo.** That puts a new field in `MatchupView`, which the ticket's "shows the same overall percentage" implies but does not spell out.
- **A new `components/ui/progress.tsx`**, a wrapper over the native `<progress>` element, because `components/ui` has no bar and the ticket says to use those parts only. It adds no inline style.
- **A library with one album shows 0%** (the ticket's test case) and "Needs 8 more matchups", even though no matchup is possible yet. The matchup page already tells the user to add a second album.
- **Only counted matchups.** Matchups involving an album outside the library do not count, the same as the played column. Skips store nothing.
- **Status wording:** "Settled", or "Needs 3 more matchups, 2 more opponents" (parts that are zero are left out).
- **No page test for `/matchups`.** The server page only passes `progressPercent` through; the service and screen tests cover it.
