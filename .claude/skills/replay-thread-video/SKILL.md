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

1. **Identify the thread.** Project "Album Ranker", thread "ALBUM - Chief of Staff". Use `t3_thread_list` / `t3_thread_search` for it and its child threads (titles, models, start and end times). The full transcript comes from T3's local store, read-only: `sqlite3 -readonly ~/.t3/userdata/statev2.sqlite` (the real message texts, timestamps, senders, attachments). `t3_thread_read` pages are the fallback.
2. **Snapshot ephemeral data before rendering.** Date `<date>` is `YYYY-MM-DD` of the snapshot. Fill `tools/replay/fixtures/<date>/`:
   - `thread.json` (the transcript), `threads.json` (the project's threads, for the sidebar), `snapshot.json` (`takenAt`).
   - Dashboard data: `live-api.json` (`curl -s http://127.0.0.1:$(jq .port .agent-team/dashboard.json)/api`), `gantt/*.json`, `gantt-history.json`, `state.json`, `spend.json`, `specs.json`, `tracker-lists.json`.
   - Each spec version shown: `spec-<ticket>-<sha7>.md` (`git fetch origin refs/pull/<N>/head`, then `git show <sha>:<specPath>`).
   - PRs and issues: `pr-<N>.json` and `pr-<N>.diff`, `issue-<N>.json` and `issue-<N>-timeline.json`, through `~/.collective-wisdom/scripts/gh.sh` only, never bare `gh`.
3. **Write the timeline** `timeline/<date>.json`: tickets, sessions (role `chief`, `helper` or `ticket`, models, titles), specs, prs, chief resets, `events` (real UTC `t`, stage transitions in `set`) and `commands` (every real user message with `control` = `typed | approve | changes | todo` and the `artifact` an approval was given on). Never edit an older timeline. Check it with `node dev/dash-at.mjs <iso time> [ship|backlog|done|cos]` and with the ground-truth test: `node --test lib/` compares `stateAt` against `live-api.json` at the snapshot.
4. **Write the story** `story/<date>.mjs` (copy a previous one for the API, never edit it). Every real command appears in order with its recorded control, every approval is preceded by the View spec / View PR it approves, the chief's replies are the real messages condensed, child cards come from `timeline.sessions`. Check numbers in the narration against the fixtures (see the checklist). `node render.mjs story/<date>.mjs --dry` must show no `late:` lines.
5. **Draft render** with the free voice, in the background (about 10 minutes): `TTS=say FINAL=<repo>/screen_recordings/drafts/<name>.mp4 node render.mjs story/<date>.mjs` (`BEATS=3,7` to redo some beats). QA frames with the checklist, fix, re-render.
6. **Final render** in the ElevenLabs voice: `FINAL=<repo>/screen_recordings/replay-<date>-v<N>.mp4 node render.mjs story/<date>.mjs`. `screen_recordings/` is gitignored; use a new versioned name, never overwrite an earlier video. The voice is slower than `say`, so check the `late:` lines of this render too.
7. **Report** the video path, duration and resolution (`ffprobe -v error -show_entries stream=width,height,duration -of default=nw=1 <file>`), and the approximations.

## Later re-renders (as the MVP gets built)

The user will ask for re-renders as the app is built. A new story should show the new tickets, PRs and the running app. To show the app (localhost) as a browser tab in the T3 pane, extend `browserTabs` kinds: today `kind` is `'dash'` or `'gh'` (`static/stage.html` `browserTabs`/`browserSelect`, `DASH_TAB` and `openGh` in `lib/director.mjs`). Add a kind (for example `'app'` with an iframe or screenshots of the app at that time), document it in `STAGE_API.md`, and ship that through `shipping-replay-tool-changes`.

## Notes

- UI style references: stills from the user's own recordings (`screen_recordings/*.mov`, gitignored) may be used only to match the T3 look. Copy stills into `tools/replay/refs-local/` (gitignored), for example `ffmpeg -ss 30 -i screen_recordings/<f>.mov -frames:v 1 tools/replay/refs-local/<name>.jpg`. Never use a recording as the video source.
- Voice: the user's cloned ElevenLabs voice is the default. The voice id is `ELEVENLABS_VOICE_ID` in `tools/replay/.env` (gitignored, see `.env.example`). The API key is read from `ELEVENLABS_API_KEY`, else the macOS Keychain service `elevenlabs-api-key`; store it once with `security add-generic-password -a "$USER" -s elevenlabs-api-key -w <key> -U`. Never put the key in a file, log or commit. Without a key or voice id the render falls back to macOS `say` (`VOICE`, default `Samantha`); `TTS=say` forces that. ElevenLabs bills per character: audio is cached in `out/voice-cache/` by text, voice, model and settings, so re-renders and `BEATS` subsets reuse it and only edited narration is billed. The render prints the characters synthesized. A failed ElevenLabs call (401 key, 402/429 quota, 422 voice id) stops the render instead of falling back. Tune with env: `ELEVENLABS_MODEL` (default `eleven_multilingual_v2`), `ELEVENLABS_STABILITY` (0.4), `ELEVENLABS_SIMILARITY` (0.8), `ELEVENLABS_STYLE` (0), `ELEVENLABS_SPEED` (0.92, allowed 0.7 to 1.2); all are in the cache key. To A/B voices, render one beat per setting: `BEATS=9 FINAL=<path> ELEVENLABS_MODEL=... node render.mjs story/<date>.mjs`. Narration markup: `{pause}`, `{pause:long}`, `{tag:thoughtful}` (see README).
- Env: `CHROME_PATH` (default is the macOS Google Chrome path). The dashboard page is read from `~/.collective-wisdom/scripts/dashboard/`.
- Install once: `cd tools/replay && npm ci`.
