# Elo rating engine and matchup screen

**Status:** Shipped
**Date:** 2026-11-21
**Shipped:** in PR #21, as specified
**Ticket:** [ALBUM-7](https://github.com/dbeallor/album-ranker/issues/7), epic [#11](https://github.com/dbeallor/album-ranker/issues/11)
**Follows:** [MVP requirements](2026-11-20-album-ranker-mvp.md) § Scoring: head-to-head Elo, [data model and storage](2026-11-21-album-4-data-model-storage.md)

## Goal

Turn the stored inputs (year placements and matchup answers) into one Elo rating per album, and give the user a screen that asks "which of these two do you like more?" across years. Ratings and artist scores are computed by replay on every request and never stored. There is one algorithm and no settings.

## Rating engine

Pure functions in `lib/elo/`, with no database, React or `server-only` import, so they test with plain fixtures. A thin server-only loader (`lib/ratings.ts`) reads the year entries and matchups from the database and calls them.

### Elo update

- Every rated album starts at `1500`. `K = 32`. Both are constants in code.
- `expected_A = 1 / (1 + 10 ^ ((rating_B - rating_A) / 400))`.
- `score_A` is 1 for a win, 0.5 for a tie, 0 for a loss. `delta = K × (score_A - expected_A)`; A gains `delta`, B loses it.
- Ratings are kept as unrounded numbers. Screens round them for display.

### Who is rated

Only albums with a `ranked` or `honorable_mention` year entry. A `listed` album, or an album with no year entry, has no rating, is not in the result and is never served on the matchup screen.

### Implied results

Derived from the year entries on every replay, never stored:

- Within a year, each ranked album beats every album ranked below it, and every ranked album beats every honorable mention.
- Honorable mentions don't play each other. Listed albums don't play.
- Rank gaps don't matter: rank 1 and rank 4 with no 2 or 3 is one implied result.

### Replay order

1. Implied results, year by year ascending. Within a year, ranked albums in rank order (rank 1 first), each against the ranked albums below it in rank order, then against the year's honorable mentions in album id order.
2. Explicit matchup answers, oldest first (created at, then id). A matchup whose album A or album B has no rating is skipped; its row stays, so placing the album again brings the answer back. A matchup between two albums now in the same year still counts.

The same inputs always give the same ratings.

### Artist score

`(sum of ratings + 1500) / (album count + 1)` over the artist's rated albums. The per-decade version uses only the artist's albums whose year entry is in that decade. An artist with no rated albums (overall or in that decade) has no score. These are functions only; the artist and decade pages that show them are #8 and #9.

## Matchup picking

A pure function that takes the rated albums (id, year, rating), the explicit matchups, the pairs to avoid this session and a random number source (so tests pass a fixed one).

1. **Pairs** are unordered: A against B is the same pair as B against A. "Already played" means an explicit matchup exists for the pair, whatever its result.
2. **First album:** the rated album with the fewest explicit matchups (counting only matchups that the replay used), random among ties. Albums with no unplayed opponent in another year are passed over in favour of the next fewest.
3. **Opponent:** a rated album from a different year whose pair with the first album is not played and not avoided this session, with the closest rating. A tie on rating goes to the lower album id.
4. **Left or right:** the first album is album A, shown on the left.
5. **When every cross-year pair has been played or avoided:** fall back to the closest-rated cross-year pair for the first album, played or not, so the user can keep going. The acceptance rule "never a pair already played while an unplayed pair exists" still holds, because the fallback runs only when none exists.
6. **No pair possible:** fewer than two rated albums in different years. The screen says so and links to the home page.

Picking reads the whole set each time. At the MVP's size (about 670 rated albums, a few thousand answers) the replay and the pick take milliseconds, so there is no cache.

## Matchup screen

A new route, `/matchups`, linked from the home page.

- **Layout:** two album covers side by side, each with title, artist and year. The existing `Cover` component, with the placeholder for an album with no cover URL. On a narrow screen the two cards still sit side by side, each half the width.
- **Answers:** a button under each cover ("I like this more"), a "Tie" button and a "Skip" button between them.
- **Picking or tie:** records the matchup, recomputes ratings and serves the next pair. A line above the pair shows the last answer's effect, for example "Getz / Gilberto 1500 → 1516, Kind of Blue 1500 → 1484".
- **Skip:** records nothing and serves the next pair. The skipped pair goes on a list kept in the page's state and is avoided until the page is reloaded.
- **Undo:** deletes the newest matchup (whatever session it came from) and serves that pair again so the user can answer it differently. Undo works repeatedly, one answer at a time, and is disabled when no matchups exist. The last-answer line shows the ratings going back.
- **Counter:** "N matchups played", the total number of explicit matchups stored.
- **Server side:** the page is a server component that loads the first pair. Answer, skip and undo are server actions that return the next state (pair, counter, last-answer line). The answer action checks that both album ids are rated and in different years before recording; anything else is refused with a message and nothing is stored.
- **Errors:** a failed action shows a message and keeps the current pair on screen.

## Tests

Table-driven unit tests with fixed inputs, one per rule:

- **Elo update:** 1500 v 1500, A wins: 1516 and 1484. 1500 v 1500 tie: no change. Unequal ratings, win, loss and tie, against hand-worked numbers.
- **Implied results:** a fixture year with ranks 1, 2 and 4, two honorable mentions and a listed album gives exactly ranked over lower ranked and ranked over honorable mention, in the replay order above, and nothing else.
- **Replay:** the same inputs twice give the same ratings; explicit answers apply after implied ones; a matchup with an unrated album is skipped; deleting the last answer and replaying gives the previous ratings exactly.
- **Artist score:** 1600 and 1700 give (1600 + 1700 + 1500) / 3 = 1600; one album; no rated albums; the decade version leaves out other decades.
- **Picking:** never two albums from the same year, never a listed album, never a played pair while an unplayed one exists, never an avoided (skipped) pair while another exists; the fewest-matchups album goes first; closest rating wins; the fallback when every pair is played; no pair possible.
- **Screen:** a component test of the client part with the server actions mocked: picking, tie, skip and undo call the right action and render the next pair, the counter and the last-answer line; undo is disabled at zero.
- **Server actions:** against an in-memory database, an answer moves both ratings and undo restores them; a same-year or listed pair is refused.

## Acceptance

From the ticket:

- Two new albums at 1500, A wins: A is 1516, B is 1484. A tie between 1500 and 1500 changes nothing. Replaying the same inputs twice gives the same ratings.
- On a fixture year with no explicit matchups, the replay plays exactly the implied results: ranked over lower ranked, ranked over honorable mention, nothing else.
- Answering a matchup changes both ratings. Undo restores the previous ratings exactly.
- The screen never serves two albums from the same year, a listed album, or a pair already played while an unplayed pair exists.
- An artist with albums rated 1600 and 1700 has a score of (1600 + 1700 + 1500) / 3 = 1600.
- Unit tests cover each function with fixed inputs; the screen is covered by a component test.

## Out of scope

- Other scoring algorithms, a settings screen, points tables or year weights.
- Artist and decade pages that show the results (#8, #9).
- Importing the spreadsheet (#10), and adding albums to years (#6). Until #6 lands, the screen only has albums that tests or a script put in the database.
- Storing or caching ratings.
- Keyboard shortcuts for answering.

## Calls I made

Surprising first.

- **Undo serves the undone pair again**, so the user can re-answer it. The ticket only says undo deletes the last answer.
- **Undo reaches back past this session.** It deletes the newest matchup in the database, as the data layer's undo does, and can be pressed repeatedly.
- **The screen shows the last answer's rating change** ("1500 → 1516"), so the user can see the ratings update. It does not show ratings on the cards before answering, to avoid nudging the choice.
- **Skipped pairs are avoided until the page reloads**, per the MVP spec. The ticket says only that a skip serves the next pair.
- **When every cross-year pair has been played, the screen serves played pairs again** (closest rating) instead of saying "done". The ticket doesn't say what happens then.
- **"Fewest explicit matchups" counts only matchups the replay used**: answers against an album that is now unrated or listed don't count.
- **An album with no unplayed opponent is passed over** for the next fewest-matchups album, so the first pick never forces a replayed pair while an unplayed one exists elsewhere.
- **Closest-rating ties go to the lower album id**, not random, to keep tests simple. Only the first album is random.
- **The first album is shown on the left** and stored as album A.
- **The answer action re-checks the pair** (both rated, different years) rather than trusting the browser.
- **No cache.** Ratings are replayed on every request.
- **Engine in `lib/elo/` with no `server-only`**, plus a server-only loader in `lib/ratings.ts`.
- **Counter is the all-time total** of stored matchups, not this session's.
- **Button labels:** "I like this more", "Tie", "Skip", "Undo".
- **The screen's test is a component test**, not end-to-end; the repo has no browser test setup yet.
