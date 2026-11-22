# Ratings from matchups only, and a listened-to library table

**Status:** Draft
**Date:** 2026-11-21
**Ticket:** [ALBUM-34](https://github.com/dbeallor/album-ranker/issues/34)
**Follows:** [Elo rating engine and matchup screen](2026-11-21-album-7-elo-matchup.md), [protect the local SQLite data](2026-11-21-album-24-protect-sqlite-data.md)

## Goal

An album's Elo comes only from the head-to-head matchups the user played. The app gets one table of the albums the user has listened to, `library_albums`, and every screen that needs an album's year reads it there. Part 1 of 5 of the "purely Elo" change; the year screen and `year_entries` stay until part 4.

## What changes for the user

- Every album that was on a year page (ranked, honorable mention or listed) is in the library and rated.
- Ratings change. The seeded wins from in-year ranks are gone, so every album starts at 1500 and only the stored matchups move it. The same 230-odd matchups now replay from 1500 instead of from the seeded ratings, so the numbers on the matchup, artist and decade screens will all move. An album nobody has played yet sits at 1500.
- Albums that were `listed` are now rated and show up on the matchup screen. Matchups that touched a `listed` album, which were skipped before (the rows stayed), now count.
- Decade lists: every library album in the decade is eligible, including former `listed` ones. Saved decade lists are not changed.
- The artist page drops the "Ranked #3 / Honorable mention / Listed" text and shows the year and rating only.
- Nothing is deleted. Every row in `matchups`, `year_entries` and `decade_list_entries` stays.

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
```

- `year` is the year the album is grouped and ranked under. The backfill copies `year_entries.year` (the sheet year), not `albums.release_year`, so no yearly or decade grouping moves.
- `added_at` is the year entry's `created_at`, the closest thing to "when it was added" the data has.
- `year_entries.album_id` is already unique, so the backfill gives exactly one row per album that had a year entry (661 on the local database).
- The migration runs in the existing runner's transaction, so it either fully applies or not at all.

## Keeping the library in step while the year screen exists

Until part 4 the year screen and the import still write `year_entries`. The year entry writers in `lib/db/year-entries.ts` keep `library_albums` in step inside the same transaction:

| Year entry change | Library change |
|---|---|
| `addYearEntry` | insert the album with that year, `added_at` now (no-op if it is already in the library) |
| `updateYearEntry`, `moveYearEntry` | set the library year to the entry's year |
| `removeYearEntry` | delete the library row |
| `setYearPlacements` | each album in the new lists is inserted or has its year set; albums dropped from the lists lose their library row |

Removing a library row never touches `matchups`: those rows stay, and replay skips them while an album is out of the library (today's rule for unrated albums).

A new module `lib/db/library.ts` holds the library reads and writes: `listLibrary(db)` (album id and year for every row), `getLibraryEntry(db, albumId)`, and the internal `putLibraryAlbum` / `removeLibraryAlbum` used by the year entry writers. Adding from the catalog is part 2, so nothing outside `year-entries.ts` writes the library yet.

## Ratings

`lib/elo/replay.ts`:

- `computeRatings({ albumIds, matchups })` starts every album id at 1500, then replays the matchups oldest first (created at, then id). A matchup with an album not in the list is skipped and left out of `used`, as today.
- `impliedResults`, `ImpliedResult` and `ReplayEntry` are deleted, with their tests.

`lib/ratings.ts` passes the library's album ids. Nothing is stored; ratings are still replayed on every call.

## Readers moved to the library

| File | Today | After |
|---|---|---|
| `lib/ratings.ts` | `loadRatings`, `loadAlbumCard`, `loadMatchupState` read year entries | read `listLibrary` / `getLibraryEntry` |
| `lib/matchups-service.ts` | `answerMatchup` gets years from year entries | from the library |
| `lib/artists.ts` | artist list years, artist page year, placement and rank | year from the library; `placement` and `rank` leave `ArtistPageAlbum`; every library album has a rating |
| `lib/decade-service.ts` and `lib/decades.ts` | picker counts and eligible albums from ranked and honorable mention year entries | from every library album; `decadeSummaries` takes library rows |
| `lib/db/decade-lists.ts` | `setDecadeList` and `removeIneligibleDecadeEntries` check for a ranked or honorable mention year entry in the decade | check for a library row in the decade |
| `lib/db/backup.ts` | counts albums, year entries, matchups | also counts library rows, shown by `db:backup` |

Still reading `year_entries` after this ticket: the year screen (`lib/year-service.ts`, `app/years/`), the import (`lib/import/`, `app/import/page.tsx`, `scripts/`), `lib/db/year-entries.ts` itself, `insertIntoDecadeBySourceRank` (import only: it reads the sheet's `source_decade_rank`, kept on the year entry) and the row counts in `lib/db/backup.ts`.

`insertIntoDecadeBySourceRank` checks eligibility against the library like the other decade writers, and still reads `source_decade_rank` from `year_entries`.

## Data safety

- Before the migration first runs on the real database, the user runs `npm run db:backup`; the PR names that backup's file name. ALBUM-24's `pre-migrate` backup is also taken automatically. `npm run db:restore -- latest` undoes it.
- No agent runs anything against `data/album-ranker.db`. Tests and the proof use throwaway databases (`lib/db/test-db.ts`) and a copy built for the proof.
- The migration adds a table and copies rows; it deletes and rewrites nothing.

## Tests

One table-driven test per rule, sized to `AGENTS.md` § Testing:

- `lib/elo/replay.test.ts`: albums with no matchups are all 1500; matchups replay oldest first from 1500; a matchup with an album not in the list is skipped and not in `used`.
- `lib/db/migrate.test.ts` (or a new `library.test.ts`): on a database at migration 002 with year entries of every placement and some matchups, applying 003 gives one library row per year entry with the same year and `added_at = created_at`, and the matchup count is unchanged.
- `lib/db/year-entries.test.ts`: one table over add, update, move, remove and `setYearPlacements`, checking the library row after each.
- Existing tests for ratings, matchups, artists and decades are updated to the new rule (year entries no longer seed ratings, listed albums are rated and eligible).

## Proof

A throwaway copy of a database at migration 002 with year entries of each placement and a few matchups, migrated: library row count equals year entry count, years match, matchup count unchanged, and all ratings with no matchups equal 1500. Screenshots of the matchup and artist page on a ticket preview over a throwaway database.

## Leaves out

- Adding albums to the library from the catalog, the album's year for those adds, and the matchup picker change (part 2).
- New rankings and the artist formula (part 3).
- Removing the year screens and dropping `year_entries` (part 4).
- The UI pass (part 5).
- Any change to the matchup picker's rules (it still pairs albums from different years, now using the library year).
- The year screen still shows no rating for `listed` albums, as today, though they now have one. It goes away in part 4.

## Calls I made

- **Removing an album from a year page removes it from the library** (and so from ratings and matchups), while its matchup rows stay. This keeps the year screen's meaning until part 4 removes it. The other choice, keeping it in the library, would leave albums rated that the user can no longer see on any year page.
- **Former `listed` albums become rated, appear on the matchup screen and are eligible for decade lists.** The ticket puts them in the library and says their skipped matchups now count, which needs them rated; the picker and decade rules follow from that.
- **The artist page loses the placement text** ("Ranked #3", "Honorable mention", "Listed") so that it stops reading `year_entries`. It shows year and rating.
- **Decade eligibility moves to "in the library in that decade"** in `lib/db/decade-lists.ts` too, not only in `lib/decade-service.ts`, so the saved-list checks and the view agree.
- **`year` is `NOT NULL`.** Part 2 must give every album added from the catalog a year (the ticket proposes `albums.release_year`, editable by the user) before it can join the library.
- **`added_at` is backfilled from `year_entries.created_at`**, not the migration time.
- **The import's decade insert keeps reading `source_decade_rank` from `year_entries`**; it is import code and that column has no other home yet.
- **`db:backup` also prints the library row count**, so a backup's summary shows the new table. Its year entry count stays.
- **Library writes live in `lib/db/library.ts`** and are called from the year entry writers in the same transaction, rather than with SQL triggers, so the rule is visible in TypeScript and tested there.
