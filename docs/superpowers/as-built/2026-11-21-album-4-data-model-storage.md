# As-built: Data model and storage

**Shipped:** in PR #18
**Ticket:** ALBUM-4
**Spec:** [2026-11-21-album-4-data-model-storage.md](../specs/2026-11-21-album-4-data-model-storage.md)

## Differs from the spec

- `getDb()` lives in `lib/db/server.ts` (which imports `server-only`), not in `lib/db/connection.ts`, so the migrate script and tests can load `connection.ts` outside Next.js.
- Duplicate source row keys, more than 25 albums in a decade list, a repeated album in a list and a duplicate review item key all throw `DataError` with code `invalid_input`. The spec names no dedicated codes for them.
- Year entry update, move and remove return `{ entry, removedDecadeEntries }`, and `setYearPlacements` returns `{ entries, removedDecadeEntries }`, so the screen can tell the user which decade list entries were removed.
- Moving an album that sits on another year through `setYearPlacements` needs the option `moveFromOtherYears`; without it the call throws `album_has_year_entry`.
- `npm run db:migrate` runs `node scripts/migrate.ts` (Node's type stripping) and prints Node's `MODULE_TYPELESS_PACKAGE_JSON` warning. `tsconfig.json` gains `allowImportingTsExtensions`.
