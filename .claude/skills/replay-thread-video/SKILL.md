---
name: replay-thread-video
description: Re-renders the replay video (screen-recording style, with voiceover) of the Album Ranker "ALBUM - Chief of Staff" T3 thread from its chat history, the dashboard and GitHub data. Use when the user says re-render the video, redo the replay, make a screen recording of the chief of staff thread, update the replay with the new tickets or PRs, or add the running app to the video.
user-invocable: true
---

# Replay the Chief of Staff thread as a video

All code is in `tools/replay/` (see `tools/replay/README.md` and `STAGE_API.md`). Judge the result with the `replay-fidelity-checklist` skill. Any change to the tool itself goes through `shipping-replay-tool-changes`.

## When to use

- The user asks for a (new) replay video, a re-render, or a video that includes newer work (tickets, PRs, the app).
- Do not use for a live screen recording. The video is always replayed from chat history.

## Steps

1. **Identify the thread.** Project "Album Ranker", thread "ALBUM - Chief of Staff". Use `t3_thread_list` / `t3_thread_search` to find it and its child threads (titles, models, start and end times). Read the full history with `t3_thread_read` paging with `afterPosition=-1` until nothing is left. Take real UTC timestamps from it.
2. **Snapshot ephemeral data before rendering.** Date `<date>` is `YYYY-MM-DD` of the session. Create `tools/replay/fixtures/<date>/` and fill it:
   - Dashboard JSON: `port=$(jq .port .agent-team/dashboard.json); curl -s http://127.0.0.1:$port/api > fixtures/<date>/live-api.json` (run from the repo root checkout that owns `.agent-team/`).
   - `cp .agent-team/gantt/*.json fixtures/<date>/gantt/` and `cp .agent-team/state.json fixtures/<date>/`.
   - Each spec version shown: `git fetch origin refs/pull/<N>/head`, then `git show <sha>:<specPath> > fixtures/<date>/spec-<sha7>.md` (7-char sha, one file per revision the story views).
   - PRs and issues: `~/.collective-wisdom/scripts/gh.sh pr view <N> --repo dbeallor/album-ranker --json title,number,headRefName,body,comments > fixtures/<date>/pr<N>.json` (same for `issue view`). Never call bare `gh`.
3. **Write the timeline and the story by copying the previous ones.**
   - `cp timeline/<prev>.json timeline/<date>.json`; `cp story/<prev>.mjs story/<date>.mjs`. Never edit an old story or timeline to fit new data.
   - Timeline: `tickets` (id, title, createdAt, specPath), `sessions` (gantt session id with role `chief`, `helper` or `ticket`), `events` (real UTC `t`, ticket stage transitions in `set`: stage, list, next, risk, specSha/headSha, pr, mergedAt), `commands` (`t`, `text`, `control` = `typed | approve | changes | todo`, `ticket`). Check it with `node dev/dash-at.mjs <iso time> [ship|backlog|done|cos]` (screenshots to `out/dash-at/`).
   - Story: `meta` (date, timeline, fixtures, dashUrl, tree, setup incl. model) and `beats`. Each beat has `say` (first-person voiceover about what the user is doing) and `run` (actions from `lib/director.mjs`: `clock`, `ff`, `type`, `press`, `pressChanges`, `reply`, `card`, `waitOn`, `viewSpec`, `viewPr`, `filesChanged`, `openPanel`, `dashTab`...). Chat text is the condensed real text from the history.
   - `viewPr` reads `fixtures/<date>/pr13.json` and `spec-42e9abb.md` by name: parametrize it in `lib/director.mjs` when a story shows a different PR.
4. **Render** (macOS, Chrome, ffmpeg; run from `tools/replay`):
   - Quick check of some beats: `BEATS=3,7 FINAL=$PWD/out/check.mp4 node render.mjs story/<date>.mjs` (other beats replay silently so state carries over).
   - Full video, in the background (it takes several minutes): `FINAL=<repo>/screen_recordings/replay-<date>-v<N>.mp4 node render.mjs story/<date>.mjs`. `screen_recordings/` is gitignored. Use a new versioned name, never overwrite an earlier video.
5. **QA** with the frame recipe in `replay-fidelity-checklist`. Fix the story or timeline, re-render, repeat.
6. **Report** the video path, duration and resolution (`ffprobe -v error -show_entries stream=width,height,duration -of default=nw=1 <file>`), and the approximations.

## Later re-renders (as the MVP gets built)

The user will ask for re-renders as the app is built. A new story should show the new tickets, PRs and the running app. To show the app (localhost) as a browser tab in the T3 pane, extend `browserTabs` kinds: today `kind` is `'dash'` or `'gh'` (`static/stage.html` `browserTabs`/`browserSelect`, `DASH_TAB` and `openGh` in `lib/director.mjs`). Add a kind (for example `'app'` with an iframe or screenshots of the app at that time), document it in `STAGE_API.md`, and ship that through `shipping-replay-tool-changes`.

## Notes

- UI style references: stills from the user's own recordings (`screen_recordings/*.mov`, gitignored) may be used only to match the T3 look. Copy stills into `tools/replay/refs-local/` (gitignored), for example `ffmpeg -ss 30 -i screen_recordings/<f>.mov -frames:v 1 tools/replay/refs-local/<name>.jpg`. Never use a recording as the video source.
- Env: `CHROME_PATH` (default is the macOS Google Chrome path), `VOICE` (default `Samantha`). The dashboard page is read from `~/.collective-wisdom/scripts/dashboard/`.
- Install once: `cd tools/replay && npm ci`.
