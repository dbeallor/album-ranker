# Browser test event log for replay

**Status:** Draft
**Date:** 2026-11-21
**Ticket:** [ALBUM-19](https://github.com/dbeallor/album-ranker/issues/19)
**Follows:** [stack](../../stack.md), [catalog search](2026-11-21-album-5-catalog-search.md)

## Goal

While a browser test drives the app, record what the test does in the page (clicks, typing, form submits and route changes) as an ordered JSON event log, one file per test. The replay renderer, built elsewhere, reads that file and redraws the run.

The repo has no browser tests today, so this ticket also adds the browser test setup and one test of the search page, which is the run the Acceptance asks for.

## Where the recorder lives

The recorder is a plain browser script in the repo. The browser test injects it into each page before the app's own scripts run (Playwright's `addInitScript`). The app's own bundle does not include it, and no app page, layout or component changes for it.

That is how "off by default" holds: outside a browser test nothing loads the recorder, so a normal `npm run dev` or `npm start` has no listeners, sends nothing and stores nothing. There is no flag to forget to turn off.

Turned down:

- **A client component in the root layout behind an env flag.** It would also work, but it ships recorder code in the app bundle and relies on the flag being off in every non-test environment. Its only gain is recording a manual session by hand, which is out of scope (no tracking of real users).
- **rrweb or another DOM-snapshot recorder.** It records the whole DOM, which is far more than "clicks, typing and navigation", adds a dependency, and the renderer would have to speak rrweb. Easy to add later if the renderer wants it.

## How events flow

1. The test fixture exposes one function to the page (`exposeBinding`, which survives full page loads).
2. The recorder adds capturing listeners on `document` and wraps `history.pushState` and `history.replaceState`, and calls that function once per event.
3. The fixture appends each event to a list in the test process, in arrival order.
4. When the test ends (pass or fail), the fixture writes the log to the test's output folder as `events.json` and attaches it to the test report.

The search form is a plain GET form, so a search is a full page load. The recorder is injected again on the new page and keeps sending to the same list, so one test gives one continuous log.

## The event log format

Version 1. JSON, UTF-8, one object per file:

```json
{
  "format": "album-ranker-events",
  "version": 1,
  "test": "search page: search for an album",
  "startedAt": "2026-11-21T15:04:05.123Z",
  "viewport": { "width": 1280, "height": 720 },
  "events": [
    { "seq": 0, "t": 0, "type": "navigation", "kind": "load", "url": "/" },
    { "seq": 1, "t": 412, "type": "click", "x": 64, "y": 103, "target": { "tag": "a", "selector": "main > p > a", "text": "Search albums" } },
    { "seq": 2, "t": 430, "type": "navigation", "kind": "push", "url": "/search" },
    { "seq": 3, "t": 880, "type": "click", "x": 120, "y": 140, "target": { "tag": "input", "selector": "form > input[name=\"q\"]", "name": "q", "label": "Album or artist" } },
    { "seq": 4, "t": 905, "type": "input", "value": "g", "target": { "tag": "input", "selector": "form > input[name=\"q\"]", "name": "q", "label": "Album or artist" } },
    { "seq": 5, "t": 1610, "type": "submit", "target": { "tag": "form", "selector": "main > form" } },
    { "seq": 6, "t": 1702, "type": "navigation", "kind": "load", "url": "/search?q=getz+gilberto" }
  ]
}
```

Fields:

