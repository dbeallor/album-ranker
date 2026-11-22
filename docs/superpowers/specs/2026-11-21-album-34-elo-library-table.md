# Matchup-only ratings, one library, and an analytics page

**Status:** Draft (second revision after "changes 34")
**Date:** 2026-11-21
**Ticket:** [ALBUM-34](https://github.com/dbeallor/album-ranker/issues/34)
**Follows:** [Elo rating engine and matchup screen](2026-11-21-album-7-elo-matchup.md), [protect the local SQLite data](2026-11-21-album-24-protect-sqlite-data.md). Replaces [per-year ranking screen](2026-11-21-album-6-year-ranking-screen.md) and [decade top 25 lists](2026-11-21-album-9-decade-top-25.md).

## Goal

Matchups are the only manual input. An album's Elo comes only from the head-to-head matchups the user played. Every album the user has listened to is one row in `library_albums`, with the year it is grouped under. Year entries, the year ranking screen and the decade top 25 lists are removed. The user sorts and filters the library, and reads rankings on one analytics page.

The user's words, in the Chief of Staff thread:

- "remove decade lists altogether, i don't want anything else manual other than matchups, just show me analytics by year, decade, era (pre 60s, 60s and 70s, 80s and 90s, 00s and after), and lifetime, artist rankings and album rankings for each, give me lots of sorting options for the full library as well"
- "no year entrys, no year screen, you should just be able to sort the library by year, which should show dividers between the album grid when that sort mode is chosen, and see yearly analytics on an analytics page"

## What changes for the user

- Every album that was on a year page (ranked, honorable mention or listed, 661 on the local database) is in the library, under the same year, and rated.
- **The year screen is gone**, and so are the in-year ranks and honorable mentions it stored. `year_entries` is dropped: 265 ranks and 327 honorable mentions are deleted, and only each album's year survives (in the library).
- **Decade lists are gone**: the screens, their code and the `decade_list_entries` table with its 68 saved entries.
- Ratings change. The seeded wins from in-year ranks are gone, so every album starts at 1500 and only the stored matchups move it. An album nobody has played yet sits at 1500. Matchups that touched a `listed` album, which were skipped before, now count. Every `matchups` row stays.
- **New `/library` page**: an album grid of the whole library with many sort orders and filters. Sorting by year puts a divider heading above each year's albums.
- **New `/analytics` page**: album and artist rankings for Lifetime, each era, each decade and each year, plus summary tables by year, decade and era.
- The import adds albums straight to the library. Ranks, honorable mentions and decade ranks in the sheet are still read, so existing sheets import, but nothing uses them.
- Until ALBUM-35 adds albums from the catalog, the import is the only way to add an album (the year screen's add panel goes with the year screen).

## Schema: migration `003_library.sql`

```sql
CREATE TABLE library_albums (
  album_id INTEGER PRIMARY KEY REFERENCES albums (id) ON DELETE CASCADE,
  year INTEGER NOT NULL CHECK (year BETWEEN 1900 AND 2100),
  added_at TEXT NOT NULL,
  source_title TEXT,
  source_artist TEXT,
  source_year INTEGER,
  UNIQUE (source_title, source_artist, source_year),
  CHECK (
    (source_title IS NULL AND source_artist IS NULL AND source_year IS NULL)
    OR (source_title IS NOT NULL AND source_artist IS NOT NULL AND source_year IS NOT NULL)
  )
);

CREATE INDEX library_albums_year ON library_albums (year);

INSERT INTO library_albums (album_id, year, added_at, source_title, source_artist, source_year)
  SELECT album_id, year, created_at, source_title, source_artist, source_year FROM year_entries;

DROP TABLE decade_list_entries;
DROP TABLE year_entries;
```

- `year` is the year the album is grouped, sorted and ranked under. The backfill copies the sheet year (`year_entries.year`), not `albums.release_year`, so no grouping moves.
- `added_at` is the year entry's `created_at`.
- The `source_*` columns are the sheet row the import made the album from, moved off `year_entries` so a second import of the same sheet still skips rows it already wrote.
- `year_entries.album_id` is unique, so the backfill gives exactly one library row per album that had a year entry.
- `import_review_items` keeps its columns (its `source_placement`, `source_rank` and `source_decade_rank` become unused). Its `rank_taken` reason stays allowed so old rows still load; new rows never use it.
- The runner applies the migration in one transaction: all of it or nothing.

`lib/db/library.ts`: `listLibrary(db)`, `getLibraryEntry(db, albumId)`, `findLibraryEntryBySource(db, key)`, `addToLibrary(db, { albumId, year, source })` and `setLibraryYear(db, albumId, year, source)`. Year checked to 1900 to 2100.

## Ratings

`lib/elo/replay.ts`: `computeRatings({ albumIds, matchups })` starts every album id at 1500, then replays the matchups oldest first (created at, then id). A matchup with an album not in the list is skipped and left out of `used`. `impliedResults`, `ImpliedResult` and `ReplayEntry` are deleted. `lib/ratings.ts` passes the library's album ids. Ratings are still replayed on every request, never stored.

`lib/elo/record.ts`, pure: from the replay's `used` matchups, per album: played, wins, losses, ties.

The matchup screen keeps its picker. It still pairs albums from different years, using the library year (ALBUM-35 changes the picker).

## Import

- `writeRow`: an album already in the library is a `duplicate_album` review item (detail: its library year). Otherwise it creates or reuses the album and adds it to the library with the row's year and source. No rank check, no decade write.
- `resolveReviewItem`: adds the album to the library with the row's year and source. If the chosen album is already in the library, it fails with `album_in_library` (was `album_on_year_page`) and offers "Move it here", which sets the library year and source to the row's. The `rank_taken` failure and all decade handling go.
- Import summary: the "Decade lists", "Decade list full" and "Decade rank dropped" lines go. Rows are still validated as today, so a bad rank or decade rank still shows its existing warning and is then ignored.
- The import page shows "In your library (1975)" where it said "On the 1975 year page".

## Scopes

`lib/scopes.ts`, pure, used by both pages:

| Scope | Albums in it | URL value |
|---|---|---|
| Lifetime | every library album | `lifetime` |
| Pre-60s | year < 1960 | `era-pre-60s` |
| 60s and 70s | 1960 to 1979 | `era-60s-70s` |
| 80s and 90s | 1980 to 1999 | `era-80s-90s` |
| 00s and after | year ≥ 2000 | `era-00s-on` |
| Decade | ten years from a multiple of 10 | `decade-1970` |
| Year | that year | `year-1975` |

`parseScope(value)` returns the scope or null (the page 404s), `inScope(scope, year)` decides membership, and `eraOf(year)` names the era. Decade and year pickers list only decades and years with at least one library album; the four eras are always listed.

## Library page `/library`

An album grid (the existing `CardGrid` and `Cover`), server-rendered from the URL: `/library?sort=<key>&dir=asc|desc&q=<text>&scope=<scope>&played=all|played|unplayed`. A GET form at the top holds the sort select, the direction toggle and the filters, so it works without JavaScript and every view has a URL.

Each card: cover, title, artist (links to the artist page), year, rating (rounded), lifetime rank, W–L–T.

| Sort key | Sorts by | Default direction | Dividers |
|---|---|---|---|
| `rating` (default) | rating | desc | none |
| `title` | title, case-insensitive | asc | none |
| `artist` | artist name, then year, then title | asc | one per artist |
| `year` | year, then rating desc within the year | desc | one per year, e.g. "1975 · 12 albums" |
| `decade` | decade, then rating desc | desc | one per decade |
| `era` | era, then rating desc | asc | one per era |
| `played` | matchups played, then rating desc | desc | none |
| `wins` | wins, then rating desc | desc | none |
| `losses` | losses, then rating desc | desc | none |
| `winrate` | (wins + ties / 2) / played; unplayed albums last in both directions | desc | none |
| `added` | added at | desc | none |

The direction flips the main key only (for `year` desc, newest year first, best album first inside each year). Every order ends with album id ascending, so it is stable. A divider is a heading (`h2`) above its group's grid, so screen readers can jump between years.

Filters: `q` matches title or artist (case-insensitive, contains); `scope` keeps one scope (default lifetime); `played` keeps all, only albums with a counted matchup, or only albums with none. The page shows "412 of 661 albums". An unknown `sort`, `dir` or `played` falls back to the default; an unknown `scope` 404s.

Sorting, grouping and filtering are one pure function, `buildLibraryView(albums, options)` in `lib/library-view.ts`, which returns the groups (heading or none, albums), so it tests without a database or React.

## Analytics page `/analytics`

`/analytics?view=albums|artists|years|decades|eras&scope=<scope>`, default `albums` and `lifetime`. Tabs pick the view; for `albums` and `artists`, tabs for Lifetime and the four eras plus a decade select and a year select pick the scope.

- **Albums**: every library album in the scope by rating, highest first, tie to the lower album id. Columns: rank, cover, title, artist (link), year, rating, played, W–L–T.
- **Artists**: one row per artist with an album in the scope, by `artistScore` over those albums (today's formula: `(sum of ratings + 1500) / (albums + 1)`), ties by name then id. Columns: rank, artist (link), score, albums in scope, best album in scope.
- **Years**, **Decades**, **Eras**: one row per period that has albums, in time order. Columns: period (links to that scope's album ranking), albums, matchups played (counted matchups with at least one album from the period, each counted once), average rating, top album, top artist. "Yearly analytics" is the Years table plus each year's album and artist ranking.
- Empty scope: "No albums in <scope> yet."

## Removed

- `app/years/`, `app/decades/`, `components/year-screen.tsx`, `components/year-add-panel.tsx`, `components/decade-list.tsx`, `lib/year-service.ts`, `lib/year-placements.ts`, `lib/decades.ts`, `lib/decade-service.ts`, `lib/db/year-entries.ts`, `lib/db/decade-lists.ts`, their tests, and the `YearEntry`, `Placement`-on-entries and `DecadeListEntry` types (the import keeps `Placement` for reading the sheet).
- `decadeArtistScore`; the `/artists` list page becomes a redirect.
- Nav and home page: Years, Decades and Artists go; Library and Analytics come in. Nav: Search, Library, Matchups, Analytics, Import.

Old links: `/artists` → `/analytics?view=artists`, `/artists?decade=1970` → `/analytics?view=artists&scope=decade-1970`, `/years` → `/library?sort=year`, `/years/1975` → `/analytics?scope=year-1975`, `/decades` → `/analytics?view=decades`, `/decades/1970` → `/analytics?scope=decade-1970`. `/artists/[id]` stays, listing the artist's library albums with year, rating and W–L–T.

## Backups

`Counts` becomes albums, library albums, matchups. For a database from before 003 (an old backup), the library count is its year entry count, since 003 turns each year entry into a library row. `db:backup` and `db:restore` print "661 albums, 661 library albums, 230 matchups".

## Data safety

- This migration deletes data the user entered by hand: 265 in-year ranks, 327 honorable mentions, the listed flags and 68 decade list entries. The user asked for exactly this. The backups keep all of it.
- Before the migration first runs on the real database, the user runs `npm run db:backup`; the PR names that file. ALBUM-24's `pre-migrate` backup is also taken automatically. `npm run db:restore -- latest` undoes everything.
- No agent runs anything against `data/album-ranker.db`. Tests and the proof use throwaway databases.

## Tests

One table-driven test per rule, sized to `AGENTS.md` § Testing:

- `lib/elo/replay.test.ts`: no matchups gives all 1500; matchups replay oldest first from 1500; a matchup with an album not in the list is skipped.
- Migration test: a database at 002 with year entries of each placement (some with a source row, some without), decade list entries and matchups. After 003: one library row per year entry with the same year, `added_at` and source; matchup count unchanged; `year_entries` and `decade_list_entries` gone.
- `lib/db/library.test.ts`: add, duplicate add, set year, source lookup, year bounds.
- Import: one table over `writeRow` and `resolveReviewItem` cases (new album, album already in library, move it here, manual, re-import skips a row already written).
- `lib/scopes.test.ts`: parse and membership for each scope kind, including the era edges 1959, 1960, 1979, 1980, 1999, 2000, and bad values.
- `lib/elo/record.test.ts`: played, wins, losses, ties, including a tie.
- `lib/library-view.test.ts`: one table over every sort key in both directions (order and divider headings), plus each filter.
- Analytics loader: albums and artists for one scope of each kind; the years, decades and eras tables.
- Page tests: `/library` (cards, dividers under `sort=year`, form keeps URL state), `/analytics` (each view), the old-link redirects.
- `lib/db/backup.test.ts`: counts on a new and a pre-003 database.

## Proof

A throwaway database at 002, filled like the real one (year entries of each placement, decade entries, matchups), migrated: library rows equal year entries, years match, matchups unchanged, both old tables gone, unplayed albums at 1500. Screenshots on a ticket preview over a throwaway database: `/library` sorted by year with dividers, sorted by win rate with a filter; `/analytics` lifetime albums, an era's artists, the Years table and one year; an artist page.

## Leaves out

- Adding albums from the catalog and the matchup picker change (ALBUM-35).
- A new artist formula: today's `artistScore` stays.
- The UI pass (ALBUM-38).
- Charts: analytics are tables.
- Paging: the library renders every album (661 today).
- Editing an album's library year (needs a screen; ALBUM-35 adds albums and can add this).
- Dropping the unused columns on `import_review_items`.

## Calls I made

- **The migration deletes the in-year ranks, honorable mentions, listed flags and decade lists**, keeping only each album's year. That is what "no year entries" and "remove decade lists altogether" mean; the backups keep the rest.
- **Until ALBUM-35, the import is the only way to add albums.** The year screen's add panel goes with the screen.
- **The library page is an album grid**, as the user described, not a table. Sort and filter controls are a form above it.
- **Dividers also appear for the artist, decade and era sorts**, not only year, since they group the same way.
- **Year sort defaults to newest year first**, best album first inside each year.
- **The analytics page also has Years, Decades and Eras summary tables** (albums, average rating, top album, top artist per period), which is what I took "yearly analytics" to mean beyond each year's rankings.
- **Old year, decade and artist URLs redirect** to the matching library or analytics view.
- **The sheet's import source moves onto `library_albums`** so re-importing the same sheet still skips rows already written.
- **The import still reads ranks, honorable mentions and decade ranks** so existing sheets import with their usual warnings, then ignores them.
- **Former `listed` albums become rated** and appear in matchups, the library and analytics.
- **Era edges**: Pre-60s is before 1960, 60s and 70s is 1960 to 1979, 80s and 90s is 1980 to 1999, 00s and after is 2000 on, all by library year.
- **Win rate counts a tie as half a win**; unplayed albums sort last either way.
- **The matchup picker keeps its "different years" rule** with the library year; ALBUM-35 owns picker changes.
- **The artist formula is today's**; a new one would be a separate ticket.
- **A backup from before this migration reports its year entry count as library albums.**
- **`year` is required on every library row**, so ALBUM-35 must give each album added from the catalog a year.
- **`added_at` is backfilled from the year entry's `created_at`.**
