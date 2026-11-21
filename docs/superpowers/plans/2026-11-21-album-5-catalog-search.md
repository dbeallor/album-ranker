# ALBUM-5 catalog search: plan

**Spec:** [2026-11-21-album-5-catalog-search.md](../specs/2026-11-21-album-5-catalog-search.md)

Run `npm install` first (no node_modules in the worktree). Read the relevant guide in `node_modules/next/dist/docs/` before touching pages (`searchParams` is async in recent Next; server-only modules import `server-only`).

## Task 1: config
- `lib/config.ts`: add `musicbrainzUserAgent` from `MUSICBRAINZ_USER_AGENT`, default `album-ranker/0.1`; empty/whitespace throws like `DATABASE_PATH`.
- `.env.example`: add the variable with a comment that MusicBrainz asks for contact details.
- Extend the table in `lib/config.test.ts`.

## Task 2: search module (`lib/catalog/`)
- `types.ts`: `CatalogAlbum {catalogId,title,artist,year:number|null,coverUrl}`, `SearchResult = {ok:true,albums} | {ok:false,message}`.
- `musicbrainz.ts` (imports `server-only`): `buildQuery(text)` (trim, cut to 200, escape Lucene specials, per-word `(releasegroup:w OR artist:w)` joined by AND), the 1.1 s spacer with 5 s queue limit, 8 s timeout via `AbortSignal`, request with the User-Agent and `fmt=json&limit=25`, mapping (artist credit with join phrases, year from `first-release-date`, drop primary-type `Single`, dedupe by id, cover URL `https://coverartarchive.org/release-group/<id>/front-250`).
- `search.ts`: `searchAlbums(query)` with the <2-char short circuit, the 24 h / 500-entry cache keyed on the normalized query, error messages per the spec, server-side logging.
- Make clock/sleep injectable so tests need no real waits.
- Tests (`search.test.ts`, fetch mocked, trimmed real fixtures under `lib/catalog/fixtures/`): table for the "getz gilberto" fixture, dedupe, Single dropped, missing date, short query no request, 503/timeout/500/network/malformed JSON messages; cache table (case/spacing, errors not cached); query builder table.

## Task 3: page
- `app/search/page.tsx`: GET form, server-rendered results (cover 125 px with `<img>` and placeholder on error via a small client component `components/cover.tsx`, title, artist, year or "Unknown year"), the no-results and error states, query kept in the box.
- Link to `/search` on the home page (keep the "Album ranker" heading; `app/page.test.tsx` must pass).
- One page test: error message renders instead of a crash (mock `searchAlbums`).

## Task 4: docs
- README: a "Search albums" note and the env var. `docs/stack.md`: catalog row (MusicBrainz + Cover Art Archive).

## Verify
`npm test`, `npm run lint`, `npm run typecheck`, `npm run build`. Never commit `.env`, `data/` or SQLite files.
