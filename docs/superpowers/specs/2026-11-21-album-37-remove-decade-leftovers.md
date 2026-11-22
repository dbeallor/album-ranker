# Remove the decade top 25 lists and drag and drop: nothing left to build

**Status:** Proposed (proposes closing the ticket)
**Date:** 2026-11-21
**Ticket:** [ALBUM-37](https://github.com/dbeallor/album-ranker/issues/37)
**Follows:** [matchup-only ratings, one library and an analytics page](2026-11-21-album-34-elo-library-table.md) (PR #39), which already did this work.

## Goal

Part 4 of 5 of the "purely Elo" change was to delete the hand-ordered decade top 25 lists, their table and drag and drop. The ticket says to check what is left when it starts and remove only that. This spec records that check. Nothing is left to build.

## What main has today (`ebf7273`)

Each acceptance item of the ticket, checked against `origin/main`:

| Ticket item | State on main | Where |
|---|---|---|
| Remove `/decades` and `/decades/[decade]`, `decade-list`, `decade-service`, `decades.ts`, `db/decade-lists` and their tests | Gone. No `app/decades/`, no `components/decade-list*`, no `lib/decade-*`, `lib/decades*` or `lib/db/decade-lists*`. | #39 |
| Remove the year screen, `year-service`, `year-placements`, `db/year-entries` | Gone. | #39 |
| "Decades" in the site header and on the home page | Gone. The home page links to Analytics, which says "by year, decade, era and lifetime". | #39 |
| `/decades` and `/decades/[decade]` redirect to the matching analytics view | Done in `next.config.ts` (`/decades` to `/analytics?view=decades`, `/decades/1990` to `/analytics?scope=decade-1990`), with `e2e/redirects.spec.ts` covering both. | #39, #41 |
| Migration that drops `decade_list_entries` | Done. `lib/db/migrations/003_library.sql` drops `decade_list_entries` and `year_entries`; `lib/db/migrate.test.ts` checks the tables are gone, and `lib/db/connection.ts` takes the `pre-migrate` backup before any pending migration runs. The ALBUM-34 spec records the 68 decade list rows it deleted. | #39 |
| Remove `@dnd-kit` | Gone. `grep -i dnd package.json package-lock.json` finds nothing, and nothing in `app/`, `components/`, `lib/` imports it. | #39 |
| Update `docs/stack.md` and `README.md` for year ranking, decade lists and drag and drop | Done. `docs/stack.md` has no drag and drop row. Its one remaining mention, under "Turned down" (Python with a JavaScript frontend), is a reason for a past choice and is still true. README describes the library, analytics and import only. | #39 |
| Nothing named for decade lists or year entries remains | `grep -rniE "decade_list\|decade-list\|decade-service\|dnd\|year_entries\|year-entries\|year-service"` over `app`, `components`, `lib`, `e2e`, `scripts`, `README.md` and `docs/stack.md` matches only migrations `001`, `002` and `003` (history, which must stay), `lib/db/migrate.test.ts` (checks the migration), and `lib/db/backup.ts` with its test (a backup of a database from before migration `003` still has `year_entries`, so the backup summary counts it; that must stay). `docs/superpowers/` specs and plans for ALBUM-6 and ALBUM-9 are history and stay. | |

The word "decade" still appears in `app/analytics`, `app/library`, `lib/scopes.ts` and `next.config.ts`. That is the computed decade scope from the library and Elo, which the ticket asks for, not a hand list.

## The one open question: `import_review_items` rank columns

The ticket asks the spec to decide what happens to `source_placement`, `source_rank` and `source_decade_rank` on `import_review_items`. #39 left them in place. They still hold what the sheet said about a row, and the review page shows it next to the row (for example "rank 3, decade rank 7"), which helps the user pick the right candidate. Nothing rates or orders an album from them.

**Decision: keep the columns and the review page text.** Dropping them is not free:

- SQLite cannot drop a column that sits in a `CHECK` constraint (`source_placement` and `source_rank` are in one), so it needs a table rebuild migration on a table that holds the user's open review items.
- `Placement`, the row parser (`lib/import/rows.ts`), `write-row.ts`, `resolve.ts`, the import summary ("Conflicting placement") and about eight test files all carry the placement. Removing it touches the import path for no change a user can see.
- The cost of keeping them is three unused columns and one line of review page text. README already says they are "read from the sheet but no longer used".

If the user wants them gone, that is a separate ticket (import and review page, with the table rebuild), not this one.

## Proposal

Close ALBUM-37 as done by #39, with a comment that points here. No code, migration, backup or dependency change is needed, so the ticket's backup step (`npm run db:backup`) does not apply: this ticket would not touch the database. The only change in the PR is this spec.

Leftover docs found: none. No stale README, `docs/stack.md` or AGENTS.md text names decade lists, year ranking or drag and drop.

## Calls I made

- **Propose closing, not build.** The ticket's own text says to skip what #34 removed, and that was everything.
- **Keep the `import_review_items` rank columns** (above), instead of the ticket's "drop the columns that only described ranks" proposal.
- **Left the old ALBUM-6 and ALBUM-9 specs and plans alone.** They are marked Shipped and record what was built at the time; ALBUM-34's spec says it replaces them.
- **Did not run anything against `data/album-ranker.db`.** The check is from the code on main, and the dropped row count (68) comes from the ALBUM-34 spec.

## Out of scope

- Dropping the rank columns or the placement parsing in the import (separate ticket, only if asked).
- The nav and UI pass (#38).
