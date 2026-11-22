# Favour new and under-played albums in the matchup picker

**Status:** Shipped
**Shipped:** in PR #45, as specified
**Date:** 2026-11-22
**Ticket:** [ALBUM-43](https://github.com/dbeallor/album-ranker/issues/43)
**Follows:** [ALBUM-7 Elo matchups](2026-11-21-album-7-elo-matchup.md), [ALBUM-35 add albums to the library](2026-11-21-album-35-add-albums-library.md)
**Related:** [ALBUM-42](https://github.com/dbeallor/album-ranker/issues/42) (progress measure; not part of this ticket)

## Goal

A new album should find its place in the rankings in a handful of matchups. Today it is picked first (fewest matchups) but meets the lowest-id album near 1500, and Elo moves it at most 16 points per result. This ticket makes a new album's first matchups a binary search over the established albums, then hands over to the existing closest-rating logic.

Only `lib/elo/pick.ts` and its tests change in behaviour. No screen, schema, Elo, K or starting rating changes.

## How picking works after this ticket

Constants in `lib/elo/pick.ts`:

- `PLACEMENT_MATCHUPS = 8`: an album with fewer counted matchups than this is **new** (in placement); with this many or more it is **established**. One constant serves both words, as the ticket asks.

Steps, in order:

1. **First album: unchanged.** The album with the fewest counted matchups, random among ties (injected `random`), skipping albums with no unplayed, unavoided opponent.
2. **Placement mode** applies when the first album is new and at least one established album is an unplayed, unavoided opponent. The opponent is then chosen by binary search (below), never another new album.
3. **Otherwise: unchanged.** Closest-rated unplayed, unavoided opponent (lower id on a tie); when no unplayed pair exists, the closest-rated opponent, played or not. This covers established first albums, a library with no established albums yet, and a new album that has already met every established album.

"Never paired with another new album" holds in placement mode only. If every established opponent is played or avoided, the new album falls back to step 3 and may meet a new one.

### The binary search

Let `E` be the established albums sorted by rating ascending (id ascending on a tie), indexed `0..n-1`. For the new album `N`, keep an interval of insertion slots `[lo, hi]`, starting at `[0, n]`. Slot `s` means "above `E[s-1]` and below `E[s]`".

Replay `N`'s counted matchups against albums in `E`, oldest first (the order `matchups` arrives in), with `i` the opponent's index:

| Result for `N` | Update |
|---|---|
| wins against `E[i]` | `lo = max(lo, i + 1)` |
| loses to `E[i]` | `hi = min(hi, i)` |
| ties with `E[i]` | `lo = max(lo, i)` and `hi = min(hi, i + 1)` |

If an update leaves `lo > hi` (the user contradicted an earlier answer), the newest answer wins: a win resets `hi = n`, a loss resets `lo = 0`, a tie resets to `[i, i + 1]`.

The opponent is `E[mid]` with `mid = floor((lo + hi - 1) / 2)`, the middle of the established albums still in play. First opponent, with `n` established: the middle of the rating order. When the interval has shrunk to one slot (`lo = hi`), no album is strictly inside it, so the candidates are the two albums beside the slot, `E[lo - 1]` and `E[lo]`, which the new album keeps testing until it has `PLACEMENT_MATCHUPS`.

If the chosen opponent was already played or is in `avoid`, take the nearest candidate by index distance that is not (lower index first on a tie), looking inside `[lo, hi - 1]` first, then outside it. When none is left, step 3.

Matchups against new albums don't narrow the interval (a new album's rating says little) but do count toward `PLACEMENT_MATCHUPS`.

### The picker's input

`PickMatchup` gains `result: EloResult` (`"a" | "b" | "tie"`). `loadMatchupState` already passes the replay's `used` matchups, which carry it, so `lib/ratings.ts` needs no change. The picker stays pure with an injected `random`.

A second exported pure function, `placementSlot({ albumId, albums, matchups })`, returns the `[lo, hi]` interval above, so tests (and later the progress work in ALBUM-42) can read the picker's idea of where an album belongs without re-deriving it.

## Tests

In `lib/elo/pick.test.ts`, one table-driven test per rule. The existing tests keep their assertions; the `played` helper gains a result.

- **New album first, near the median.** Established albums with spread-out ratings (at least `PLACEMENT_MATCHUPS` matchups each), one new album at 1500 with none: it is picked first, and its opponent is the middle of the rating order, not the lowest id. Odd and even counts of established albums.
- **Direction.** After a simulated win the next opponent is rated higher than the first; after a loss, lower; after a tie, the next opponent is one of the two albums next to the first opponent in rating order.
- **No new-with-new while placing.** Three new albums and several established ones: for every `random` value and over a run of simulated answers, no new album is paired with another new album while it has fewer than `PLACEMENT_MATCHUPS` matchups.
- **Hands over.** An album with `PLACEMENT_MATCHUPS` matchups gets the closest-rated unplayed opponent as before. An all-new library, and a new album that has met every established album, use the old logic.
- **Avoid and played.** In placement mode a played or avoided midpoint is skipped for the nearest valid candidate.
- **Contradiction.** `placementSlot` with a win then a loss against the same album ends with the newest answer winning.
- **Simulation.** 20 established albums with known true strengths and ratings in true order, then one new album with a fixed true place: the loop asks `pickMatchup`, answers from the true strengths, records the result, repeats. After at most 8 matchups `placementSlot` is within 2 ranks of the true slot. Run for new albums truly at the bottom, middle and top, and a few between. No `Math.random`: the injected `random` is a fixed seeded generator.

`npm test`, `npm run lint` and `npm run typecheck` pass.

## Files

- Changed: `lib/elo/pick.ts`, `lib/elo/pick.test.ts`, `README.md` (the Matchups section gets a sentence on placement).
- No change: `lib/ratings.ts`, `lib/matchups-service.ts`, any component, the schema.

## Proof

Unit and simulation tests, run in the worktree. No UI to show. No agent runs anything against `data/album-ranker.db`.

## Leaves out

- The progress measure and its page (ALBUM-42).
- Changing Elo, K or the starting rating. Because K stays 32, a new album's **rating** still creeps toward its place (in a quick simulation of 20 albums 25 points apart, a new album truly 4th from the bottom sat in the middle of the pack by rating after 8 matchups, while the search had pinned its slot after 5). The picker places it by who it beats, not by its rating, and later closest-rating matchups close the rest. A larger K for new albums would fix that and is a separate ticket.
- A "new" badge or any other change on the matchup page.
- Using `addedAt`. "New" means few counted matchups, which covers an album added long ago and never played.

## Calls I made

- **The simulation measures the picker's placement interval, not the album's Elo rank.** With K = 32 (out of scope) the rating rank lags the true place by several positions after 8 matchups, so a "within 2 ranks by rating" test would fail or pass only by choosing a narrow ratings spread. The interval is what the picker uses to choose opponents, so that is what the test asserts. This is the call most likely to differ from what you pictured.
- **`PLACEMENT_MATCHUPS = 8`**, one constant for "new" and "established". The ticket says "a few"; 8 lets the search finish for a 20-album library (5 steps) with room to refine, and a 661-album library gets about 8 halvings. It also matches the target of 8 the ALBUM-42 ticket suggests. Change the constant to tune it.
- **`PickMatchup` carries the result** (a required field), so the picker can tell a win from a loss. Existing test helpers get a result.
- **Ties** narrow the search to the slots beside the tied album.
- **Contradictory answers**: the newest answer wins and the interval resets on that side, so a mis-click cannot trap the search.
- **Opponents already played or avoided** are replaced by the nearest valid album in the search window, then outside it, then the old logic.
- **New albums met only while placing**: with no established albums, or after meeting all of them, the old logic runs, so a fresh all-new library behaves exactly as today.
- **Only matchups against established albums narrow the search.** Matchups between two new albums count toward the threshold but add no bounds.
- **No change to how the first album is chosen**, as the ticket says: fewest matchups, random among ties.
