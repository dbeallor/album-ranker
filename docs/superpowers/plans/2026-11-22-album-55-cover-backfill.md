# ALBUM-55 cover backfill: plan

Spec: [2026-11-22-album-55-cover-backfill.md](../specs/2026-11-22-album-55-cover-backfill.md)

Test command: `npm test`; also `npm run lint` and `npm run typecheck`. Tests use the in-memory test database (`lib/db/test-db.ts`) and a fake fetch; never the dev database.

1. `lib/catalog/cover-art.ts`: add `lookupCover(query)` returning `found | none | failed`; make `resolveCover` a wrapper with unchanged behaviour. Tests in `cover-art.test.ts`.
2. `lib/catalog/backfill-covers.ts`: `backfillCovers(db, deps)` per spec (null covers only, id order, sequential, skip no catalog id, `UPDATE ... WHERE cover_url IS NULL`, `isAllowedCoverUrl` check, progress every 25, summary counts). Tests in `backfill-covers.test.ts`.
3. `scripts/backfill-covers.ts` + `package.json` script `backfill-covers`, modelled on `scripts/import.ts`. Summary printer.
4. README: short "Backfill covers" note under the import section.
