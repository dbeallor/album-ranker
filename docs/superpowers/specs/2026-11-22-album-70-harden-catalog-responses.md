# Harden catalog responses: redirects, size and id shapes

**Status:** Shipped
**Shipped:** in PR #77, as specified
**Date:** 2026-11-22
**Ticket:** [ALBUM-70](https://github.com/dbeallor/album-ranker/issues/70)
**Follows:** [ALBUM-64 security sweep report](2026-11-22-album-64-security-sweep-report.md), findings S10, S11 and S12

## Goal

The MusicBrainz search and the Deezer cover search stop trusting how the other side answers. A redirect, an oversized body, a very long title or a malformed id is refused or dropped, instead of being followed, parsed, stalling the server or reaching the database.

None of these can be caused by user input. They need a hostile or broken answer from MusicBrainz or Deezer, or a wrong `MUSICBRAINZ_URL` or `DEEZER_URL`.

## What changes

### Redirects (S10)

- `searchReleaseGroups` (`lib/catalog/musicbrainz.ts`) and `askDeezer` (`lib/catalog/cover-art.ts`) pass `redirect: "error"` to `fetch`. A redirect then rejects the `fetch` call.
- MusicBrainz: the rejection is handled like any other network failure, a `CatalogError("unreachable")`. The search page shows "couldn't be reached" and the import retries as it does today.
- Deezer: the rejection is a failed Deezer search (logged, `{ kind: "failed", at: "deezer" }`), as any other Deezer error is today.
- The Cover Art Archive HEAD check keeps `redirect: "manual"`. A 3xx there means "a cover exists", and the stored URL is always the fixed CAA one.

### Body size (S11)

A new helper, `readJsonCapped(response, maxBytes)` in `lib/catalog/read-json.ts`, replaces `response.json()` in both clients. It has no `server-only` and only relative imports, so the import script can load it through `cover-art.ts`.

- The cap is 1 MB (1,048,576 bytes) for both. A MusicBrainz page of 25 release groups is about 50 KB; a Deezer page of 10 albums is about 10 KB.
- If `Content-Length` is present and over the cap, the helper refuses before reading.
- Otherwise it reads the body stream and counts bytes. Once the count passes the cap it cancels the stream and refuses. A missing or wrong `Content-Length` is not trusted either way.
- Under the cap, it decodes the bytes as UTF-8 and parses them as JSON. Bad JSON throws as `response.json()` does now.
- A refusal throws an error named `ResponseTooLarge`, so callers can tell it from a timeout.
- MusicBrainz maps it to `CatalogError("unreachable", "response is over 1 MB")`. Deezer logs it and fails the Deezer search.
- Timeouts while reading still surface as they do now: the `AbortSignal.timeout` error passes through, and MusicBrainz still maps it to `busy`.

### Long entries and the Deezer loop (S11)

- `askDeezer` reads at most `DEEZER_RESULT_LIMIT` (10) entries of `data`, whatever Deezer sends.
- `askDeezer` skips an entry whose `title` or `artist.name` is over 300 characters (`MAX_NAME_LENGTH`) before calling `normalizeForMatch` on it. This is what removes the stall: the quadratic `EDITION_TAG` regex never sees more than 300 characters from Deezer, as it already never sees more than 300 from the user.
- `mapReleaseGroups` skips a release group whose title or joined artist credit is over 300 characters. Its id is a UUID (below), so it is always 36 characters.
- The `EDITION_TAG` regex itself is unchanged.

### Id and credit shapes (S12)

In `lib/catalog/musicbrainz.ts`:

- `mapReleaseGroups` keeps a release group only if its `id` is a UUID (the same pattern `cover-art.ts` and `library-service.ts` use, case-insensitive). Others are skipped, like a group with no title is today.
- `joinArtistCredit` and `joinArtistIds` skip credit entries that are not objects (`null`, a string, a number, an array). No `TypeError` reaches the import script.
- `joinArtistIds` keeps only artist ids that are UUIDs. A credit with a non-UUID id keeps its name in the artist text; only its id is dropped. A credit with no UUID ids gives `artistId: null`, as a credit with no ids does today.
- The UUID pattern moves into one exported constant, `CATALOG_ID` in `cover-art.ts`, which `musicbrainz.ts` imports. `library-service.ts` keeps its own string, since it builds a different regex from it.

## Tests

One table-driven test per rule, in the existing files:

- `lib/catalog/search.test.ts` (through `createSearchAlbums`, as today):
  - a redirect is refused: the fetch call gets `redirect: "error"`, and a rejected fetch gives the "couldn't be reached" message;
  - an oversized body is refused: a `Content-Length` over 1 MB, and a body over 1 MB with no `Content-Length`, both give "couldn't be reached";
  - shapes: a non-UUID release-group id, a title over 300 characters and an artist credit over 300 characters are dropped; a `null`, string or number credit entry is skipped and the rest of the credit kept; a non-UUID artist id is left out of `artistId`.
- `lib/catalog/cover-art.test.ts`:
  - the Deezer request has `redirect: "error"`;
  - an oversized Deezer body fails the search (logged, `failed` from `lookupCover`, null from `resolveCover`);
  - a Deezer title of 80,000 spaces is skipped, and the next entry matches, in well under a second;
  - an 11th matching entry is not read.
- A small table test for `readJsonCapped` (`lib/catalog/read-json.test.ts`): under the cap, `Content-Length` over the cap, streamed body over the cap with no header, bad JSON.
- Existing tests that use ids like `"g1"` and `"id-a"` switch to UUIDs.

`npm test`, `npm run lint` and `npm run typecheck` pass.

## Not in scope

- Rewriting the `EDITION_TAG` regex. The 300-character cap bounds its cost; making it linear is a separate change.
- Shape checks in `writeRow` or the import script. With `mapReleaseGroups` filtering, only UUID ids reach them.
- Rate limits on cover lookups (S9) and every other sweep finding.
- The backfill script's Deezer use goes through the same `askDeezer`, so it gets these checks with no change of its own.

## Calls I made

- **A non-UUID artist id drops only the id, not the album.** The album and its artist text are still shown and can still be added; only `artistId` loses that part. Dropping the whole album would hide real results over a field the app only uses to match the album to a stored artist (`artists.catalog_id`); without it the artist is matched by name, as for any credit with no ids today.
- **An oversized MusicBrainz body reads as "couldn't be reached", not "busy".** It is a broken answer, not a slow one, and the import's retry treats both the same.
- **One 1 MB cap for both services.** Both normal answers are well under 100 KB, so one round number leaves plenty of room.
- **The ticket's "id over 300 characters" rule is covered by the UUID check** for MusicBrainz. Deezer's own album id is not read, so there is nothing to check there.
- **The UUID pattern is shared from `cover-art.ts`** rather than copied a third time.
- **Ids are kept in the case MusicBrainz sends** (lower case in practice). The UUID check accepts either case, as the cover lookup does.
