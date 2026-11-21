# Spreadsheet import

**Status:** Shipped
**Date:** 2026-11-21
**Shipped:** in PR #TBD, with differences: [as-built](../as-built/2026-11-21-album-10-spreadsheet-import.md)
**Ticket:** [ALBUM-10](https://github.com/dbeallor/album-ranker/issues/10), epic [#11](https://github.com/dbeallor/album-ranker/issues/11)
**Follows:** [MVP requirements](2026-11-20-album-ranker-mvp.md) § Spreadsheet import; [data model](2026-11-21-album-4-data-model-storage.md); [catalog search](2026-11-21-album-5-catalog-search.md)

## Goal

Load the user's `Best Albums.xlsx` into the app once, so years of rankings are not retyped. A command-line script reads the Albums sheet, matches each row to a MusicBrainz album, and writes year entries and decade list entries. Rows it can't match with confidence go to a review page in the app, where the user picks the album, keeps the row as a manual album, or skips it.

The spreadsheet stays out of the repo. Tests use a small fixture of made-up rows.

## Running it

```
npm run import -- "/path/to/Best Albums.xlsx"
```

- Writes to the database at `DATABASE_PATH` (default `./data/album-ranker.db`), migrating it first like the app does.
- Calls MusicBrainz with `MUSICBRAINZ_USER_AGENT`, one search per row, at most one request every 1.1 seconds. The user's 752 rows take about 15 minutes. The script prints a progress line every 25 rows.
- Each row is written in its own transaction, so stopping the script (Ctrl-C, a crash) leaves the database consistent, and running it again carries on where it stopped.
- The README gains an "Import the spreadsheet" section.

## Reading the sheet

- Opens the sheet named `Albums`. A file without it fails with a message naming the sheets it found.
- Finds the columns by their header in row 1: `Album`, `Artist`, `Year`, `Honorable Mention`, `Decade Top 25 Rank`, and `Rank`. The sheet has two `Rank` columns; the input one is the `Rank` to the right of `Album` (the leading one is a derived label). A missing header fails with a message naming it.
- Reads cell values only. Formulas, derived columns (`Decade`, `Title`, `Points`, `Total Albums In Year`, `Year Weight`, the weighted score, `DecadeRank`), `New`, `Decade Top 25 Candidate` and every other sheet are ignored.
- A row with an empty album, artist and year is a blank row and is not counted. A row missing one of the three, a year outside 1900 to 2100, or a rank outside 1 to 10 is skipped as invalid and named in the summary. A decade rank outside 1 to 25 or not a whole number is dropped and named in the summary; the row is still imported.
- Honorable mention is set when the cell holds a non-zero number, `TRUE`, or text other than `0`, `no` or `false` (the sheet uses `1`).

### Row mapping

| Sheet row | Imported as |
|---|---|
| Rank 1 to 10, no honorable mention | `ranked` with that rank |
| Honorable mention (with or without a rank) | `honorable_mention` |
| Neither | `listed` |

A row with both a rank and the honorable mention flag is imported as an honorable mention, as the sheet scores it, and named in the summary under "conflicting placement". It does not go to the review page, because the placement is settled; the user can move it on the year page (#6). See § Calls I made: the ticket says it goes to review, the MVP spec says it doesn't.

A decade rank on a ranked or honorable mention row becomes a decade list entry for the decade of the row's year. A decade rank on a listed row is dropped and named in the summary (listed albums can't be on a decade list). The sheet has none.

### Source row key and duplicates

- Each row's key is its album, artist and year as written, trimmed. The data model stores this key on the year entry or the review item it produced (`source_title`, `source_artist`, `source_year`).
- **Exact duplicates.** Rows whose key matches another row's, ignoring case, are merged into the first such row and named in the summary. If the merged rows differ in placement, rank or decade rank, the summary says so and the first row's values win. The sheet has one such pair (a 1960 album, both listed).

## Matching a row to the catalog

The script searches the catalog with `"<album> <artist>"` through the MusicBrainz client from #5 (same query building, Singles dropped, up to 25 results).

**Normalizing** a title or artist for comparison: Unicode compatibility decomposition with accents removed, lower case, `&` and `+` read as `and`, a leading `the ` removed, a trailing bracketed qualifier removed (`(Remastered)`, `[Deluxe Edition]`), all other punctuation removed, spaces collapsed.

**Clear match:** a result whose normalized title and normalized artist both equal the row's.

- Exactly one clear match: accepted.
- Several clear matches (the same artist has two release groups with the same title, for example a self-titled album and its live version): accepted only if exactly one has a release year within one year of the row's year; otherwise the row goes to review as **ambiguous**, with the clear matches as candidates.
- No clear match: the row goes to review as **no match**, with the first 5 results as candidates. A typo in a title lands here.

An accepted album is created with the catalog id, title, credited artist, release year and cover URL from the result. If an album with that catalog id already exists:

- without a year entry, it is reused;
- with a year entry (another row matched the same album), the row goes to review as **duplicate album match**, naming the year it is already on. One album, one year.

**Artists.** Albums from the catalog share an artist when MusicBrainz credits the same artist. To do that, the catalog result gains the artist credit's MusicBrainz artist ids (joined with `+` for a collaboration, so "Stan Getz & João Gilberto" is one artist, as the MVP spec says). The search page ignores the new field.

**Rank already taken.** If the row's rank is already used in that year (the sheet repeats a rank, or the user edited the year page), the row goes to review as **rank taken**, naming the album that holds it.

**Catalog errors.** A busy answer or timeout is retried twice, 5 and 15 seconds later. A row the catalog still can't answer is left untouched (no year entry, no review item) and counted as "not reached"; the next run tries it again. Ten failures in a row stop the script with a message to try later.

## Re-running

- A row whose key already has a year entry or a review item (open, resolved or skipped) is not processed again and counts as "already imported". It costs no catalog call.
- So a second run over the same file changes nothing, and a row the user skipped on the review page stays skipped.
- A row whose key is new (the user edited the sheet) is processed as above.

## Decade lists

- The decade rank from the sheet is kept on the year entry (new nullable column `source_decade_rank`), so later insertions can find their place.
- An imported album with a decade rank is inserted into its decade's list before the first entry whose `source_decade_rank` is higher, or at the end if there is none. Entries the user added by hand (no source decade rank) keep their place. When every row of a decade is imported, in any order, the list matches the sheet's decade ranks exactly.
- A full list (25 entries) is left alone and the summary names the album that didn't fit.
- The same rule runs when a review item with a decade rank is resolved.

## Review page

`/import` in the app, linked from the home page while open items exist ("Import review: N to check").

- Lists open items by year, oldest year first. Each shows the sheet row (album, artist, year, placement and rank, decade rank) and why it is there: no match, ambiguous, duplicate album match (with the year it is already on) or rank taken (with the album holding the rank).
- Candidates show cover, title, artist and release year, from the catalog results saved with the item. A search box on each item runs the same catalog search as `/search`, prefilled with the row's album and artist, for when the right album isn't among them.
- **Actions** on an item:
  - **Use this album** (a candidate or search result): creates or reuses the album and adds the row's year entry (placement, rank, source key, source decade rank), plus its decade list entry. If that album is already on a year page, the page says which and offers **Move it here**, which moves its year entry to this row's year and placement.
  - **Keep as manual album**: creates a manual album with the row's album, artist and year (placeholder cover), then the same year entry and decade entry.
  - **Skip**: marks the item skipped. Nothing is added.
- A resolved or skipped item leaves the list. A count at the top says how many are open, resolved and skipped. Undoing a resolution is out of scope; the year page (#6) can remove or move the album.
- If the row's rank is taken when the user resolves it, the action fails with a message naming the album that holds the rank, and the item stays open.
- Each action runs in one transaction through a server action. The page has no login, like the rest of the app on localhost.

## Summary

At the end the script prints counts and names the rows that need a look:

```
Rows read            752
Imported             ...  (matched automatically)
Sent to review       ...  (no match ..., ambiguous ..., duplicate album match ..., rank taken ...)
Merged duplicates    1    <album> - <artist> (<year>)
Conflicting placement 1   <album> - <artist> (<year>): rank 5 and honorable mention, imported as honorable mention
Already imported     ...
Invalid, skipped     ...  each named with the reason
Not reached          ...  re-run to retry
Decade lists         1960s 25, 2000s 25, 2010s 25 (entries now on each list)
Open review items    ...  see /import
```

The summary describes this run. What the user resolves later shows on the review page.

## Data changes

Migration `002_import.sql`:

- `year_entries.source_decade_rank INTEGER` (nullable, 1 to 25).
- `import_review_items.reason TEXT NOT NULL DEFAULT 'no_match'`, one of `no_match`, `ambiguous`, `duplicate_album`, `rank_taken`.
- `import_review_items.reason_detail TEXT` (nullable): the year or album the reason names, for the page.

The data access layer gains the fields; nothing else in the schema changes.

## Code layout

- `scripts/import.ts`: the command-line entry point (argument, config, database, progress, summary).
- `lib/import/`: reading the sheet into plain rows, row mapping and validation, duplicate merging, normalizing and matching, and the per-row write. The import logic takes the catalog search as a parameter so tests pass a fake.
- `lib/import/resolve.ts` (or similar): the review actions, shared by the page's server actions.
- `app/import/`: the review page.
- Reading `.xlsx` needs a library; the plan picks a small, maintained, read-only one (`read-excel-file` is the likely pick) and adds it as a dependency. How the script loads `server-only` modules outside Next.js is the plan's call, as it was for `db:migrate`.

## Tests

One table-driven test per rule, with a fake catalog. No test calls MusicBrainz or touches `DATABASE_PATH`.

- Sheet reading: a small fixture `.xlsx` of made-up rows, committed under `lib/import/fixtures/`, with both `Rank` columns, a derived formula column, a blank row and an invalid row. The plan settles whether it is generated by a committed script.
- Row mapping: ranked, honorable mention, listed, rank plus honorable mention, decade rank on a listed row, invalid values.
- Duplicates: an exact duplicate merges; a case-only difference merges; differing placements merge with a note.
- Normalizing and matching: one clear match, several with one near year, several without, a typo, `&` versus `and`, a leading "The", a `(Remastered)` suffix.
- Writing: an accepted row creates album, artist and year entry with the source key; a second row matching the same album goes to review as duplicate; a taken rank goes to review; a catalog error leaves the row untouched.
- Re-run: importing the fixture twice changes nothing the second time; a skipped review item stays skipped.
- Decade lists: insertion order with rows resolved out of order matches the sheet ranks; a full list is left alone.
- Review actions: use a candidate, keep as manual, skip, move an album here, taken rank fails and keeps the item open.
- One page test: open items render with their reason and candidates.

## Acceptance

- After importing the user's file and resolving the review page, every year page shows the sheet's ranks, honorable mentions and listed albums for that year, and the 1960s, 2000s and 2010s decade lists match the sheet's decade ranks. The only differences are the merged duplicate and the rank-plus-honorable-mention row, both named in the summary.
- A second import changes nothing.
- A row with a typo in the title lands on the review page, not in the data.
- Tests use the fixture of made-up rows covering each row kind, a duplicate and a rank-plus-honorable-mention row.
- `npm test`, `npm run lint` and `npm run typecheck` pass.

The year pages themselves are #6. Until it ships, the acceptance is checked through the data (year entries and decade lists) and the review page.

## Non-goals

- The artist rollup sheets, weighted scores and the candidate flag.
- Exporting back to a spreadsheet.
- Undoing a review resolution, or a "re-import from scratch" option.
- Importing any sheet but Albums, or a file other than `.xlsx`.

## Calls I made

- **The rank-plus-honorable-mention row is imported as an honorable mention and named in the summary, without a review item.** The ticket says it "goes to the review page"; the later MVP spec says no review item, because the placement is settled. I followed the MVP spec. If you'd rather review it, it becomes a fifth review reason.
- **A migration adds three columns:** a source decade rank on year entries (so decade lists come out in sheet order even when review items are resolved out of order), and a reason plus detail on review items (so the page can say why a row is there).
- **The catalog result gains the artist's MusicBrainz ids**, so imported albums by the same artist share one artist. This touches `lib/catalog/` from #5.
- **Clear match means equal normalized title and artist.** The normalizing rules above are mine. When there are several, a release year within one year of the sheet's year breaks the tie.
- **An exact match is accepted even if MusicBrainz's release year is far from the sheet's year.** The sheet's year always wins as the year page.
- **Catalog errors leave the row for the next run** instead of sending it to review, so a busy MusicBrainz doesn't fill the review page.
- **Exact duplicates ignore case**; the first row wins when merged rows differ.
- **A rank repeated within a year** sends the second row to review.
- **Columns are found by header name**, and the input `Rank` is the one right of `Album`. Checked against the header row of the user's file; no rows from it are in the spec or tests.
- **The review page lives at `/import`**, linked from the home page only while items are open. No undo.
- **A new dependency** to read `.xlsx`, read-only. Proposed: `read-excel-file`.
- **No dry-run mode.** A run takes about 15 minutes; a dry run would double that, and re-running is safe.
- **A bad decade rank drops only the decade rank.** The decade rank is a side annotation; losing the whole row (its year entry and rank) over a typo in it would cost more than the decade list entry it protects. The summary names the dropped decade rank and why, under "Decade rank dropped", so the user can fix it by hand.
