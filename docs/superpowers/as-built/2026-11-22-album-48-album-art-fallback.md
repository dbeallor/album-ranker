# As-built: Fall back to another source for album art

**Shipped:** in PR #50
**Ticket:** ALBUM-48
**Spec:** [2026-11-22-album-48-album-art-fallback.md](../specs/2026-11-22-album-48-album-art-fallback.md)

## Differs from the spec

- The spec's edition-tag rule strips any trailing bracket naming deluxe, edition, remaster and so on. A bracket that also names live, acoustic, instrumental, demo or mono is kept, so a live album never takes a studio album's cover.
- A Deezer match is refused when it has no artwork of its own (empty `md5_image`, or `/cover//` in the cover URL), so Deezer's grey stock image is never stored.
- `resolveCover` makes no request when the catalog id isn't a UUID or the title or artist is over 300 characters, and skips Deezer when a title or artist normalises to nothing.
- Stored covers must also have no port or credentials in the URL.
- The hidden `coverUrl` inputs were removed from the search and import pages, and the import review action stores `null` from the browser path before the server resolves it.
- Two new optional settings, `COVER_ART_ARCHIVE_URL` and `DEEZER_URL`, point the lookups at a stand-in so the browser tests stay offline. Defaults are the real hosts.
