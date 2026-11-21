# Browser test event log format

For the author of the replay renderer. A browser test (`npm run test:e2e`) records what it does in the page and writes it as `events.json`, one file per test, in Playwright's output folder for that test (`test-results/<test folder>/events.json`). The file is also attached to the test report. The source of truth for the types is [`e2e/recorder/recorder.ts`](../e2e/recorder/recorder.ts) (`EventLog`, `RecordedEvent`, `ElementInfo`); the design is in [the ALBUM-19 spec](superpowers/specs/2026-11-21-album-19-browser-event-log.md).

This is version 1. It is a proposal that was not agreed with the renderer; if the renderer needs something else, change this file and the recorder together.

## File

JSON, UTF-8, one object:

```json
{
  "format": "album-ranker-events",
  "version": 1,
  "test": "search page: search for an album",
  "startedAt": "2026-11-21T15:04:05.123Z",
  "viewport": { "width": 1280, "height": 720 },
  "events": [
    { "seq": 0, "t": 0, "type": "navigation", "kind": "load", "url": "/" },
    { "seq": 1, "t": 412, "type": "click", "x": 64, "y": 103, "target": { "tag": "a", "selector": "main > p:nth-of-type(1) > a", "text": "Search albums" } },
    { "seq": 2, "t": 430, "type": "navigation", "kind": "push", "url": "/search" },
    { "seq": 3, "t": 880, "type": "click", "x": 120, "y": 140, "target": { "tag": "input", "selector": "main > form > input[name=\"q\"]", "name": "q", "label": "Album or artist" } },
    { "seq": 4, "t": 905, "type": "input", "value": "g", "target": { "tag": "input", "selector": "main > form > input[name=\"q\"]", "name": "q", "label": "Album or artist" } },
    { "seq": 5, "t": 1610, "type": "submit", "target": { "tag": "form", "selector": "main > form" } },
    { "seq": 6, "t": 1702, "type": "navigation", "kind": "load", "url": "/search?q=getz+gilberto" }
  ]
}
```

- `format`, `version`: check these first. `version` is `1`.
- `test`: the test's full title.
- `startedAt`: ISO time when the test's page started recording.
- `viewport`: the page size in CSS pixels, or `null` if the test did not set one.
- `events`: the ordered log.

## Events

Every event has:

- `seq`: position in the log, from 0. The log is in `seq` order.
- `t`: milliseconds since `startedAt`, from the browser's clock at the moment of the event. A full page load does not reset it. It is non-decreasing across the log.
- `type`: one of the four below.

| `type` | Extra fields | Meaning |
|---|---|---|
| `navigation` | `kind`, `url` | `kind` is `load` (a full page load, including the first), `push` or `replace` (a `history.pushState` or `replaceState` call, which includes Next.js client-side route changes) or `pop` (back or forward). `url` is the path and query string, with no origin or hash. |
| `click` | `x`, `y`, `target` | A click. `x` and `y` are viewport pixels. A click made with the keyboard (Enter on a button) reports `x: 0, y: 0`. |
| `input` | `value`, `target` | One event per `input` event on a field, holding the field's whole value after the change. Typing "getz" gives four events. Paste and autofill look the same. |
| `submit` | `target` | A form submit. `target` is the form. |

A password field's `value` is always `"***"`.

## Target

`target` describes the element:

- `tag`: lower-case tag name.
- `selector`: a CSS selector that finds exactly that element in the page. It is built from the nearest `id`, else the `name`, else a child path from `main` or `body`; siblings of the same tag get `:nth-of-type(n)` where needed to keep it unique.
- When present: `id`, `name`, `role` (the `role` attribute), `label` (`aria-label`, else the text of the field's `<label>`) and `text` (trimmed visible text, up to 80 characters; not set for forms and fields).

Find the element by `selector`. If the page no longer matches, fall back to `tag` with `label`, `name` or `text`.

## What is not recorded

Scrolling, hover, mouse movement, keys other than through `input` and `submit`, DOM snapshots, screenshots and video.
