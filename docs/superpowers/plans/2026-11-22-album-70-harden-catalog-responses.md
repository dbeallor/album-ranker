# ALBUM-70 plan: harden catalog responses

Spec: [2026-11-22-album-70-harden-catalog-responses.md](../specs/2026-11-22-album-70-harden-catalog-responses.md). Verify with `npm test`, `npm run lint`, `npm run typecheck`.

## Task 1: `readJsonCapped`
- Add `lib/catalog/read-json.ts` (no `server-only`, no non-relative imports): `readJsonCapped(response, maxBytes)`; refuses on `Content-Length` over cap, counts streamed bytes and cancels past cap, throws an error named `ResponseTooLarge`, else UTF-8 decode and `JSON.parse`. Export `MAX_BODY_BYTES = 1_048_576`.
- Add `lib/catalog/read-json.test.ts`: one table (under cap, header over cap, streamed over cap without header, bad JSON).

## Task 2: Deezer (`lib/catalog/cover-art.ts`)
- `redirect: "error"` on the Deezer fetch; use `readJsonCapped`; log and return `failed/deezer` on any throw (already the catch path).
- Read only the first `DEEZER_RESULT_LIMIT` entries; skip entries whose title or artist name exceeds `MAX_NAME_LENGTH` before `normalizeForMatch`.
- Export `CATALOG_ID`.
- Tests in `cover-art.test.ts`: redirect option sent; oversized body fails (lookup `failed`, resolve null); 80,000-space title skipped fast and next entry matches; 11th entry not read.

## Task 3: MusicBrainz (`lib/catalog/musicbrainz.ts`)
- `redirect: "error"`; `readJsonCapped`; `ResponseTooLarge` maps to `CatalogError("unreachable", ...)`.
- `mapReleaseGroups`: keep only UUID ids (import `CATALOG_ID` from `./cover-art`); skip groups with title or joined artist credit over 300 chars.
- `joinArtistCredit`/`joinArtistIds`: skip non-object entries; keep only UUID artist ids (name text kept).
- Tests in `search.test.ts`: redirect option and rejected fetch gives unreachable message; oversized body (header, and streamed) gives unreachable message; table of dropped shapes (non-UUID id, long title, long credit, null/string/number credit entry, non-UUID artist id). Switch existing `"g1"`/`"id-a"` ids to UUIDs.
