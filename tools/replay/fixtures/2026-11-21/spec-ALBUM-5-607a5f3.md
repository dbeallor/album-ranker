# Album catalog search with cover art

**Status:** Draft
**Date:** 2026-11-21
**Ticket:** [ALBUM-5](https://github.com/dbeallor/album-ranker/issues/5), epic [#11](https://github.com/dbeallor/album-ranker/issues/11)
**Follows:** [MVP requirements](2026-11-20-album-ranker-mvp.md) § MVP features 1 and § Albums versus releases; [stack](../../stack.md)

## Goal

The user types an album or artist into a search box and gets back albums with cover art, title, credited artist and original release year. One album appears once, not once per edition. Saving a result into a year is #6; this ticket ends at the result list.

## Choosing the catalog

Checked on 2026-11-21 against the live services where noted.

| Source | Album = one result? | Key | Rate limit | Covers | Older jazz and 1960s |
|---|---|---|---|---|---|
| **MusicBrainz + Cover Art Archive** | Yes: the release group | None. A descriptive User-Agent is required | 1 request per second per client; returns 503 "busy" when over it or under load (seen live) | Cover Art Archive serves a chosen front cover per release group at a fixed URL, sizes 250/500/1200 | Live check: *Getz/Gilberto* (1964), *Kind of Blue* (1959) found with the right original year; *Getz/Gilberto* has a front cover |
| Apple iTunes Search | No: editions are separate ("Getz/Gilberto" and "Getz/Gilberto (Expanded Edition)" both returned live) | None | About 20 calls a minute | Good, high resolution | Good, but the date is often the reissue's |
| Discogs | Yes: the master release | Token needed for image URLs | 60 a minute with a token | Good | Strong for jazz, but masters are missing for many single-edition records, and image use falls under Discogs' API terms |
| Spotify Web API | No: remasters and deluxe editions are separate albums | Client id and secret | Not published; development apps are limited | Good | Release dates are often the reissue's |
| Last.fm | Partly: groups by name, not by edition data | Key | Loose | Uneven; many placeholder images | Uneven |

**Choice: MusicBrainz for search, Cover Art Archive for covers.**

- It is the only free option whose unit is the release group, which the MVP spec defines as the album. iTunes and Spotify would need our own edition merging, which is guesswork.
- No API key, so there is nothing to keep out of the repo or the browser. Calls still go through the server (see below), so a keyed source can replace it later without changing the page.
- MusicBrainz data is CC0. Cover Art Archive images stay under their owners' copyright; the archive hosts them for use like this, and showing a cover beside its album is the normal use. This is a personal app run on localhost.
- The cost is the 1 request per second limit and the busy 503s. One user typing searches stays well inside it with the cache and the limiter below.

## How search works

### The search function

`searchAlbums(query)` in `lib/catalog/` (server-only) returns either a list of albums or an error message. Each album has:

- `catalogId`: the MusicBrainz release group id (stable),
- `title`,
- `artist`: the release group's artist credit as one string, names joined with their join phrases ("Stan Getz / João Gilberto featuring Antônio Carlos Jobim"), so a collaboration is one artist,
- `year`: the year of the release group's first release date, or none when MusicBrainz has no date,
- `coverUrl`: `https://coverartarchive.org/release-group/<catalogId>/front-250`.

Rules:

- **Query.** The text is trimmed. Under 2 characters returns an empty list without calling the source. Over 200 characters is cut to 200. Each word is matched against the release group title or the artist name, so "miles davis kind of blue" and "getz gilberto" both work. Lucene special characters in the user's text are escaped.
- **Results.** Up to 25 per search, in MusicBrainz's score order. Release groups whose primary type is `Single` are dropped; albums, EPs, compilations, live albums and soundtracks stay, as the MVP spec says. A release group id appears at most once.
- **Server only.** The source is called from server code. The module imports `server-only`. The browser never calls MusicBrainz.
- **User-Agent.** Every request sends `MUSICBRAINZ_USER_AGENT` from `lib/config.ts`, default `album-ranker/0.1`. MusicBrainz asks for contact details in it; `.env.example` says so and the user can add theirs. No contact is hardcoded.
- **Timeout.** A request taking over 8 seconds is abandoned.
- **Rate limit.** Requests to MusicBrainz are spaced at least 1.1 seconds apart within the server process. A search that would wait more than 5 seconds in line returns the busy error instead.
- **Errors.** A 503, a timeout, a network failure, another non-2xx status or a body that isn't the expected JSON returns an error message, never a throw to the page:
  - 503 or timeout: "The album catalog is busy. Try again in a moment."
  - anything else: "The album catalog couldn't be reached. Try again later."
  The status and cause are logged on the server.
- **Cache.** Successful results are cached in memory by the normalized query (trimmed, lower case, spaces collapsed) for 24 hours, up to 500 queries, oldest dropped first. Errors are not cached. The cache resets when the server restarts, which is fine for one user.

### Covers

The server does not check whether a cover exists, since that would cost one more request per result. Each result gets the Cover Art Archive URL. The page shows a placeholder (a grey square with a music note, same size) when the URL fails to load: Cover Art Archive answers 404 for a release group with no front cover. The image loads straight from Cover Art Archive in the browser. That is fine because no key is involved.

### The page

- A new route `/search` with a search box (a GET form, so `?q=` is in the URL and the back button works) and a results list rendered on the server.
- Each result shows the cover (125 px), title, artist and year ("Unknown year" when there is none).
- States: no query shows the box only. No results: "No albums found for "<query>"." Error: the error message above, in place of the list, with the query kept in the box.
- The home page gets a link to `/search`.
- Plain styling, no design work (MVP spec non-goal).

## Tests

One table-driven test per rule, with `fetch` mocked. No tests for styling.

- `searchAlbums` table: "getz gilberto" fixture returns the 1964 release group with title, joined artist credit, year 1964 and the cover URL; a release group listed twice appears once; a `Single` is dropped; a missing date gives no year; a query under 2 characters makes no request; 503, timeout, 500, network error and malformed JSON each give the right message.
- Cache: the same query twice (different case and spacing) calls `fetch` once; an error is not cached.
- The query builder: words are split and special characters escaped.
- `lib/config.ts`: the existing table gains `MUSICBRAINZ_USER_AGENT` default and set value.
- One page test: the error message renders instead of a crash.
- Fixtures are trimmed copies of real MusicBrainz responses, checked in under the test folder.

No test calls the live service.

## Acceptance

From the ticket:

1. Searching "Getz Gilberto" returns the 1964 album with a cover. Checked by the fixture test and once by hand against the live service in the PR's proof.
2. One album appears once, not once per edition: results are release groups, deduplicated by id.
3. A source error shows a readable message, not a crash.
4. Tests cover the search function with the source mocked.

## Non-goals

- Saving a result into a year (#6), manual albums (#6 or #4), bulk matching for the import (#10).
- Storing albums or covers in the database, or downloading cover files.
- Search as you type. The form submits on Enter or the button.
- Paging past 25 results.
- A second catalog source or a fallback source.

## Calls I made

Surprising first.

- **The browser loads covers straight from Cover Art Archive**, and a missing cover is found by the image failing to load, not by a server check. That saves up to 25 extra requests per search. The browser does contact a third party, but only for public images, with no key.
- **The User-Agent has no contact details by default.** MusicBrainz asks for them. I left them out so the app doesn't send the user's email or project without their say; `MUSICBRAINZ_USER_AGENT` lets them add it. MusicBrainz may throttle anonymous agents harder.
- **Singles are dropped from results**; EPs, compilations, live albums and soundtracks stay.
- **"Getz Gilberto" puts the 1964 album 4th, not 1st** (live check: a 1998 compilation called "Getz & Gilberto" and two live albums score higher). The acceptance asks only that it is returned. I don't re-rank results.
- **MusicBrainz + Cover Art Archive** over iTunes, Discogs, Spotify and Last.fm, for release groups, no key and CC0 data.
- **Search is a server-rendered GET form at `/search`**, not search as you type, so there is no client JavaScript and every search is one request.
- **The cache lives in server memory**, 24 hours and 500 queries, not in SQLite, since #4 hasn't built the database and a restart only costs a few repeat calls.
- **Rate limiter at 1.1 seconds between calls**, with a 5 second queue limit and an 8 second timeout.
- **Up to 25 results**, no paging.
- **Cover size 250** from the archive, shown at 125 px.
- Error wording: "busy" for 503 and timeouts, "couldn't be reached" for everything else.
