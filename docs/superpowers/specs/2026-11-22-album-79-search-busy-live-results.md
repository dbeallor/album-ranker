# Fix the catalog busy error on search and show results while typing

**Status:** Draft
**Date:** 2026-11-22
**Ticket:** [ALBUM-79](https://github.com/dbeallor/album-ranker/issues/79)

## Goal

A normal search on Add albums (`/search`) returns albums instead of "The album catalog is busy". Results then show up while the user types, without pressing Search, and typing never pushes the app over the catalog's one-request-per-second limit.

## Cause of the busy error

The busy message for "in a split mirror" comes from MusicBrainz answering **503**. The other two busy cases (timeout, long queue) don't fire. Checked on 2026-11-22 with the exact query the app builds, sent a few seconds apart:

- About half the requests got `503` with `retry-after: 1` and `x-ratelimit-zone: global` or `x-ratelimit-zone: search` / `x-ratelimit-who: search-shed`. That is MusicBrainz shedding load across all clients for the search endpoint. It is not our per-IP limit: the 200 answers in between showed `x-ratelimit-remaining` in the hundreds.
- The User-Agent made no difference. `album-ranker/0.1` and a User-Agent with a contact URL both got 503s and 200s in the same proportion.
- Retrying 1.2 s after a 503 got a 200 within one to three retries, in six trials out of six. The answer for this query is one release group, "In a Split Mirror".

Today a single 503 becomes the busy message straight away. The fix is to retry.

## What changes

### Retry a 503 (`lib/catalog/musicbrainz.ts`)

- `searchReleaseGroups` retries a 503 answer up to **3 times** (4 attempts in all).
- Before each retry it waits for the `Retry-After` header's seconds, clamped to between 1 s and 3 s. With no header, or one that isn't a whole number of seconds, it waits 1 s.
- Each retry also takes a slot from `waitForSlot`, like any other request. Retries stay at one request per 1.1 s and count toward the 5 s queue cap.
- Only 503 is retried. A timeout (no answer or no body within 8 s), a network failure, a redirect, another status or a bad body fails at once, as today.
- After the last 503 the error is still `CatalogError("busy", ...)`, so the page still shows the busy message when the catalog really is down. "Couldn't be reached" is unchanged.
- The retry is in the client, so the import script (`lib/import/run.ts`) gets it too. Its own 5 s and 15 s retries stay on top. Worst case one import row waits about 9 s more before those start.

### Results while typing (`app/search/`)

The page stays a server component and still searches while rendering from `?q=`. A small client component takes over the search box and updates the URL as the user types.

- New client component `app/search/search-box.tsx`. It renders the same form (`InlineForm method="get" action="/search"`, the search box, the Search button), so the page works without JavaScript as it does today.
- On input, it waits for a **500 ms** pause in typing. Then it calls `router.replace("/search?" + new URLSearchParams({ q }), { scroll: false })` inside `startTransition`. The server renders the new results. The URL changes without adding history entries for each pause.
- **One search at a time.** While a replace is pending (`useTransition`'s `isPending`), the box doesn't start another. It keeps only the latest text, and when the pending one finishes it sends that text if it differs from what was last sent. Text typed in between is dropped, never sent. One browser tab then has at most one search on the server at a time. Adding the 503 retries, that is at most 4 catalog requests in flight per tab, inside the 5 s queue cap.
- Text that normalizes to fewer than 2 characters isn't sent (the server would return no results without asking the catalog anyway). Clearing the box sends `/search` with no `q`, so the results go away.
- Text that matches the current `?q=` after trimming isn't sent again.
- While a search is pending, a quiet "Searching…" line shows under the box (`role="status"`), so the user knows results are coming.
- **Search button and Enter** submit the form as today: a plain GET to `/search?q=…`, a full page load. Submitting cancels a waiting pause timer.
- The box keeps its text and focus while results update. It is a client component that stays mounted across the server re-render, and its value is its own state, seeded from `?q=` on first render.

### Add album keeps working

`addToLibraryAction` (`app/search/actions.ts`) is unchanged. Each result's hidden `q` field is the page's `?q=`, which the box keeps in step with what was searched. So "Added …" still returns to the same search. Typing after an add replaces the URL with `?q=` only, which clears the "Added" and error messages, as a new search does today.

## Tests

One test per rule, table-driven where there are several cases:

- `lib/catalog/search.test.ts` (through `createSearchAlbums`, fake `fetch`, `now` and `sleep`):
  - 503 then 200 returns the albums, and the result is cached;
  - four 503s in a row give the busy message, after exactly 4 fetches;
  - the wait before a retry, as a table: `Retry-After: 2` waits 2 s; none, `0`, `abc` wait 1 s; `10` waits 3 s (each also spaced by the 1.1 s slot);
  - a timeout, a 500 and a network failure are not retried (1 fetch each).
- `app/search/search-box.test.tsx` (fake timers, mocked `useRouter`):
  - typing then pausing 500 ms calls `replace` once with the encoded query and `{ scroll: false }`; typing again before 500 ms restarts the wait;
  - while one replace is pending, more typing sends nothing; when it finishes, only the latest text is sent;
  - text shorter than 2 characters, or equal to the current `q`, isn't sent; clearing the box sends `/search`.
- `app/search/page.test.tsx`: the existing tests keep passing with the box moved into `search-box.tsx` (busy message, box keeps the query, results, "Added", errors).
- `e2e/search.spec.ts`: the existing Enter test keeps working (Playwright types faster than the 500 ms pause). A new test types "getz gilberto", doesn't press Enter, and sees results and the URL `/search?q=getz+gilberto`. The catalog stub counts release-group requests, and the test checks that typing sent exactly one.
- The 503 retry gets no e2e test: the stub has no 503 mode, and the unit tests cover it.

`npm test`, `npm run lint`, `npm run typecheck` and the e2e suite pass.

## Not in scope

- Live search on the Import page.
- Changing the catalog source or the 24 h cache length.
- Caching failed searches.
- Changing the default `MUSICBRAINZ_USER_AGENT`. MusicBrainz asks for contact details in it, and that is still worth doing, but it isn't the cause here and it would put a contact into every self-hosted install's requests. The README already says to set it.

## Calls I made

- **The cause is MusicBrainz load shedding, not the User-Agent or our rate.** The ticket's lead was the User-Agent; the response headers and the side-by-side test rule it out. The fix is a bounded retry, not a config change.
- **Retry only 503, up to 3 times, waiting `Retry-After` clamped to 1–3 s.** Three retries covered every trial. A timeout isn't retried: it has already taken 8 s, and three more would leave the page hanging for half a minute.
- **The import gets the retry too.** It shares the client, and fewer rows land in "Not reached". Keeping the retry out of the import would need a flag for no gain.
- **Live search re-renders the server page with `router.replace`, not a new JSON route.** The results list, the library years and the add forms stay in one server component. A route handler would mean rendering the results in the browser and a second copy of that list.
- **500 ms pause, one search in flight per tab, latest text wins.** That is what keeps typing inside the limit and skips stale searches without cancelling work on the server. The first results show about half a second after the user stops typing, plus the catalog's answer time.
- **`replace`, not `push`.** Back goes to the page before search, not through every pause in typing. Search and Enter still make a normal page load, which adds a history entry as today.
- **A "Searching…" line while a search is pending.** Without it, a slow or retried search looks like nothing happened.
- **The box doesn't send text under 2 characters.** The server already returns no results for them, so the request would be wasted.
