# Faster album covers in matchups

**Status:** Spec
**Date:** 2026-11-22
**Ticket:** [ALBUM-78](https://github.com/dbeallor/album-ranker/issues/78)

## Goal

After an answer, a skip or an undo, the next pair's covers are already in the browser when the pair appears. The first pair on page load starts its covers as early as the browser allows.

## What is there today

- `components/matchup-screen.tsx`: `AlbumPick` renders `Cover` (480px, `fill`) for each album. `run()` waits for the server action to return the new pair, then swaps it in. Only then does the browser start fetching the new covers.
- `components/cover.tsx`: a plain `<img loading="lazy">` pointing at the remote `coverUrl`, with a grey placeholder when there is no URL or the image fails.
- The next pair depends on the answer. `pickMatchup` (`lib/elo/pick.ts`) picks the first album by fewest matchups, random among ties (one call to `random()`), and its opponent by rating or placement slot, which an answer changes. So the browser can't guess the next pair; only the server can.
- A Cover Art Archive URL answers `307` to `archive.org`, which answers `302` to a numbered `*.archive.org` host that serves the image with `Last-Modified` and `ETag` but no `Cache-Control` (checked with `curl -IL` on 2026-11-22).

## What changes

### The server predicts the next pairs

Each `MatchupView` gains two fields:

- `seed`: a number in `[0, 1)` drawn with `Math.random` when the view is built. It is the `random()` value the server will use for the next pick.
- `upcoming`: the cover URLs (non-null, deduplicated, without the current pair's own covers) of every pair the next action can serve:
  - the pair after answering `a`, `b` and `tie`: `pickMatchup` run on the ratings replayed with that answer appended as a hypothetical matchup, with `random = () => seed`;
  - the pair after a skip: `pickMatchup` on the current ratings with the current pair added to `avoid`, same seed;
  - the pair an undo would serve: the newest stored matchup's two albums.

That is at most 10 URLs. The page's first view (`app/matchups/page.tsx`) is built the same way, through a service function, so the first pair already comes with `upcoming`.

### The seed comes back

`answerMatchup`, `skipMatchup` and `undoMatchup` (actions and service) take one more argument, the `seed` of the view the user is answering. The service uses it as `random` for the next pick when it is a finite number in `[0, 1)`, and falls back to `Math.random` otherwise (the browser can send anything). With the same seed, the same stored matchups and the same `avoid`, the served pair is the predicted one.

### The browser prefetches

`MatchupScreen` prefetches every URL in `view.upcoming` whenever the view changes: it creates an `Image` per URL and sets its `src`, holding the objects in a ref until the next view replaces them, so the browser keeps them until the pair can show. A URL already prefetched is not fetched again.

### The visible covers load first

`Cover` takes an optional `priority` flag. With it, the `<img>` has `loading="eager"` and `fetchPriority="high"`; without it, it stays `loading="lazy"` as today. `AlbumPick` passes `priority`. Other pages don't change. The placeholder on a missing or failed image stays as it is.

## Tests

Sized to `AGENTS.md` § Testing.

- `lib/matchups-service.test.ts`, one table-driven test: for each action (answer `a`, `b`, `tie`, skip, undo), a view's `upcoming` contains the covers of the pair that action then serves when given the view's `seed`. Plus a row each for an invalid seed falling back (no error) and for null covers being left out.
- `components/matchup-screen.test.tsx`: with `Image` stubbed, the initial view's `upcoming` URLs are prefetched, and after an answer the new view's `upcoming` are; the seed of the current view is passed to each action.
- `components/cover` change: one assertion in the matchup screen test that the matchup covers render with `loading="eager"`. No separate styling test.
- Manual proof on a ticket preview (`npm run preview -- 78`): in DevTools, Network shows the next pair's cover images requested before the answer, and after answering the new covers come from cache with no pop-in; a pair with a missing cover still shows the placeholder.

## Leaves out

- Covers on the library, analytics, search, artist and import pages.
- Changing where covers come from or proxying them (#48, #59).
- Waiting for the next covers to decode before swapping the pair in.
- Prefetching more than one step ahead.

## Calls I made

- **The server predicts with a seed the browser sends back, rather than prefetching a guess.** Without the seed, the random tie-break among albums with the fewest matchups would often make the guess wrong, especially while many albums are new. The seed makes the prediction exact. The browser choosing the seed can only steer which of the tied albums comes first, which matters to nobody in a single-user, password-gated app.
- **Prediction runs inside each action's response, not in a second request.** It replays the ratings three more times and picks four more pairs per action. For a personal library (hundreds of albums, thousands of matchups) that is milliseconds, far less than one cover download, and it keeps one round trip per answer.
- **Up to 10 prefetched images per view.** Prefetching every pair the next action could serve is the only way to have the right one ready. Most of them overlap (the first album is often the same across answers), so in practice it's fewer.
- **The Cover Art Archive redirects may still cost a round trip.** The `307` and `302` hops carry no caching headers, so the browser may ask `coverartarchive.org` again when the real `<img>` loads; the image itself comes from cache. Fixing that means rewriting stored URLs to the final host, which is #48/#59's ground, not this ticket's.
- **No `react-dom` `preload()` for the first pair.** An eager, high-priority `<img>` in the server-rendered HTML already starts as soon as the parser reaches it; a preload link adds little and makes the browser warn when the image is used late.
- **`upcoming` leaves out the current pair's covers**, which are already on screen.

## Touches

None of these: data, money, auth, user email, migrations. The server actions get one more argument, validated like the others.
