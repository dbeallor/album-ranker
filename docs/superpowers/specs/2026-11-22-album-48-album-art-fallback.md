# Fall back to another source for album art

**Status:** Draft
**Date:** 2026-11-22
**Ticket:** [ALBUM-48](https://github.com/dbeallor/album-ranker/issues/48)
**Follows:** [ALBUM-35 add albums to the library](2026-11-21-album-35-add-albums-library.md)

## Goal

Some albums show the grey "♪" placeholder because the Cover Art Archive (CAA) has no front cover for them. When an album is added to the library, check CAA on the server; if it has no cover, look the album up on Deezer and store Deezer's cover in `albums.cover_url`. The lookup runs once, when the album row is created, never on a page view.

## How it works

A new module `lib/catalog/cover-art.ts` exports `createResolveCover(deps)`, returning
`resolveCover({ catalogId, title, artist }): Promise<string | null>`. `deps` is `{ fetch, userAgent }`, so tests pass a fake fetch.

1. **CAA first.** Build `https://coverartarchive.org/release-group/<catalogId>/front-250` and send a `HEAD` with `redirect: "manual"` and a 5 s timeout.
   - 2xx or 3xx (CAA answers 307 to the image on archive.org): return the CAA URL.
   - 404: CAA has no cover; go to step 2.
   - Anything else (5xx, network error, timeout): return the CAA URL, as today. We can't tell, and the browser's `onError` placeholder still covers a broken link. Deezer is only asked when CAA says plainly it has nothing.
2. **Deezer fallback.** `GET https://api.deezer.com/search/album?q=artist:"<artist>" album:"<title>"&limit=10` (quotes inside the values removed), 5 s timeout, no API key.
3. **Close match only.** Accept the first result whose normalised title equals the album's normalised title and whose normalised `artist.name` equals the album's normalised artist. Normalising: Unicode NFKD, strip diacritics, lower case, `&` → `and`, drop a leading "the ", drop a trailing bracketed edition tag (`(Deluxe Edition)`, `[Remastered 2011]`, `(Expanded)`: any trailing `(...)` or `[...]` containing deluxe, edition, remaster, expanded, anniversary, bonus or version), then remove every character that is not a letter or digit. Anything else is no match.
4. **Accept only the Deezer CDN.** Use the match's `cover_medium` (250×250, the same size as CAA's `front-250`). Keep it only if it is an `https://` URL on `cdn-images.dzcdn.net` or `e-cdns-images.dzcdn.net` and at most 300 characters; otherwise no match.
5. **Nothing found:** no match, a failed request, a non-2xx answer or a body that isn't the expected JSON all return `null`, so the album is stored with no cover and the existing placeholder shows. Failures are logged to the server console, never shown to the user.

## Where it runs

Every place that creates an album row from the catalog:

- **Search, Add to library** (`app/search/actions.ts`): the action calls `resolveCover` from the submitted catalog id, title and artist, then passes the result to `addCatalogAlbumToLibrary` as `coverUrl`. The browser's `coverUrl` field is no longer used. The lookup is skipped when the album already exists by catalog id (it keeps its stored cover).
- **Import review, Use this album** (`app/import/actions.ts`): same, before `resolveReviewItem`.
- **Bulk import** (`lib/import/run.ts`): `RunDeps` gains an optional `resolveCover`; for an accepted row whose album isn't stored yet, the run resolves the cover before `writeRow`. `scripts/import.ts` wires the real one. Tests that omit it keep the catalog URL, as today.

`lib/library-service.ts`'s cover check changes from "starts with `https://coverartarchive.org/`" to "an `https://` URL on `coverartarchive.org`, `cdn-images.dzcdn.net` or `e-cdns-images.dzcdn.net`", parsed with `URL`, not a prefix test. `components/cover.tsx` needs no change (its comment names CAA; it becomes "remote cover").

The search results page still shows CAA's URL directly, so a result without a CAA cover shows the placeholder until it is added. Resolving 25 covers per search would cost 25+ requests per keystroke-search.

## Tests

One table-driven test per rule, fake fetch throughout:

- `lib/catalog/cover-art.test.ts`: CAA 307/200 → CAA URL and no Deezer call; CAA 404 + Deezer close match → Deezer URL; CAA 500 or network error → CAA URL; Deezer no results, wrong artist, wrong title, non-CDN cover URL, 500, network error, bad JSON → `null`.
- Normalising: a table of title/artist pairs that match (case, accents, "The", `&`, "(Deluxe Edition)") and that don't ("Abbey Road" vs "Abbey Road Live", different artist).
- `lib/library-service.test.ts`: the host check accepts CAA and both Deezer hosts, rejects `http://`, other hosts and look-alikes (`coverartarchive.org.evil.com`).
- `lib/import/run.test.ts`: an accepted row stores the resolved cover; no `resolveCover` keeps the catalog URL.

## Non-goals

- Backfilling covers for albums already in the library.
- Picking or uploading a cover by hand.
- Changing MusicBrainz search, or resolving covers on the search results page.
- Caching Deezer answers beyond the stored `cover_url`.

## Calls I made

- **Deezer, not iTunes.** Deezer's `cover_medium` is exactly 250×250 like CAA's thumbnail, its search takes artist and album as separate fields, and its public limit (50 requests per 5 s) is looser than iTunes's (about 20 per minute), which matters for the bulk import.
- **Only a plain CAA 404 triggers the fallback.** A CAA outage or timeout keeps the CAA URL rather than reaching for Deezer, so a flaky CAA never swaps in a second-source cover permanently.
- **The server now decides the cover**, not the browser's hidden `coverUrl` field. Smaller attack surface, and the server is where the CAA check runs anyway.
- **Bulk import resolves covers too**, adding up to two requests per accepted row. The ticket's "Today" names the importer; leaving it out would leave imported albums with placeholders.
- **"Close match" means equal after normalising**, with edition tags like "(Deluxe Edition)" dropped. No fuzzy distance: a stricter rule shows the placeholder more often but never the wrong album's art.
- **Search results don't use the fallback**; covers resolve at add time only.
- **5 s timeouts** for both CAA and Deezer, so adding an album waits at most about 10 s in the worst case.
- **Deezer CDN hosts allowed:** `cdn-images.dzcdn.net` and `e-cdns-images.dzcdn.net`, the two Deezer serves `cover_*` from.
