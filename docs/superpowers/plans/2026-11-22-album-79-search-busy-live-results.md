# ALBUM-79 plan: search busy fix and live results

Spec: `docs/superpowers/specs/2026-11-22-album-79-search-busy-live-results.md`. Follow it; this plan only orders the work.

## Task 1: retry a 503 (`lib/catalog/musicbrainz.ts`, `lib/catalog/search.test.ts`)

- Loop in `searchReleaseGroups`: up to 4 attempts. Each attempt calls `waitForSlot()` then fetches. On a 503, if attempts remain, sleep `Retry-After` seconds clamped to 1..3 s (whole-number header, else 1 s) via `deps.sleep`, then retry. After the last 503 throw `CatalogError("busy", ...)`. Other failures throw at once as today.
- Tests (table-driven where several cases): 503 then 200 returns albums and is cached; four 503s give the busy message after exactly 4 fetches; wait before retry table (`2`→2 s, none/`0`/`abc`→1 s, `10`→3 s); timeout, 500 and network failure are not retried (1 fetch).
- Verify: `npx vitest run lib/catalog`.

## Task 2: search box (`app/search/search-box.tsx`, `app/search/page.tsx`, `app/search/search-box.test.tsx`)

- Client component per the spec: same `InlineForm method="get" action="/search"`, `TextField`, Search button; 500 ms debounce; `router.replace(..., { scroll: false })` in `startTransition`; one search in flight, latest text wins; skip < 2 normalized chars and text equal to the current `q`; empty sends `/search`; "Searching…" `role="status"` while pending; submit cancels the timer. `page.tsx` renders `<SearchBox query={query} />` in place of the form (keep `styles.search`; move the class use as needed).
- Tests per the spec with fake timers and a mocked `next/navigation` `useRouter`. Existing `page.test.tsx` must pass (mock `next/navigation` there if needed).
- Read `node_modules/next/dist/docs/` for Next 16 specifics (AGENTS.md) before writing.

## Task 3: e2e (`e2e/search.spec.ts`, `e2e/catalog-stub.ts`)

- Stub counts release-group requests (expose via a `/__count` path or similar). New test: type "getz gilberto" with no Enter, see results, URL `/search?q=getz+gilberto`, exactly one release-group request. Keep the existing Enter test passing.

## Finish

`npm test`, `npm run lint`, `npm run typecheck`, `npm run test:e2e`. Commit per task (`feat: ALBUM-79 ...`), push the branch.
