# Thread replay renderer

Replays a T3 Code chat thread (the Album Ranker "ALBUM - Chief of Staff" thread) as a screen-recording-style video with voiceover. A 1920x1280 stage page imitates the T3 Code app (threads sidebar, chat, built-in browser). The team dashboard in the browser pane is the real dashboard page, served against an `/api` rebuilt for any instant from recorded data.

## Prerequisites

- Node 20 or newer, then `npm ci` in this directory
- Google Chrome (set `CHROME_PATH` if it is not at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`)
- `ffmpeg` and `ffprobe` on the PATH
- macOS `say` for the voiceover (`VOICE`, default `Samantha`)
- The collective-wisdom checkout at `~/.collective-wisdom` (dashboard page source and spec parsing)

## Run

```sh
node --test lib/                                             # unit tests
node render.mjs story/2026-11-20.mjs                         # full video to out/replay.mp4
BEATS=3,7 FINAL=$PWD/out/check.mp4 node render.mjs story/2026-11-20.mjs   # some beats only
node dev/dash-at.mjs 2026-11-20T23:30:00Z ship               # screenshot the dashboard at one instant
```

`FINAL` sets the output path. Generated files (`out/`, `refs-local/`, `node_modules/`) are gitignored.

## Layout

- `render.mjs`: runs a story, speaks each beat, assembles the video
- `story/<date>.mjs`: narration and stage actions per beat
- `timeline/<date>.json`: tickets, sessions, stage events and commands with real UTC times
- `fixtures/<date>/`: recorded dashboard JSON, gantt sessions, spec versions, PR data
- `lib/`: director (what a story can do), `state-at` (dashboard state at an instant), recorder, media, dashboard serving
- `static/stage.html`: the stage; `dev/dash-at.mjs`: dashboard screenshot tool

## More

- `STAGE_API.md`: the `window.S` stage API
- `.claude/skills/replay-thread-video`: how to re-render
- `.claude/skills/replay-fidelity-checklist`: what the video must get right
- `.claude/skills/shipping-replay-tool-changes`: how to ship changes
