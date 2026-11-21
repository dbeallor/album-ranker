# Data model and storage

**Status:** Shipped
**Date:** 2026-11-21
**Shipped:** in PR #18, with differences: [as-built](../as-built/2026-11-21-album-4-data-model-storage.md)
**Ticket:** [ALBUM-4](https://github.com/dbeallor/album-ranker/issues/4), epic [#11](https://github.com/dbeallor/album-ranker/issues/11)
**Follows:** [MVP requirements](2026-11-20-album-ranker-mvp.md) § Data model outline, [stack and scaffold](2026-11-20-album-3-stack-scaffold.md)

## Goal

Create the SQLite schema and a small data access layer that the later tickets read and write: artists, albums, year entries, matchups, decade lists and import review items. Only inputs are stored. Ratings and artist scores are computed by the Elo engine (#7) and never written to the database.

## Storage

- **Driver: Node's built-in `node:sqlite`** (`DatabaseSync`). Node 24 or newer is already required, so this adds no dependency and no native build. Calls are synchronous, which suits one user and one file.
- **No ORM.** Plain SQL in the data access layer, with TypeScript types for each row. Six tables don't need a query builder.
- **One file** at `DATABASE_PATH` (`lib/config.ts`, default `./data/album-ranker.db`). Opening it creates the parent folder if missing, turns on foreign keys, WAL mode and a busy timeout, then applies pending migrations.
- **Migrations** are numbered SQL files in `lib/db/migrations/` (`001_initial.sql`, ...). A small runner applies the ones not yet recorded in a `schema_migrations` table, each in its own transaction, in number order. A migration that fails rolls back and stops the app with its file name in the error.
- `npm run db:migrate` creates the file and applies migrations without starting the app. The README's "Run the app" section gains this step. The app also migrates on first open, so the step is optional.
- The connection is a lazily opened singleton for the server. Everything in `lib/db/` imports `server-only`, except what the migrate script and tests need to load outside Next.js (the plan settles how).
- **Tests** open a fresh in-memory database (`:memory:`) per test, with migrations applied. No test touches the file at `DATABASE_PATH`.

## Schema

All ids are integer primary keys. Timestamps are ISO 8601 UTC strings with milliseconds, set by the data access layer.

**artists**

| Column | Type | Rule |
|---|---|---|
| name | text | required, not blank |
| catalog_id | text | nullable; unique when set |

Names are not unique: two catalog artists can share a name. A manual artist (no catalog id) is reused by exact name.

**albums**

| Column | Type | Rule |
|---|---|---|
| title | text | required, not blank |
| artist_id | → artists | required |
| catalog_id | text | nullable (manual album); unique when set |
| release_year | integer | nullable; the catalog's original release year |
| cover_url | text | nullable |
| created_at | text | |

**year_entries**

| Column | Type | Rule |
|---|---|---|
| album_id | → albums | unique (one year entry per album); deleted with the album |
| year | integer | 1900 to 2100 |
| placement | text | `ranked`, `honorable_mention` or `listed` |
| rank | integer | 1 to 10 when `ranked`, null otherwise |
| source_title, source_artist, source_year | text, text, integer | nullable source row key; all three set or none; unique when set |
| created_at, updated_at | text | |

Unique (year, rank). Honorable mention and listed entries have no order column. The album's year is this entry's year; `albums.release_year` is only a default for callers.

**matchups**

| Column | Type | Rule |
|---|---|---|
| album_a_id, album_b_id | → albums | required, different from each other; deleted with either album |
| result | text | `a`, `b` or `tie` |
| created_at | text | |

The replay order is created at, then id. The data access layer doesn't check years or placements: the matchup screen (#7) serves pairs, and the replay skips matchups whose albums have no rating.

**decade_list_entries**

| Column | Type | Rule |
|---|---|---|
| decade | integer | a multiple of 10, 1900 to 2100 |
| album_id | → albums | unique; deleted with the album |
| position | integer | 1 to 25 |

Unique (decade, position).

**import_review_items**

| Column | Type | Rule |
|---|---|---|
| source_title, source_artist, source_year | text, text, integer | required; unique together (the source row key) |
| source_placement, source_rank | text, integer | the row's placement and rank (rank null unless ranked) |
| source_decade_rank | integer | nullable; the row's decade top 25 rank |
| candidates | text (JSON) | candidate matches: catalog id, title, artist, release year, cover URL |
| status | text | `open`, `resolved` or `skipped` |
| resolved_album_id | → albums | nullable; set to null if the album is deleted |
| created_at, updated_at | text | |

Rows are kept after they are resolved or skipped, so a re-run of the import (#10) does not queue them again.

## Rules the layer enforces

The schema enforces what SQL can (uniqueness, checks, foreign keys). The data access layer enforces the rest and throws a `DataError` with a code, so a screen can react (for example, offer to move an album that is already on another year).

1. **One year entry per album.** Adding a second throws `album_has_year_entry`. Moving an album to another year is an explicit call.
2. **Ranks unique within a year.** Taking a rank in use throws `rank_taken`.
3. **Rank matches placement.** `ranked` needs a rank from 1 to 10; the other placements have none (`invalid_rank`).
4. **Gaps in ranks are allowed.** Removing rank 4 leaves slot 4 empty; nothing shifts. The year page (#6) shows empty slots, and many years in the sheet stop at rank 5.
5. **Whole-year save.** `setYearPlacements(year, { ranked, honorableMentions, listed })` replaces a year's entries in one transaction, so a drag that swaps ranks never hits the unique rank rule halfway. Albums dropped from the lists lose their year entry. An album on another year is rejected unless the call says to move it.
6. **Decade list eligibility.** An entry's album must have a `ranked` or `honorable_mention` year entry in that decade (`not_eligible_for_decade`).
7. **Decade lists follow year entries.** When an album moves to another decade, becomes `listed` or loses its year entry, its decade list entry is deleted in the same transaction and the positions below it move up one. The call returns the removed entries so the screen can tell the user.
8. **Whole-list save.** `setDecadeList(decade, albumIds)` replaces a decade's list in one transaction, up to 25 albums, no repeats.
9. **Undo** deletes the newest matchup by created at, then id, and returns it. With no matchups it returns nothing.
10. **Deleting an album** deletes its year entry, matchups and decade list entry (foreign key cascades). An artist left with no albums is deleted too.
11. **Linking a manual album** to a catalog album sets its catalog id, cover, release year, title and artist (found or created by catalog id), keeping its id, so its year entry, matchups and decade list entry stay. A catalog id that already belongs to another album throws `catalog_id_taken`. A manual artist left with no albums is deleted.

## Data access layer

Modules under `lib/db/`, one per table group, each taking the database as its first argument so tests pass an in-memory one. Roughly:

- **artists and albums:** find or create an artist; create, get, list and delete albums; find an album by catalog id; link a manual album to the catalog.
- **year entries:** add, get by album, list a year, list all (for the replay), update placement and rank, move to another year, remove, `setYearPlacements`.
- **matchups:** record, list in replay order, count, undo the newest.
- **decade lists:** get a decade's list, `setDecadeList`, list all.
- **import review items:** create, find by source row key, list by status, resolve (with album), skip.

Names and signatures are the plan's call. The layer returns plain typed objects, not driver rows.

## Tests

Table-driven where a rule has cases, against an in-memory database:

- year entry create, read, update and delete; a second entry for one album rejected; a duplicate rank in a year rejected; a rank on a non-ranked placement rejected; the three placements stored and read back; `setYearPlacements` swapping two ranks.
- manual album created without a catalog id, then linked: its year entry, matchups and decade entry survive; linking to a taken catalog id rejected.
- matchup insert, list order, undo removes the newest only, undo on an empty table.
- decade list: an eligible album accepted; a listed album, an album from another decade and an album with no year entry rejected; moving an album out of the decade removes its entry and closes the gap; more than 25 rejected.
- deleting an album cascades to its year entry, matchups and decade entry.
- import review items: a duplicate source row key rejected; resolve and skip keep the row.
- migrations: a clean database migrates to the latest version; running again changes nothing.

## Out of scope

- Catalog search and cover art fetching (#5).
- Elo math, rating caching and matchup picking (#7).
- The spreadsheet import and the review page (#10).
- Screens. This ticket adds no route or component.
- Backups and down migrations.

## Calls I made

Surprising first.

- **Import review items are kept after they are resolved**, with `open`, `resolved` and `skipped` statuses. The ticket says "deleted once resolved"; the MVP spec says kept, so a re-run of the import doesn't queue a row the user already handled. I followed the MVP spec.
- **`node:sqlite`, not `better-sqlite3` or an ORM** (Drizzle, Prisma). No new dependency and no native build. `node:sqlite` is newer and less battle-tested than `better-sqlite3`.
- **Rank gaps are allowed and nothing shifts** when a ranked album is removed. Decade list positions, by contrast, close up when an entry is removed automatically.
- **Decade list entries are removed automatically** when their album leaves the decade or becomes listed, and the call reports what it removed, as the MVP spec says.
- **Linking a manual album to a catalog album that already exists in the app is rejected**, not merged. Merging two albums' matchups and year entries is left for when it comes up.
- **The data layer doesn't check years on matchups.** The screen serves only cross-year pairs, and a matchup stays valid if an album later moves into its opponent's year.
- **Added two columns the outline doesn't list:** the review item's decade rank (so #10 can restore a decade list entry after review) and `resolved_album_id`.
- **Years are limited to 1900 to 2100.**
- **Artist names aren't unique**; manual artists are reused by exact name.
- **Migrations are `.sql` files.** The agent team's migration clash check only reads `NNN_name.py` files, so it won't number-check these.
- **No change to `docs/agents/project.md`**, since the ticket doesn't ask for one. Suggested follow-up: set `Migrations directory` to `lib/db/migrations` and `Test database` to "in-memory per test".
