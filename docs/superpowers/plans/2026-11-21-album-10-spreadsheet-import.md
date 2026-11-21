# ALBUM-10 spreadsheet import: plan

**Spec:** [2026-11-21-album-10-spreadsheet-import.md](../specs/2026-11-21-album-10-spreadsheet-import.md)

Run `npm install` first. Read the relevant guide in `node_modules/next/dist/docs/` before touching pages or server actions (`searchParams` is async; server-only modules import `server-only`). Tests use `memoryDb()` and a fake catalog; none calls MusicBrainz or touches `DATABASE_PATH`. Test fixtures hold made-up rows only; never commit the real spreadsheet, `data/`, SQLite files or `.env`.

## Task A: data layer and catalog artist ids
- Migration `lib/db/migrations/002_import.sql` (`ALTER TABLE ... ADD COLUMN`): `year_entries.source_decade_rank INTEGER CHECK (source_decade_rank IS NULL OR source_decade_rank BETWEEN 1 AND 25)`; `import_review_items.reason TEXT NOT NULL DEFAULT 'no_match' CHECK (reason IN ('no_match','ambiguous','duplicate_album','rank_taken'))`; `import_review_items.reason_detail TEXT`.
- `lib/db/types.ts`: `ReviewReason`, `YearEntry.sourceDecadeRank`, `ImportReviewItem.reason` and `reasonDetail`.
- `year-entries.ts`: `addYearEntry` takes `sourceDecadeRank`, validated 1 to 25; `toEntry` reads it; `setYearPlacements` and moves keep it. Add `findRankHolder(db, year, rank)` returning the album id or `undefined`, for the "rank taken" details.
- `import-review.ts`: `createImportReviewItem` takes `reason` (default `no_match`) and `reasonDetail`.
- `decade-lists.ts`: `insertIntoDecadeBySourceRank(db, albumId, decade)` returns `{ status: "inserted", position }`, `{ status: "full" }` or `{ status: "already_listed" }`. Inserts before the first entry whose `source_decade_rank` is higher than the album's, else at the end; entries with no source rank keep their place; a full list (25) is untouched; the album must be eligible (`not_eligible_for_decade` otherwise).
- Catalog: `CatalogAlbum.artistId: string | null` (the credit's artist ids joined with `+`, `null` if none), set in `mapReleaseGroups`. The search page ignores it.
- Tests: migrate (versions follow the file count), one table-driven test per rule: source decade rank stored and bounded, review reason stored and bounded, insertion order (rows inserted out of order end in sheet order; null source ranks keep their place; ties go after), full list unchanged, ineligible album rejected, `findRankHolder`; catalog `artistId` for a collaboration, a single artist and a credit with no ids.

## Task B: import library and script
- Dependency: `read-excel-file` (read-only `.xlsx`). A committed generator script writes the fixture `lib/import/fixtures/albums.xlsx` (made-up rows; both `Rank` columns, a formula column, a blank row, an invalid row, a duplicate, a rank plus honorable mention row, a decade rank on a listed row).
- `lib/import/`: `read-sheet.ts` (find the `Albums` sheet and columns by header; the input `Rank` is the one right of `Album`; cell values only), `rows.ts` (mapping, validation, honorable mention rule, exact duplicate merge ignoring case), `normalize.ts` and `match.ts` (spec § Matching; takes the catalog search as a parameter), `write-row.ts` (one transaction per row: album and artist by catalog id and artist id, year entry with source key and source decade rank, decade insert, or a review item with reason and detail), `run.ts` (re-run skip, retries at 5 and 15 s, ten failures in a row stop, progress, summary).
- `scripts/import.ts` and `npm run import`: config, `openDatabase` (migrates), MusicBrainz client at 1.1 s spacing, progress every 25 rows. Pick how it loads `server-only` modules the same way `db:migrate` does.
- Tests, table-driven: sheet reading, row mapping, duplicates, normalizing and matching, writing (accepted, duplicate album, taken rank, catalog error leaves the row), re-run changes nothing and a skipped item stays skipped, summary counts.

## Task C: review page, README and docs
- `lib/import/resolve.ts`: use a candidate (create or reuse the album, year entry, decade entry; "Move it here" when the album is on another year), keep as manual album, skip. Each in one transaction; a taken rank fails with the holder named and the item stays open.
- `app/import/`: page (open items by year, reason, candidates, search box reusing the catalog search, counts) and server actions. Home page link "Import review: N to check" only while items are open.
- Tests: resolve actions (candidate, manual, skip, move here, taken rank), one page test (open items render with reason and candidates).
- README "Import the spreadsheet" section; `docs/stack.md` row for the xlsx reader.

## Verify
`npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.
