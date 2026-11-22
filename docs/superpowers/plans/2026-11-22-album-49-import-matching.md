# ALBUM-49 import matching: plan

Spec: [2026-11-22-album-49-import-matching.md](../specs/2026-11-22-album-49-import-matching.md). Test, lint and typecheck: `npm test`, `npm run lint`, `npm run typecheck` (no database setup needed; tests use in-memory databases).

## Task 1: grading, ranking and the ladder (no UI)

Files: `lib/import/match.ts` (+ new `lib/import/grade.ts` for the grade and edit-distance helpers, if match.ts gets long), `lib/import/types.ts` (`CatalogQuery`, `CatalogSearch` takes it), `lib/import/test-support.ts` (fake search over `text` and `fields` queries, recording fixtures), `lib/catalog/musicbrainz.ts` (`buildQuery` drops punctuation-only words and splits `/`; new fields-query builder with `~1` on words of 5+ letters), `lib/catalog/search.ts` (searchAlbums takes a `CatalogQuery`, cache keyed on serialized query), `scripts/import.ts`, `lib/import/run.ts`, tests: `match.test.ts`, `run.test.ts`, `lib/catalog/search.test.ts`.

Acceptance: spec parts 2 and 3 and their tests. `rankCandidates(row, albums)` is exported for the page.

## Task 2: review page and actions

Files: `app/import/actions.ts`, `app/import/page.tsx`, `components/import-review.tsx` (+ small client component for the pending state), `components/import-review.module.css`, `app/import/actions.test.ts`, `app/import/page.test.tsx`, an e2e test under `e2e/`.

Acceptance: spec parts 1 and 4 and their tests. Reproduce the dead click first (e2e) and record what was found in the PR.

## Task 3: docs

README or `docs/` mentions of the import search if any; as-built per open-pr closeout.
