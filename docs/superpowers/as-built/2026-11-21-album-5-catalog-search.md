# As-built: Album catalog search with cover art

**Shipped:** in PR #17
**Ticket:** ALBUM-5
**Spec:** [2026-11-21-album-5-catalog-search.md](../specs/2026-11-21-album-5-catalog-search.md)

## Differs from the spec

- The spec puts the test fixtures "under the test folder". They are in `lib/catalog/fixtures/getz-gilberto.json`.
- The spec says "one page test". `app/search/page.test.tsx` has four tests (error message, results, no results, empty query).
- The spec doesn't mention the new `server-only` dependency, nor `test/server-only.ts`, the stub Vitest aliases it to because `server-only` can't load outside Next.js.
