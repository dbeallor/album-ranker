# The recording browser follows window resizes

**Status:** Draft
**Date:** 2026-11-22
**Ticket:** [ALBUM-61](https://github.com/dbeallor/album-ranker/issues/61)
**Follows:** [ALBUM-30 record local previews](2026-11-21-album-30-record-local-previews.md), [ALBUM-19 browser event log](2026-11-21-album-19-browser-event-log.md)

## Goal

In `npm run record`, resizing the Chromium window resizes the page, so the responsive layout changes as it would in a normal browser. Today `runSession` opens the context with a fixed `viewport`, so the page stays at 1280x720 (or the `--viewport` size) whatever the window does.

Clicks are logged in viewport pixels. Once the page can change size, the log must say which size each click was measured against.

## What changes

### The headed session

- `runSession` opens the context with `viewport: null` when it is headed. The page then takes the window's size.
- `--viewport <W>x<H>` still sets the starting window size (`--window-size`, with the toolbar allowance as today). The usage text and docs call it the starting size.
- A headless session (a script passing `headless: true`, and the tests) keeps a fixed `viewport` as today.

### The log records the page size and each change

The session measures the page instead of trusting the requested size, since the window's toolbar makes the real page smaller than `--window-size`.

- A second init script, added by `session.ts` only, reports `{ ts, width, height }` (`innerWidth`, `innerHeight`, browser clock) once when each top-level page starts and again after each `resize` event, at most once every 250 ms after resizing stops (trailing debounce). It sends to its own binding, `__albumRecorderViewport`, so `recorder.ts` and the event list are unchanged.
- The session keeps the sizes in order and drops a report equal to the previous size.
- The log's `viewport` is the first size reported: the page size at the first load. If no page reported a size (the page never loaded), it is the requested size for a headless run and `null` for a headed one.
- A new top-level field `resizes` lists each later size: `[{ "t": 5120, "width": 600, "height": 812 }]`. `t` is ms since `startedAt` on the same clock as events, clamped to 0. A click at time `t` was measured against the last size at or before `t`, or `viewport` if there is none.
- Playwright runs (`e2e/fixtures.ts`) write `resizes: []`. Their viewport is fixed.

### Format version

`resizes` is a new field, so older readers that ignore unknown fields keep working. The log stays `version: 2`. `docs/event-log-format.md` gets a "Changes within version 2" note, the `resizes` field, an updated `viewport` line ("the page size in CSS pixels when the first page loaded, or `null` if it is not known") and the example.

### Docs

- `README.md` § Record a session: the viewport line says the window starts at 1280x720 (or `--viewport`), the page follows the window, and the log's `viewport` and `resizes` say what click positions were measured against.
- `docs/event-log-format.md` § How to record: same change.

## Tests

- `e2e/recorder/log.test.ts`: the existing table gains `resizes` cases (none, one, one before the first event clamped to `t: 0`).
- A pure function in `scripts/record/rules.ts` (or a small new module) turns the reported sizes into `{ viewport, resizes }`: dedupe of equal sizes, first size as `viewport`, the fallback when there are none. One table-driven test.
- A headless `runSession` test (vitest, Chromium, a tiny local page) that calls `page.setViewportSize` in `drive` and checks the written log's `viewport` and `resizes`. If Chromium is not installed where tests run, the plan says how this test is skipped, so `npm test` still passes.
- Manual proof on a ticket preview: record, narrow the window until the small-screen layout shows, click something, close. The log shows the resize and the click.

## Leaves out

- New event types or changes to `click`, `input`, `submit`, `navigation`.
- Headless runs following a window; they keep a fixed viewport.
- Recording scroll position, zoom or device pixel ratio.
- A per-window size when a click opens a second window (see Calls I made).

## Calls I made

- **The log records every resize, not just the starting size or `null`.** A `resizes` list next to `viewport` is the only option of the three where each click's size is known. It sits outside `events`, so the event types stay as they are (the ticket rules that change out).
- **`viewport` is measured from the page, not taken from `--viewport`.** With `viewport: null` the page is the window minus the toolbar, which is not exactly the requested height. Logging the requested size would be wrong by the toolbar height.
- **The log stays version 2.** `resizes` is additive. A reader that wants it checks for the field.
- **Sizes are debounced 250 ms after the last `resize` event**, so a drag gives one entry, not dozens. A click during a drag would be measured against the size before the drag ends; that is rare and accepted.
- **Every recorded page reports its size into one list.** If a click opens a second window of another size, its size shows up as a resize. Recordings rarely open a second window.
- **The size script lives in `session.ts`, not `recorder.ts`**, so the Playwright test recorder is untouched.
- **Playwright test logs write `resizes: []`** rather than leaving the field out, so every log has the field.

## Touches

None of these: data, money, auth, user email, migrations.