- `seq`: position in the log, from 0. The log is in `seq` order.
- `t`: milliseconds since `startedAt`, from the browser's clock at the moment of the event.
- `type`: one of
  - `navigation`, with `kind` (`load` for a full page load, `push`, `replace`, or `pop` for back and forward) and `url` (path and query string, no origin or hash);
  - `click`, with `x` and `y` (viewport pixels) and `target`;
  - `input`, with `value` (the field's whole value after the change) and `target`. One event per input event, so typing "getz" gives four events;
  - `submit`, with `target` (the form).
- `target` describes the element: `tag` (lower case), `selector` (a CSS selector that finds it in the page, built from the nearest `id`, then `name`, then a child path from `main` or `body`), and when present `id`, `name`, `role`, `label` (`aria-label`, or the text of its `<label>`) and `text` (trimmed visible text, up to 80 characters).
- A password field's `value` is written as `"***"`. There are no password fields today; the rule keeps a future one out of logs.

The format is written down as a TypeScript type in the recorder module and in `docs/event-log-format.md`, the file the renderer thread is pointed to.

## Browser test setup

- Playwright (`@playwright/test`, Chromium only) as a dev dependency. `npm run test:e2e` runs it. `npm test` (Vitest) stays as it is and does not pick up browser tests: they live in `e2e/` and are named `*.spec.ts`, and Vitest's include and exclude are set so it never loads them.
- One-time setup is `npx playwright install chromium`; the README says so.
- Playwright starts the app itself (`webServer`), on a port of its own so it doesn't clash with a running dev server.
- **No live MusicBrainz calls.** The app gains one optional setting, `MUSICBRAINZ_URL` in `lib/config.ts` (default `https://musicbrainz.org`). The browser test starts a small local stub that answers the release-group search with the checked-in Getz/Gilberto fixture, and points `MUSICBRAINZ_URL` at it. Cover images, which the browser loads from Cover Art Archive, are answered by the test with a 404, so the placeholder shows and no request leaves the machine.
- Test output (`test-results/`, `playwright-report/`) is gitignored.

## The browser test

`e2e/search.spec.ts`, using the recording fixture: open `/`, click "Search albums", click the search box, type "getz gilberto", press Enter, wait for the results, click the first result's title. The test then checks its own log: navigations `load /`, `push /search`, `load /search?q=getz+gilberto` appear in that order, there is one `input` event per typed character ending in "getz gilberto", and a `submit` sits between the last `input` and the second `load`.

The Home → Search link is a Next.js `<Link>`, so that step is a client-side route change (`push`), and the search is a full page load. The test covers both kinds.

## Tests

One table-driven test per rule, none for styling:

- Recorder unit tests in Vitest with jsdom: a table of DOM actions (click on a link, input in a named field, input in a labelled field, password input, submit, `pushState`, `replaceState`, `popstate`) and the event each one sends, with the element description checked.
- `lib/config.ts`: the existing table gains `MUSICBRAINZ_URL` unset, set and set-but-empty.
- The browser test above.

## Acceptance

From the ticket:

1. A browser test run of the search page produces an ordered event log covering the clicks, typing and navigation in that run: `npm run test:e2e` writes `events.json` for the search test, and the test checks its contents.
2. The replay renderer can load that log and replay the run: depends on the renderer, which is not in this repo. This ticket ships the format doc and a sample log from the test run; the PR's proof lists the renderer check as not proven unless the renderer is available by then.
3. With tracking off, the app sends and stores no events: the recorder is not in the app bundle. The proof shows a production build has no recorder code (a search of `.next/static` for the binding name finds nothing).

## Non-goals

- The replay renderer.
- Recording real users or manual sessions, product analytics, sending events to any server.
- DOM snapshots, scroll, hover, mouse movement, key events other than through `input` and `submit`, screenshots or video.
- Changes to the database (`lib/db`).
- CI for browser tests. The repo has no CI yet.
- Browsers other than Chromium.

## Calls I made

Surprising first.

- **The event format is my proposal, not agreed with the renderer.** The ticket says to agree it with the renderer's thread before building. That thread isn't reachable from here and its format isn't in the repo, so the spec proposes version 1 above. If the renderer reads something else, change the format section before approving and the build follows it.
- **The recorder is injected by the browser test, not built into the app.** No app page or component changes, and nothing in the app bundle can record. Manual sessions can't be recorded.
- **This ticket adds Playwright and the first browser test**, since there were none to record. That brings a dev dependency and a one-time Chromium download.
- **One small app change: `MUSICBRAINZ_URL`**, so the browser test talks to a local stub instead of the live MusicBrainz. Without it the test would hit the live service, and MusicBrainz's 1 request per second limit and busy 503s would make it flaky.
- **Typing is one event per input event, holding the field's whole value**, not keystrokes. Paste and autofill show up the same way, and the renderer just sets the value.
- **Password values are masked** even though no password field exists yet.
- **The log is written per test**, to Playwright's output folder and attached to the report, not to a fixed folder in the repo.
- **Timestamps come from the browser clock**, relative to the test start, so a full page load doesn't reset them.
- **Element description is a CSS selector plus tag, id, name, role, label and text**, so the renderer can find the element by selector and fall back to the readable fields.
- **Chromium only.**
