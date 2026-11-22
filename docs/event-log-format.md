# Browser test event log format

For the author of the replay renderer. Two things write this log as `events.json`:

- **A browser test** (`npm run test:e2e`), one file per test, in Playwright's output folder for that test (`test-results/e2e/<test folder>/events.json`). The file is also attached to the test report.
- **A session you click through** (`npm run record`), one file per session, in `recordings/<YYYYMMDD-HHMMSS>-<port>/events.json` (see [How to record](#how-to-record)).

The source of truth for the types is [`e2e/recorder/recorder.ts`](../e2e/recorder/recorder.ts) (`EventLog`, `LogSource`, `RecordedEvent`, `ElementInfo`); the designs are in the [ALBUM-19 spec](superpowers/specs/2026-11-21-album-19-browser-event-log.md) and the [ALBUM-30 spec](superpowers/specs/2026-11-21-album-30-record-local-previews.md).

This is version 2. It is a proposal that was not agreed with the renderer; if the renderer needs something else, change this file and the recorder together.

### Changes from version 1

- New `source` object saying where the log came from (see [Source](#source)).
- `test` is optional: only Playwright runs have it. A version 1 reader could rely on `test` being a string, so this is version 2, not an additive change.
- Events, `startedAt`, `viewport` and the `seq`/`t` rules are unchanged. Nothing read version 1 yet.

### Changes within version 2

- New top-level `resizes` list: each page size after the first (see [File](#file)). It is additive, so the version stays 2 and a reader that ignores unknown fields keeps working. A reader that wants it checks the field is there; every log written now has it.
- `viewport` is now the size measured from the page when the first page loaded, not the size that was requested. A log written before this change has the requested size and no `resizes`.

## File

JSON, UTF-8, one object:

```json
{
  "format": "album-ranker-events",
  "version": 2,
  "source": {
    "kind": "preview",
    "host": "localhost:4030",
    "preview": "30",
    "branch": "feat/album-30-record-events-local-previews",
    "worktree": "/Users/me/album-ranker-30",
    "commit": "3abd2de0c1f4..."
  },
  "startedAt": "2026-11-21T15:04:05.123Z",
  "viewport": { "width": 1280, "height": 590 },
  "resizes": [{ "t": 1650, "width": 600, "height": 812 }],
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

- `format`, `version`: check these first. `version` is `2`.
- `source`: where the log came from, below.
- `test`: the test's full title, for example `"search page: search for an album"`. Only in a Playwright run; the example above is a recorded session, so it has none.
- `startedAt`: ISO time of the first event, so the first event has `t: 0`.
- `viewport`: the page size in CSS pixels when the first page loaded, or `null` if it is not known.
- `resizes`: each later page size, in order: `t` is ms since `startedAt` (same clock as events, at least 0), `width` and `height` are CSS pixels. A click at time `t` was measured against the last resize at or before `t`, or `viewport` if there is none. A browser test has a fixed viewport, so its `resizes` is `[]`.
- `events`: the ordered log.

## Source

| Field | Meaning |
|---|---|
| `host` | Always present. Host and port of the app, for example `localhost:3000`, `127.0.0.1:3100`. |
| `kind` | `"playwright"` (a browser test), `"preview"` (a `npm run preview` target) or `"dev"` (a `next dev` server). Left out for any other server. |
| `preview` | The preview's target (`main`, `30` or a branch name). Previews only. |
| `branch` | The checkout's branch. Left out on a detached HEAD. |
| `worktree` | Path of the checkout the app runs from. |
| `commit` | Full SHA. For the main preview, the commit built when the preview started. For anything else, HEAD of the checkout when the recording started. A dirty working tree is not flagged. |

Every field except `host` is left out when it can't be known, never guessed or set to `null`. Two logs from two previews always differ in `host`, and in `preview` and `branch`.

## Events

Every event has:

- `seq`: position in the log, from 0. The log is in `seq` order.
- `t`: milliseconds since `startedAt`, from the browser's clock at the moment of the event. A full page load does not reset it. It is non-decreasing across the log.
- `type`: one of the four below.

| `type` | Extra fields | Meaning |
|---|---|---|
| `navigation` | `kind`, `url` | `kind` is `load` (a full page load, including the first), `push` or `replace` (a `history.pushState` or `replaceState` call, which includes Next.js client-side route changes) or `pop` (back or forward). `url` is the path and query string, with no origin or hash. |
| `click` | `x`, `y`, `target` | A click. `x` and `y` are viewport pixels. Pressing Enter in a form field makes the browser click the form's submit button, and that click reports `x: 0, y: 0`; it comes just before the `submit`. |
| `input` | `value`, `target` | One event per `input` event on a field, holding the field's whole value after the change. Typing "getz" gives four events. Paste and autofill look the same. |
| `submit` | `target` | A form submit. `target` is the form. |

A password field's `value` is always `"***"`.

Next.js calls `history.replaceState` itself, for example right after hydration, so a `replace` event with the same `url` as the page you are already on is normal. It is not a route change; the renderer can skip it.

## Target

`target` describes the element:

- `tag`: lower-case tag name.
- `selector`: a CSS selector that finds exactly that element in the page. It is built from the nearest `id`, else the `name`, else a child path from `main` or `body`; siblings of the same tag get `:nth-of-type(n)` where needed to keep it unique.
- When present: `id`, `name`, `role` (the `role` attribute), `label` (`aria-label`, else the text of the field's `<label>`) and `text` (trimmed visible text, up to 80 characters; not set for forms and fields).

Find the element by `selector`. If the page no longer matches, fall back to `tag` with `label`, `name` or `text`.

## What is not recorded

Scrolling, hover, mouse movement, keys other than through `input` and `submit`, DOM snapshots, screenshots and video.

## How to record

```
npm run record -- <target> [--out <dir>] [--viewport <W>x<H>]
```

`<target>` is `main`, a ticket number or a branch (the running preview of it), a port (`3000`) or a URL on `localhost`, `127.0.0.1` or `[::1]`. The command opens a Chromium window (one-time install: `npx playwright install chromium`) on that app. You click through it; closing the window or pressing Ctrl-C ends the session and writes the log. The first event is the `load` of the opened URL. The window starts at 1280x720 unless `--viewport` says otherwise, and the page follows the window: resize it and the layout changes as in a normal browser. The log's `viewport` is the page size at the first load (a little under the window's height, because of the toolbar), and each later size, once the resizing stops for 250 ms, is an entry in `resizes`. Cover images load normally in a recording; the browser test blocks them.

Nothing records while the command isn't running: the app has no recorder code and no endpoint.
