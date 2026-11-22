# ALBUM-59 dead cover links: plan

Spec: [2026-11-22-album-59-dead-cover-links.md](../specs/2026-11-22-album-59-dead-cover-links.md)

Test command: `npm test`; also `npm run lint` and `npm run typecheck`. Tests use the in-memory test database (`lib/db/test-db.ts`), a fake fetch, and a fake `sleep` and `now`; never the dev database or a live service.

1. `lib/catalog/backfill-covers.ts`: add `LOOKUP_GAP_MS = 1000`, deps `sleep` and `now` (default real ones), and a `LinkSummary` (`checked`, `kept`, `replaced`, `stillDead`, `failed`, `skipped`). `backfillCovers` returns `{ missing: BackfillSummary, links: LinkSummary }`: the #55 pass first (unchanged rules), then the link pass per spec (hosts via a parsed `coverartarchive.org` check, skip no catalog id or a URL that isn't the album's own `front-250`, `lookupCover`, guarded `UPDATE ... WHERE id = ? AND cover_url = ?`, `isAllowedCoverUrl` before writing). Both passes wait so each lookup starts at least `LOOKUP_GAP_MS` after the previous one started; skipped albums don't wait. Progress per pass every 25. `formatBackfillSummary` takes both and prints the two sections. Tests in `backfill-covers.test.ts` per spec § Tests; #55 tests keep passing with expectations moved to `.missing`.
2. `scripts/backfill-covers.ts`: count both sets, print the "Checking ..." line and the time estimate, pass real `sleep` and `now`, print both summaries.
3. README "Backfill covers": the command also checks Cover Art Archive links, replaces dead ones from Deezer, takes about a second per album.
