# Record browser events on any local app or preview

**Status:** Shipped
**Date:** 2026-11-21
**Shipped:** in PR #32, with differences: [as-built](../as-built/2026-11-21-album-30-record-local-previews.md)
**Ticket:** [ALBUM-30](https://github.com/dbeallor/album-ranker/issues/30)
**Follows:** [browser event log](2026-11-21-album-19-browser-event-log.md), [local previews](2026-11-21-album-20-local-previews.md)

## Goal

Today the event recorder only runs inside a Playwright test on port 3100. Make it record a session you click through yourself on the dev server (`npm run dev`, port 3000) or on any local preview (`npm run preview`, ports 4000 and up), and make every log say where it came from: host and port, and where the code can tell, the kind of run, preview name, branch, worktree and commit.

## How recording works

A new command opens a recording browser window on a local app:

```
npm run record -- <target> [--out <dir>] [--viewport <W>x<H>]
```

`<target>` is one of:

- `main`, a ticket number (`30`) or a branch: the running preview of that target, looked up the way `npm run preview -- list` finds it. If that preview isn't running, the command fails and prints the `npm run preview -- <target>` line to start it.
- a port (`3000`): `http://localhost:<port>`.
- a URL on a loopback host (`http://localhost:3000/search`, `127.0.0.1`, `[::1]`). Any other host is refused, so the command can't record a deployed site.

The command launches Playwright's Chromium in a visible window (headed), with the same recorder the browser tests use: `context.addInitScript(recorderScript())` and the `__albumRecorderSend` binding, then opens the URL. You click through the app in that window.

- **Start:** when the window opens on the URL. The first event is its `load`.
- **End:** when you close the window, or press Ctrl-C in the terminal. The command then writes the log and prints its path.
- **Crash safety:** the log is also rewritten at most once a second while events arrive, so a killed process still leaves the events up to that point.
- **Where:** `recordings/<YYYYMMDD-HHMMSS>-<port>/events.json` in the checkout you ran the command from, or `<dir>/events.json` with `--out <dir>`. `recordings/` is gitignored.
- **Viewport:** fixed at 1280x720 unless `--viewport` says otherwise, so the clicks' `x` and `y` match the `viewport` in the log. The window is sized to fit it.

Cover images load normally in a recording (the test fixture's Cover Art Archive 404 stays test-only).

### Why not in the app

Turned down: **a client component in the root layout behind an env flag, sending events to a local route handler.** It would record in your own browser, but it puts recorder code and a write endpoint into the app, and "off" then depends on a flag being unset everywhere. It also breaks the ALBUM-19 rule that a build has no recorder code.

With the recording browser, the app does not change at all. A dev server or preview has no listener and no endpoint, so with recording off nothing is sent or stored, and `npm run build` output stays free of recorder code (the ALBUM-19 check still passes). A preview records only while you run `npm run record` against it.

## Where the metadata comes from

The page never sees the metadata. The Node side (the `record` command, or the test fixture) works it out and writes it into the log:

| Field | Playwright test | Preview (`main`, `30`) | Other local server (`3000`) |
|---|---|---|---|
| `kind` | `"playwright"` | `"preview"` | `"dev"` if the process listening on the port runs `next dev`, else left out |
| `host` | `127.0.0.1:3100` | the host and port of the opened URL | same |
| `preview` | left out | the preview's target (`main`, `30`, or a branch) | left out |
| `branch` | from `git` in the test's checkout | from the preview record and `git worktree list` | from `git` in the listening process's working folder |
| `worktree` | the test's checkout path | the previewed worktree's path | the listening process's working folder, if it is a git checkout |
| `commit` | HEAD of the checkout | main: the commit built when the preview started. A ticket preview: HEAD when the recording started | HEAD when the recording started |

- **Previews:** `scripts/preview/` writes one record per running preview in `.preview/<target>.json` (pid, port, target, branch). The record gains `commit`, the full HEAD SHA at start. `npm run record` scans each worktree's `.preview/` for a live record on the port it opens, so a port number or URL that points at a preview is recognised as that preview too.
- **Other servers:** the command finds the process listening on the port with `lsof`, reads its working folder and command line, and asks `git` in that folder. If any step fails (no `lsof`, not a git checkout, another user's process), those fields are left out. `host` is always there.
- Commits are full SHAs. A detached HEAD has no `branch`.

Two logs from two previews always differ in `host`, and in `preview` and `branch`.

## Log format: version 2

The log gains a `source` object, and `test` becomes optional (a session you click through has no test). A reader of version 1 can rely on `test` being a string, so this is version 2, not an additive change. Nothing reads version 1 yet: the replay renderer isn't built.

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
  "viewport": { "width": 1280, "height": 720 },
  "events": [ ... ]
}
```

- `source.host` is always present. Every other `source` field is left out when it can't be known, never guessed or set to `null`.
- `test` is present only for Playwright runs.
- Events, `startedAt`, `viewport` and the `seq`/`t` rules don't change.

`EventLog` in `e2e/recorder/recorder.ts` and `docs/event-log-format.md` describe version 2, with a short "changes from version 1" note. The test fixture writes version 2 with `kind: "playwright"`.

## Code layout

- `e2e/recorder/log.ts`: builds the log from the sent events (the `toLog` and log assembly now in `e2e/fixtures.ts`), shared by the fixture and the command.
- `e2e/recorder/source.ts`: Node-side helpers that read branch, worktree and commit from `git`. The fixture and the command both use it.
- `scripts/record.ts` and `scripts/record/`: argument parsing, target resolution and the session. The rules (parse arguments, turn a target into a URL, refuse non-loopback hosts, match a port to a preview record, build `source` from what was found) are pure functions with table tests, like `scripts/preview/rules.ts`. The session is a function the command calls, which takes the browser to drive, so the proof can run the acceptance session headless from a script.
- `scripts/preview/index.ts`: the preview record gains `commit`.
- `.gitignore`: `recordings/`.
- README: a "Record a session" section. `docs/event-log-format.md`: version 2 and how to record.

## Tests

One table-driven test per rule:

- Argument parsing: targets (`main`, number, branch, port, loopback URL, non-loopback URL refused, bad `--viewport`).
- Matching a port to a preview record (live, stale, none).
- Building `source` from what was found: each column of the table above, and fields left out when a lookup failed.
- The log builder: a version 2 log with and without `test`.
- The existing recorder unit tests and the Playwright search test stay; the search test also checks `source.kind` and `source.host`.

## Acceptance

From the ticket, and how the proof shows each:

1. Recording on, a session on `http://localhost:3000` (open `/`, go to Search, type a query, submit) writes an `events.json` that matches the format, with `source.host` `localhost:3000`. Proof: the session run against `npm run dev`, driven by a script through the session function; the log is attached.
2. The same session on `main` (4000) and on this ticket's preview (4030) writes logs naming the port, branch and commit. Proof: both logs.
3. Those two logs differ in `source` alone. Proof: the two `source` objects side by side.
4. Recording off, no server sends or stores events: the app has no recorder code or endpoint. Proof: `git diff` shows no change under `app/`, `components/` or `lib/`.
5. A production build has no recorder code (no `__albumRecorderSend` in `.next/static`), and `npm run test:e2e` still writes its log, now version 2 with `source`.
6. `docs/event-log-format.md` and the README say how to record and what `source` holds.

## Non-goals

- The replay renderer.
- Recording in your own everyday browser, on deployed environments, or real users.
- New event types.
- A `--record` flag on `npm run preview`.
- Changes to the app (`app/`, `components/`, `lib/`).

## Calls I made

Surprising first.

- **You record in a separate Chromium window that `npm run record` opens, not in your normal browser.** It keeps recorder code out of the app entirely. The cost: no extensions, logins or history from your own browser in that window (the app has none of its own today).
- **The log moves to version 2**, because `test` becomes optional. Nothing reads version 1 yet.
- **The command takes a preview target, a port or a loopback URL**, and refuses any non-loopback host.
- **`kind` is `"dev"` only when the listening process runs `next dev`.** A ticket preview also runs `next dev` but is reported as `"preview"`, since it was found by its preview record. Something else on a port (for example `next start` by hand) gets no `kind`.
- **The server's checkout is found with `lsof`** for a non-preview port. macOS and Linux only; if it fails, the log has `host` and nothing else in `source`.
- **Commit for main is the commit built when the preview started** (stored in the preview record); for a dev server or ticket preview it is HEAD when the recording starts, since those reload code as it changes. A dirty working tree is not flagged.
- **Recordings go to `recordings/` in the checkout you ran the command from** (gitignored), one folder per session, the file named `events.json` like the test logs.
- **The viewport is fixed at 1280x720 by default**, so click positions line up with the log.
- **Cover images load normally** in a recording, unlike the test, which blocks them.
- **The log is saved at most once a second during the session**, so a crash loses at most the last second.
- **Proof of the manual sessions is scripted:** the session function is driven headless by a script against the real dev server and previews, rather than by hand.
