# Data model and storage: plan

**Spec:** [2026-11-21-album-4-data-model-storage.md](../specs/2026-11-21-album-4-data-model-storage.md)
**Ticket:** ALBUM-4

Tests run against `:memory:` databases only. Never open the file at `DATABASE_PATH` in a test, and never commit `data/` or a SQLite file.

## Task 0: verification commands

`npm test`, `npm run lint`, `npm run typecheck` all pass after each task.

## Task 1: connection and migrations

- `lib/db/migrate.ts`: `migrate(db)` reads `*.sql` from `lib/db/migrations/` (resolved from `process.cwd()`), applies the ones missing from `schema_migrations(version, name, applied_at)` in number order, each in its own transaction. A failure rolls back and throws with the file name.
- `lib/db/connection.ts`: `openDatabase(path)` (creates the parent folder unless `:memory:`; `PRAGMA foreign_keys = ON`, `journal_mode = WAL`, `busy_timeout`; runs `migrate`) and `getDb()`, a lazy singleton using `getConfig().databasePath`. `getDb` imports `server-only`; keep `openDatabase` and `migrate` free of it so tests and the script can load them.
- `lib/db/migrations/001_initial.sql`: the six tables from the spec, with checks, unique constraints and cascades.
- `scripts/migrate.ts` and `npm run db:migrate` (`node scripts/migrate.ts`, Node's native type stripping; no new dependency). Add `allowImportingTsExtensions` to `tsconfig.json` if relative `.ts` imports need it.
- README: add the `npm run db:migrate` step to "Run the app".
- Test: clean database migrates to latest; a second run changes nothing.

## Task 2: types and artists/albums

- `lib/db/types.ts`: row types, `Placement`, `DataError` with a `code` (`album_has_year_entry`, `rank_taken`, `invalid_rank`, `not_eligible_for_decade`, `catalog_id_taken`, plus `not_found`, `invalid_input`).
- `lib/db/albums.ts`: find or create artist, create/get/list/delete album (deleting removes an orphaned artist), find by catalog id, `linkToCatalog`.
- Tests: manual album, link keeps year entry, matchups and decade entry; taken catalog id rejected; delete cascade.

## Task 3: year entries

- `lib/db/year-entries.ts`: add, get by album, list a year, list all, update, move, remove, `setYearPlacements`. Rules 1 to 5 of the spec.
- Hook rule 7: any change that takes an album out of a ranked/honorable-mention placement in its decade removes its decade list entry in the same transaction and compacts positions; return the removed entries.
- Tests (table-driven): CRUD, three placements, second entry rejected, duplicate rank rejected, rank on non-ranked rejected, swap of two ranks via `setYearPlacements`, source row key unique.

## Task 4: matchups, decade lists, review items

- `lib/db/matchups.ts`: record, list in replay order (created_at, id), count, undo.
- `lib/db/decade-lists.ts`: get, `setDecadeList`, list all, eligibility and 25 limit.
- `lib/db/import-review.ts`: create, find by source row key, list by status, resolve, skip.
- Tests: insert/order/undo/empty undo, decade rules (eligible, listed, other decade, no entry, over 25, repeat), moving out of the decade closes the gap, review keys unique, resolve and skip keep the row.

## Finish

Run the compaction pass (`compact_check.py`), then open the PR.
