# Thread replay renderer

Replays a T3 Code chat thread (the Album Ranker "ALBUM - Chief of Staff" thread) as a screen-recording-style video with voiceover. A 1920x1280 stage page imitates the T3 Code app (threads sidebar, chat, built-in browser). The team dashboard in the browser pane is the real dashboard page, served against an `/api` rebuilt for any instant from recorded data.

## Prerequisites

- Node 20.12 or newer, then `npm ci` in this directory
- Google Chrome (set `CHROME_PATH` if it is not at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`)
- `ffmpeg` and `ffprobe` on the PATH
- Voiceover in the user's cloned ElevenLabs voice (see Voiceover); macOS `say` is the fallback (`VOICE`, default `Samantha`)
- The collective-wisdom checkout at `~/.collective-wisdom` (dashboard page source and spec parsing)

## Run

```sh
node --test lib/                                             # unit tests
node render.mjs story/2026-11-20.mjs                         # full video to out/replay.mp4
BEATS=3,7 FINAL=$PWD/out/check.mp4 node render.mjs story/2026-11-20.mjs   # some beats only
node dev/dash-at.mjs 2026-11-20T23:30:00Z ship               # screenshot the dashboard at one instant
```

`FINAL` sets the output path. Generated files (`out/`, `refs-local/`, `node_modules/`) and `.env` are gitignored.

## Voiceover

The default voice is the user's cloned ElevenLabs voice. Set `ELEVENLABS_VOICE_ID` in `.env` (copy `.env.example`; gitignored). The API key comes from `ELEVENLABS_API_KEY`, else the macOS Keychain, where you store it once with:

```sh
security add-generic-password -a "$USER" -s elevenlabs-api-key -w <key> -U
```

The key never goes in a file. Without a key or voice id the render uses macOS `say`; `TTS=say` forces that. `ELEVENLABS_MODEL` overrides the model (default `eleven_multilingual_v2`); the voice settings are constants in `lib/voice.mjs`.

ElevenLabs bills per character, so synthesized audio is cached in `out/voice-cache/` keyed by provider, voice, model, settings and text. Re-renders and `BEATS` subsets reuse it; only changed narration is synthesized. Each render logs cache hits and fresh synthesis, and ends with the characters synthesized. If an ElevenLabs call fails (401 bad key, 402/429 quota, 422 bad voice id) the render stops and does not fall back to `say`.

## Layout

- `render.mjs`: runs a story, speaks each beat, assembles the video
- `lib/voice.mjs`: text to speech (ElevenLabs with cache, or `say`)
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
