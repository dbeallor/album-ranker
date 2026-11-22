# Ratings from matchups only, a library table, and analytics in place of decade lists

**Status:** Draft (revised after "changes 34")
**Date:** 2026-11-21
**Ticket:** [ALBUM-34](https://github.com/dbeallor/album-ranker/issues/34)
**Follows:** [Elo rating engine and matchup screen](2026-11-21-album-7-elo-matchup.md), [decade top 25 lists](2026-11-21-album-9-decade-top-25.md), [protect the local SQLite data](2026-11-21-album-24-protect-sqlite-data.md)

## Goal

Matchups are the only manual input that decides anything. An album's Elo comes only from the head-to-head matchups the user played. The app keeps one table of the albums the user has listened to, `library_albums`. Decade top 25 lists go away completely. In their place the app shows rankings computed from the ratings, for a year, a decade, an era or a lifetime, each as an album ranking and an artist ranking, plus a library page that sorts and filters the whole library.

The user asked for this in the Chief of Staff thread: "remove decade lists altogether, i don't want anything else manual other than matchups, just show me analytics by year, decade, era (pre 60s, 60s and 70s, 80s and 90s, 00s and after), and lifetime, artist rankings and album rankings for each, give me lots of sorting options for the full library as well".

## What changes for the user

- Every album that was on a year page (ranked, honorable mention or listed) is in the library and rated.
- Ratings change. The seeded wins from in-year ranks are gone, so every album starts at 1500 and only the stored matchups move it. The same 230-odd matchups now replay from 1500 instead of from the seeded ratings, so every rating number moves. An album nobody has played yet sits at 1500.
- Albums that were `listed` are now rated and show up on the matchup screen. Matchups that touched a `listed` album, which were skipped before (the rows stayed), now count.
- **Decade lists are gone**: the `/decades` screens, their code and the `decade_list_entries` table, with its 68 saved entries. The import stops writing decade lists.
- **New `/rankings` page**: pick Lifetime, an era, a decade or a year, then see the album ranking or the artist ranking for it. It replaces the artist list at `/artists`.
- **New `/library` page**: every library album in one table, sortable by any column in either direction and filterable.
- The artist page drops the "Ranked #3 / Honorable mention / Listed" text and shows the year, rating and matchup record.
- The year screen stays for now (it is still how albums get into the library until ALBUM-35), but its placements no longer change any rating or ranking.
- Nothing else is deleted. Every row in `matchups` and `year_entries` stays.

## Schema: migration `003_library.sql`

```sql
CREATE TABLE library_albums (
  album_id INTEGER PRIMARY KEY REFERENCES albums (id) ON DELETE CASCADE,
  year INTEGER NOT NULL CHECK (year BETWEEN 1900 AND 2100),
  added_at TEXT NOT NULL
);

CREATE INDEX library_albums_year ON library_albums (year);

INSERT INTO library_albums (album_id, year, added_at)
  SELECT album_id, year, created_at FROM year_entries;

DROP TABLE decade_list_entries;
```

- `year` is the year the album is grouped and ranked under. The backfill copies `year_entries.year` (the sheet year), not `albums.release_year`, so no yearly grouping moves.
- `added_at` is the year entry's `created_at`.
- `year_entries.album_id` is already unique, so the backfill gives exactly one row per album that had a year entry (661 on the local database).
- `year_entries.source_decade_rank` stays as an unused column. ALBUM-37 drops `year_entries` as a whole.
- The runner applies the migration in one transaction, so it either fully applies or not at all.

## Keeping the library in step while the year screen exists

Until the year screen goes away, it and the import still write `year_entries`. The year entry writers in `lib/db/year-entries.ts` keep `library_albums` in step in the same transaction:

| Year entry change | Library change |
|---|---|
| `addYearEntry` | insert the album with that year, `added_at` now (no-op if it is already in the library) |
| `updateYearEntry`, `moveYearEntry` | set the library year to the entry's year |
| `removeYearEntry` | delete the library row |
| `setYearPlacements` | each album in the new lists is inserted or has its year set; albums dropped from the lists lose their library row |

Removing a library row never touches `matchups`. Those rows stay, and replay skips them while an album is out of the library.

`lib/db/library.ts` holds the library reads and writes: `listLibrary(db)` (album id, year, added at), `getLibraryEntry(db, albumId)`, and `putLibraryAlbum` / `removeLibraryAlbum`, which only the year entry writers call.

## Ratings

`lib/elo/replay.ts`:

- `computeRatings({ albumIds, matchups })` starts every album id at 1500, then replays the matchups oldest first (created at, then id). A matchup with an album not in the list is skipped and left out of `used`, as today.
- `impliedResults`, `ImpliedResult` and `ReplayEntry` are deleted, with their tests.

`lib/ratings.ts` passes the library's album ids. Nothing is stored; ratings are still replayed on every request.

## Scopes

`lib/scopes.ts`, pure:

| Scope | Albums in it | URL value |
|---|---|---|
| Lifetime | every library album | `lifetime` |
| Era: Pre-60s | year < 1960 | `era-pre-60s` |
| Era: 60s and 70s | 1960 to 1979 | `era-60s-70s` |
| Era: 80s and 90s | 1980 to 1999 | `era-80s-90s` |
| Era: 00s and after | year ≥ 2000 | `era-00s-on` |
| Decade | the ten years from a multiple of 10 (1970 means 1970 to 1979) | `decade-1970` |
| Year | that year | `year-1975` |

`parseScope(value)` returns the scope or null (the page then 404s), and `inScope(scope, year)` decides membership. The decade and year pickers list only decades and years that have at least one library album. All four eras are always listed.

## Rankings page `/rankings`

`/rankings?scope=<value>&view=albums|artists`, default `lifetime` and `albums`.

- Top: tabs for Lifetime and the four eras, then a decade select and a year select (each a GET form, so it works without JavaScript and every view has a URL).
- **Album ranking**: every library album in the scope by rating, highest first, tie to the lower album id. Columns: rank, cover, title, artist (links to the artist page), year, rating (rounded), matchups played, W–L–T.
- **Artist ranking**: one row per artist with an album in the scope, by `artistScore` over those albums (today's formula, `lib/elo/artist-score.ts`: `(sum of ratings + 1500) / (albums + 1)`), highest first, ties as today (name, then id). Columns: rank, artist (link), score (rounded), albums in scope, best album in scope.
- Empty scope: "No albums in <scope> yet."
- `/artists` redirects to `/rankings?view=artists`, and `/artists?decade=1970` to `/rankings?scope=decade-1970&view=artists`, so old links keep working. `/artists/[id]` stays.
- `/decades` and `/decades/<decade>` are removed and 404.

## Library page `/library`

One table of every library album, server-rendered from the URL: `/library?sort=<key>&dir=asc|desc&q=<text>&scope=<scope value>&played=all|played|unplayed`.

Columns: cover, title, artist (link), year, decade, era, rating (rounded), lifetime rank, matchups played, wins, losses, ties, win rate, added.

Sort keys, each in either direction (clicking a column header sorts by it; clicking again flips the direction):

| Key | Sorts by | Default direction |
|---|---|---|
| `rating` | rating | desc |
| `rank` | lifetime rank | asc |
| `title` | title, case-insensitive | asc |
| `artist` | artist name, then year, then title | asc |
| `year` | year, then rating desc | desc |
| `decade` | decade, then rating desc | desc |
| `era` | era, then rating desc | asc |
| `played` | matchups played, then rating desc | desc |
| `wins` | wins | desc |
| `losses` | losses | desc |
| `winrate` | wins + half the ties over matchups played (unplayed albums last in both directions) | desc |
| `added` | added at | desc |

Every sort ends with the album id ascending, so the order is stable. The default is `rating` desc.

Filters: `q` matches title or artist (case-insensitive, contains), `scope` uses the scopes above (default lifetime), `played` keeps all, only albums with at least one counted matchup, or only albums with none. The page shows the row count ("412 of 661 albums"). An unknown `sort`, `dir` or `played` falls back to the default; an unknown `scope` 404s.

Sorting and filtering are a pure function in `lib/library-view.ts` (`buildLibraryRows(albums, ratings, used matchups, options)`), so they test without a database.

## Matchup record

`lib/elo/record.ts`, pure: from the replay's `used` matchups, per album: played, wins, losses, ties. Used by the rankings page, the library page and the artist page.

## Readers moved to the library

| File | After |
|---|---|
| `lib/ratings.ts` | `loadRatings`, `loadAlbumCard`, `loadMatchupState` read the library |
| `lib/matchups-service.ts` | `answerMatchup` gets years from the library |
| `lib/artists.ts` | year from the library; `placement` and `rank` leave `ArtistPageAlbum`; the decade-only artist list moves into the rankings loader |
| `lib/db/backup.ts` | counts library rows too, shown by `db:backup` |

Still reading `year_entries`: the year screen (`lib/year-service.ts`, `app/years/`), the import (`lib/import/`, `app/import/`, `scripts/`), `lib/db/year-entries.ts` itself and the row counts in `lib/db/backup.ts`.

## Removed

- `app/decades/` (pages and actions), `components/decade-list.tsx`, `lib/decades.ts`, `lib/decade-service.ts`, `lib/db/decade-lists.ts`, their tests, the `DecadeListEntry` type and `decadeArtistScore`.
- `removedDecadeEntries` from the year entry writers, the year screen and the import resolve flow.
- The import's decade list writes and its summary lines ("Decade lists", "Decade list full", "Decade rank dropped"). The sheet's decade rank column is still read and stored in `source_decade_rank`, so old sheets import without errors, but nothing uses it.
- Nav and home page links to Decades and Artists; new links to Rankings and Library.

## Data safety

- Before the migration first runs on the real database, the user runs `npm run db:backup`; the PR names that backup's file name. ALBUM-24's `pre-migrate` backup is also taken automatically. `npm run db:restore -- latest` undoes it, including the dropped decade lists.
- This migration deletes data: the 68 decade list entries. That is what "remove decade lists altogether" asks for, and the backups keep them.
- No agent runs anything against `data/album-ranker.db`. Tests and the proof use throwaway databases.

## Tests

One table-driven test per rule, sized to `AGENTS.md` § Testing:

- `lib/elo/replay.test.ts`: albums with no matchups are all 1500; matchups replay oldest first from 1500; a matchup with an album not in the list is skipped.
- Migration test: on a database at migration 002 with year entries of every placement, decade list entries and matchups, applying 003 gives one library row per year entry with the same year and `added_at = created_at`, the matchup count is unchanged, and `decade_list_entries` no longer exists.
- `lib/db/year-entries.test.ts`: one table over add, update, move, remove and `setYearPlacements`, checking the library row after each.
- `lib/scopes.test.ts`: parse and membership for each scope kind, including the era edges (1959, 1960, 1979, 1980, 1999, 2000) and bad values.
- `lib/elo/record.test.ts`: played, wins, losses, ties from a few matchups including a tie.
- `lib/library-view.test.ts`: one table over every sort key in both directions, plus each filter.
- Rankings loader: album and artist ranking for one scope of each kind.
- Page tests for `/rankings` and `/library` (renders rows, sort links carry the URL state) and the `/artists` redirects.
- Existing tests for ratings, matchups, artists, the year screen and the import are updated; decade tests are deleted with their code.

## Proof

A throwaway database at migration 002 with year entries of each placement, decade list entries and some matchups, migrated: library rows equal year entries, years match, matchup count unchanged, decade table gone, unplayed albums at 1500. Screenshots on a ticket preview over a throwaway database: `/rankings` (lifetime albums, an era's artists, a year), `/library` sorted two ways with a filter, and an artist page.

## Leaves out

- Adding albums to the library from the catalog, the year for those adds, and the matchup picker change (ALBUM-35, which the Chief of Staff is editing).
- A new artist formula: this ticket keeps today's `artistScore`.
- Removing the year screens and dropping `year_entries` (ALBUM-37).
- The UI pass (ALBUM-38).
- Charts. "Analytics" here means the ranking and library tables.
- Paging: the library page renders every row (661 today).

## Calls I made

- **The migration drops `decade_list_entries` and its 68 saved entries** rather than leaving an unused table. The user said "remove decade lists altogether"; the backups keep them.
- **This ticket now takes the rankings and the library page** that the first draft left to later parts, because the Chief of Staff's revision asked for them here. It keeps today's artist formula; a formula change, if still wanted, is ALBUM-36's.
- **The year screen stays until ALBUM-37** even though the user wants nothing manual but matchups. Until ALBUM-35 adds albums from the catalog, it and the import are the only ways into the library. Its placements no longer affect any number.
- **Removing an album from a year page removes it from the library** (and so from ratings, rankings and matchups). Its matchup rows stay.
- **Former `listed` albums become rated** and appear on the matchup screen, in rankings and in the library.
- **Era edges**: Pre-60s is before 1960; 60s and 70s is 1960 to 1979; 80s and 90s is 1980 to 1999; 00s and after is 2000 on. Eras and decades use the library year (the sheet year), not the catalog release year.
- **Year and decade pickers list only years and decades that have albums.**
- **`/artists` redirects to the rankings page** instead of staying as a second artist list. `/decades` 404s with no redirect.
- **Win rate counts a tie as half a win**; unplayed albums sort last either way.
- **Library state lives in the URL** (server-rendered sort and filter links), so every view can be bookmarked and needs no client code.
- **The artist page loses the placement text** and gains the matchup record.
- **The import still reads the sheet's decade rank column** and stores it unused, so existing sheets import without errors.
- **`year` is `NOT NULL`.** ALBUM-35 must give every album added from the catalog a year before it can join the library.
- **`added_at` is backfilled from `year_entries.created_at`.**
- **`db:backup` also prints the library row count.**
- **Library writes live in `lib/db/library.ts`**, called from the year entry writers in the same transaction, not in SQL triggers.
