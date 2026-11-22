# Artist rating that rewards more good albums, and the rest of the library sorts

**Status:** Draft
**Date:** 2026-11-21
**Ticket:** [ALBUM-36](https://github.com/dbeallor/album-ranker/issues/36)
**Follows:** [matchup-only ratings, one library and an analytics page](2026-11-21-album-34-elo-library-table.md). Where the ticket text and ALBUM-34 as shipped differ, ALBUM-34 wins, as the ticket says.

## Goal

Part 3 of the "purely Elo" change. ALBUM-34 already shipped most of what this ticket describes. This ticket finishes the rest:

1. An artist rating that rewards an artist for having more good albums, not the shrunk average that treats six great albums and three alike.
2. The two library sort keys still missing (ties and last matchup), and one stable tie-break order for every sort and ranking.

## What ALBUM-34 already shipped (not rebuilt here)

Checked against `main` at `e42d4fe`:

- `/analytics` has the period views: Albums and Artists ranked per scope (lifetime, each of the four eras, a decade picker, a year picker), plus Years, Decades and Eras summary tables. Tabs switch between the album and artist ranking and keep the scope. The year view is the year picker.
- The eras (before 1960, 1960 to 1979, 1980 to 1999, 2000 on) and their edge tests at 1959/1960, 1979/1980 and 1999/2000 are in `lib/scopes.ts` and `lib/scopes.test.ts`. Album year is the library year.
- Album rows show cover, title, artist, year, rating, matchups played and W-L-T. Artist rows show score, albums counted and best album.
- `/artists` already redirects to `/analytics?view=artists` (and a `decade` param to that decade's scope); the decade filter and `buildArtistList` are gone. `/artists/[id]` shows the artist's library albums with a score.
- `/library` has a sort picker (`sort`, `dir`) with rating, title, artist, year, decade, era, matchups played, wins, losses, win rate and date added, a direction control, filters, and divider headings for the artist, year, decade and era sorts. All in the URL. An album with no matchups sorts last on win rate in either direction.

## What changes

### Artist rating: `lib/elo/artist-score.ts`

`artistScore(ratings)` becomes the ticket's proposal, unchanged:

```
excess = sum(max(0, rating - 1500))
score  = 1500 + 100 × ln(1 + excess / 100)
```

It returns undefined for an artist with no albums (as today). The constants stay 1500 (the start rating) and 100.

Behavior, with albums all at 1700 (200 above the start):

| Albums | Score | Points above 1500 |
|---|---|---|
| 1 | 1610 | 110 |
| 3 | 1695 | 195 |
| 6 | 1756 | 256 |

Six beats three, and six is 1.32 times as far above 1500 as three, not twice. At the ratings the data holds today (K is 32 and a few hundred matchups are stored, so ratings should sit close to 1500; I did not measure them), the log is close to linear: three albums at 1532 score 1567 and six score 1607. The compression shows only once an artist's albums pile up a large excess, which is the point of a sub-linear curve. Albums at 1500 (never played) and albums below 1500 add nothing, so an unplayed backlog neither helps nor hurts an artist. An artist whose albums are all unplayed scores 1500 and ranks below any artist with an album above 1500.

Used by the artist ranking on `/analytics` (every scope), the "top artist" column of the Years, Decades and Eras tables, and the score on `/artists/[id]`. Nothing else reads `artistScore`. Nothing is stored; scores are computed on each request.

### Last matchup date: `lib/elo/record.ts`

`computeRecords` also returns `lastAt`: the latest `createdAt` among the matchups the replay counted for the album, or null with none. `LibraryAlbum` gets `lastMatchupAt: string | null`, filled in `lib/library-albums.ts`.

### Library sort keys: `lib/library-view.ts`

Two new keys join the picker:

| Key | Label | Sorts by | Default direction | Dividers |
|---|---|---|---|---|
| `ties` | Ties | ties | desc | none |
| `lastmatchup` | Last matchup | `lastMatchupAt` | desc (most recent first) | none |

An album with no counted matchup sorts last on last matchup in either direction, like win rate today. The card meta line is unchanged. Only the year, artist, decade and era sorts show dividers, as today.

### One tie-break order

Today ties on a sort key, and in the rankings, fall back to the album id. They now fall back to rating (highest first), then artist name (case-insensitive), then title (case-insensitive), then album id, so the order is stable and reads sensibly:

- every library sort key's tie-break, except the artist sort, which keeps its order inside an artist: year, then title (then rating and id);
- the album ranking on `/analytics`;
- the lifetime `rank` on each library card (so the rank on the card and in the lifetime ranking agree).

A shared comparator `bestFirst` in `lib/library-view.ts` is the one definition. The artist ranking's tie-break (score, then name, then id) is unchanged. An album's rank within a period is its place among that period's albums under this same order, so it equals its lifetime place filtered to the period.

## Tests

One table-driven test per rule, sized to `AGENTS.md` § Testing:

- `lib/elo/artist-score.test.ts`: the formula for no albums, one album at 1500, albums below 1500 (add nothing), and the three-versus-six example (six scores higher, and its excess is less than double the three-album excess).
- `lib/analytics.test.ts`: two artists with three and six albums at 1700 rank six above three in the artist ranking; an artist with all albums at 1500 scores 1500 and ranks below an artist with a played album above 1500; the album ranking's tie-break (artist, then title); an album's rank in its decade, era and year agrees with its lifetime place filtered to that scope.
- `lib/elo/record.test.ts`: `lastAt` with no matchups, one, and several (the latest wins).
- `lib/library-view.test.ts`: the table gains `ties` and `lastmatchup` in both directions, an album with no matchups last on `lastmatchup` either way, and the new tie-break order (rating, artist, title, id) for a key where two albums tie.
- `app/library/page.test.tsx` and `app/artists/[id]/page.test.tsx`: updated for the new keys and score where they assert them.

## Proof

Throwaway in-memory databases only. A test over the artist ranking prints the three-versus-six table above. Screenshots on a ticket preview over a throwaway database: `/library?sort=lastmatchup` and `/library?sort=ties&dir=asc`; `/analytics?view=artists` for lifetime and one decade.

## Leaves out

- The `/analytics` page, its views and scope pickers, the library grid, sort-by-year with dividers, the removed year screen and decade lists (ALBUM-34); adding and removing library albums (ALBUM-35); a visual pass (ALBUM-38).
- New periods, charts or filters, and any change to Elo itself (K factor, start rating).
- A new period layout: the ticket's "tabs" per period is already how `/analytics` switches the album and artist ranking.

## Calls I made

- **The ticket's formula, constants and all.** `1500 + 100 × ln(1 + excess / 100)`. I did not swap in a square root; the log matches the worked numbers in the ticket.
- **Checked against the formula, not the real database.** The ticket asks the spec to check the real data. ALBUM-34's rule is that no agent runs anything against `data/album-ranker.db`, so I kept to that. The reasoning above (K of 32, a few hundred matchups, ratings near 1500) says the formula is nearly linear today and bends only for large excess. If the user wants other constants after seeing the real artist ranking, that is a one-line change.
- **Albums below 1500 add nothing**, so an artist whose only albums are below 1500 scores the base 1500, the same as an artist with only unplayed albums. They then order by name. This follows the ticket ("albums below 1500 add nothing").
- **Most of the ticket is already shipped by ALBUM-34**, so this spec lists it instead of rebuilding it. The ticket's "replace `buildArtistList` and the decade filter" is already done there (the function and filter are gone, `/artists` redirects).
- **Two new sort keys, no other new ones**: the ticket's list minus what exists already. Ties and last matchup were the only gaps.
- **The tie-break order is rating, artist, title, album id** for every sort (the ticket's order), except the artist sort keeps year then title inside an artist, which fits its dividers. This replaces ALBUM-34's album-id-only tie-break; two albums that tied before now order by artist and title.
- **Last matchup counts only matchups that counted toward ratings** (both albums in the library), the same matchups the W-L-T and played columns use.
- **The `lastmatchup` key and `ties` key have no dividers**, matching the ticket (only the sort by year shows dividers; ALBUM-34 also added them for artist, decade and era, which stay).
- **Matchup picker, import, and database schema are untouched**: no migration.
