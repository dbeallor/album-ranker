# Artist views by decade and overall

**Status:** Shipped
**Date:** 2026-11-21
**Shipped:** in PR #26, as specified
**Ticket:** [ALBUM-8](https://github.com/dbeallor/album-ranker/issues/8), epic [#11](https://github.com/dbeallor/album-ranker/issues/11)
**Follows:** [MVP requirements](2026-11-20-album-ranker-mvp.md) § MVP features 4 and § Artist score; [Elo rating engine](2026-11-21-album-7-elo-matchup.md) § Artist score

## Goal

Rank artists by the engine's artist score, overall and one decade at a time, and let the user open an artist to see their albums. This replaces the spreadsheet's Artist Stats and Artist Summary sheets. Scores are computed from the replayed ratings on every request, so answering a matchup or changing a year's ranking shows up on the next page load.

## Score

The engine's existing functions in `lib/elo/artist-score.ts`, unchanged:

- **Overall:** `(sum of ratings + 1500) / (album count + 1)` over the artist's rated albums (ranked or honorable mention).
- **Decade:** the same rule over the artist's rated albums whose year entry is in that decade (1970 means 1970 to 1979). The decade is the year page's, not the catalog release year.
- Listed albums and albums with no year entry have no rating and count for nothing. An artist with no rated albums (overall, or in that decade) is not in that list.

## Building the lists

A pure function in `lib/artists.ts` with no database or React import, so it tests with plain fixtures:

- **Input:** the rated albums as `{ albumId, artistId, artistName, year, rating }`, and an optional decade.
- **Output:** one row per artist with at least one rated album in scope: `rank`, `artistId`, `artistName`, `score`, `ratedAlbumCount`.
- **Order:** score high to low. A tie on score goes to the artist name (case-insensitive, A first), then the artist id.
- **Rank:** the row's position, 1 to n. Tied scores still get separate ranks; the order above decides who is first.
- Scores stay unrounded in the function. The pages round them to whole numbers for display, as the matchup screen does.

A loader in `lib/artists.ts` reads the year entries, matchups and albums through the existing `loadRatings` and data functions and feeds the pure function. It does not import `server-only`, so tests can call it against an in-memory database, as `lib/ratings.ts` does. Pages reach the database only through `getDb()`.

## Pages

### Artist list: `/artists`

- Linked from the home page as "Artists".
- A decade picker as a row of links at the top: **Overall**, **1950s**, **1960s**, ... **2020s**. The current choice is marked (`aria-current="page"`) and not a link.
- **Overall** is `/artists`. A decade is `/artists?decade=1970`. Links keep the user on one page, so the browser's back button steps through decades.
- A `decade` value that is not one of 1950 to 2020 in steps of ten shows the Next.js not-found page.
- A table with columns **Rank**, **Artist**, **Score**, **Rated albums**. The artist name links to the artist page.
- A decade with no rated albums still renders the picker and says "No rated albums in the 1950s yet." Overall with none says "No rated albums yet."
- Server component, read per request (`await connection()`, as `/matchups` does), no cache.

### Artist page: `/artists/[id]`

- Heading: the artist name. Under it, "Score 1600 from 2 rated albums", or "No rated albums" when none.
- A list of the artist's albums that have a year entry, rated or listed, each with cover (the existing `Cover` component, placeholder when missing), title, year, placement and rating.
- **Placement** reads "Ranked #3", "Honorable mention" or "Listed". **Rating** is rounded to a whole number; a listed album shows "No rating".
- Albums are ordered by year ascending, then by album id.
- Albums with no year entry are left out; they aren't placed anywhere yet.
- A link back to "All artists" (`/artists`).
- An id that is not a whole number, or no artist with that id, shows the not-found page. An artist whose albums all lost their year entries still has a page with an empty album list and "No placed albums."

## Tests

Table-driven, one per rule:

- **List building (pure):** an artist with albums in three decades appears in each decade's list with only that decade's albums (score and count), and in the overall list with all of them; listed albums and unrated albums are left out; the score tie order (name, then id); ranks run 1 to n; an empty decade gives no rows; albums 1600 and 1700 give a score of 1600.
- **Loader, against an in-memory database:** answering a matchup between two artists' albums swaps their order in the overall list and in the decade list both albums sit in.
- **Pages:** one server-render test per page against an in-memory database: the list shows rank, artist link, rounded score and count, and the picker marks the current decade; the empty-decade message; an invalid decade and an unknown artist call `notFound()`; the artist page shows placement and rating text, including "Listed" with "No rating".

No tests for styling.

## Acceptance

From the ticket:

- An artist with albums rated 1600 and 1700 shows a score of 1600.
- An artist with albums in several decades shows the right albums in each decade's list and all of them in the overall list.
- Answering a matchup changes the order where the two albums' artists are listed.
- Tests cover the list building for an artist with albums in several decades.

## Out of scope

- The decade top 25 album lists (#9).
- Changing how artists are scored.
- Matching the spreadsheet's artist summary or its paired decade groups (60s and 70s, and so on). The app shows one decade at a time.
- Sorting the table by other columns, search or paging. About 390 artists fit on one page.
- Per-decade scores on the artist page.
- Splitting collaborations into separate artists.

## Calls I made

Surprising first.

- **Tied scores get separate ranks** (1, 2, 3), ordered by artist name, then id. The ticket doesn't say how ties rank; real ties are rare once ratings are unrounded.
- **The artist page lists listed albums too** (with "No rating"), so the user sees everything they placed. They count for nothing in the score. Albums with no year entry are left out.
- **The decade picker is a row of links with a `?decade=` query**, not a dropdown or a route per decade. It needs no client code and the back button works.
- **An invalid decade or artist id shows the not-found page** rather than falling back to the overall list.
- **The picker is fixed at 1950s to 2020s**, as the ticket says. An album placed in an earlier or later decade counts in the overall list but has no decade tab.
- **Scores show as whole numbers**; the engine keeps them unrounded, and ordering uses the unrounded value, so two artists shown at 1600 can be ranked 1 and 2.
- **The artist page shows only the overall score**, not per-decade scores.
- **Albums on the artist page are ordered by year**, then album id.
- **Column and label text:** "Rank", "Artist", "Score", "Rated albums", "Overall", "Ranked #3", "Honorable mention", "Listed", "No rating", "All artists".
- **The loader lives in `lib/artists.ts` without `server-only`**, matching `lib/ratings.ts`, so tests can call it. Pages still reach the database only through `getDb()`.
- **No cache.** Ratings are replayed on every request, as the matchup screen does.
