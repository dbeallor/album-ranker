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
node render.mjs story/2026-11-21.mjs                         # full video to out/replay.mp4
TTS=say FINAL=$PWD/out/draft.mp4 node render.mjs story/2026-11-21.mjs   # draft with the free macOS voice
BEATS=3,7 FINAL=$PWD/out/check.mp4 node render.mjs story/2026-11-20.mjs   # some beats only (BEATS=3-7 and BEATS=1,4-6 work too)
node render.mjs story/2026-11-20.mjs --dry                   # or DRY=1: plan only, no screenshots or audio
node dev/dash-at.mjs 2026-11-20T23:30:00Z ship               # screenshot the dashboard at one instant
```

`--dry` runs the whole story against the real stage and dashboard (so a control that is not there at that clock fails, with the reason) but captures nothing and speaks nothing. It prints each beat's planned length (the narration length is estimated from the word count, so it is only a guide), the actions with their time in the beat, and `late:` lines for an `until(f)` that came after its point in the narration, because the actions before it took longer than the narration allows. A render prints the same `late:` lines.

`FINAL` sets the output path. Generated files (`out/`, `refs-local/`, `node_modules/`) and `.env` are gitignored.

## Flow

Snapshot (`fixtures/<date>/`: the transcript read from `~/.t3/userdata/statev2.sqlite`, threads, PRs, specs, dashboard data) -> `timeline/<date>.json` -> the ground-truth test (`node --test lib/` checks `stateAt` against `live-api.json`) -> `story/<date>.mjs` -> `--dry` -> draft render with `TTS=say` -> frame QA -> the ElevenLabs render. `.claude/skills/replay-thread-video` has the steps, `replay-fidelity-checklist` the rules.

## Voiceover

The default voice is the user's cloned ElevenLabs voice. Set `ELEVENLABS_VOICE_ID` in `.env` (copy `.env.example`; gitignored). The API key comes from `ELEVENLABS_API_KEY`, else the macOS Keychain, where you store it once with:

```sh
security add-generic-password -a "$USER" -s elevenlabs-api-key -w <key> -U
```

The key never goes in a file. Without a key or voice id the render uses macOS `say`; `TTS=say` forces that.

Overrides (env, no code change; all are part of the cache key):

| Variable | Default | Notes |
|---|---|---|
| `ELEVENLABS_MODEL` | `eleven_multilingual_v2` | `eleven_v3` also works for the clone |
| `ELEVENLABS_STABILITY` | `0.4` | 0 to 1. On v3 the API snaps it to Creative 0, Natural 0.5, Robust 1 |
| `ELEVENLABS_SIMILARITY` | `0.8` | 0 to 1 |
| `ELEVENLABS_STYLE` | `0` | 0 to 1 |
| `ELEVENLABS_SPEED` | `0.92` | 0.7 to 1.2 (the API's range); other values fail fast |

Narration markup, converted per model by `lib/narration.mjs`: `{pause}` and `{pause:long}` become `<break time="0.4s" />` and `0.8s` on v2, `[pause]` and `[long pause]` on v3; `{tag:thoughtful}` becomes `[thoughtful]` on v3 and is dropped elsewhere. Captions drop the markers; `say` turns pauses into silences. Keep a few pauses per beat, many break tags cause artifacts. The neighbouring beats' text goes along as `previous_text` / `next_text` for continuity (not on v3, which rejects them).

Synthesis uses the `with-timestamps` endpoint (`POST /v1/text-to-speech/{voice_id}/with-timestamps`): it returns base64 audio and `alignment` (`characters`, `character_start_times_seconds`, `character_end_times_seconds`). It takes `previous_text` / `next_text` like the plain endpoint. `<break>` tags come back in the alignment as ordinary characters, all stamped with the time the break starts; `lib/timing.mjs` skips them. The alignment is stored next to the mp3 (`<key>.json`); an mp3 without it counts as a cache miss.

ElevenLabs bills per character, so synthesized audio is cached in `out/voice-cache/` keyed by provider, voice, model, settings and text. Re-renders and `BEATS` subsets reuse it; only changed narration is synthesized. Each render logs cache hits and fresh synthesis, and ends with the characters synthesized. If an ElevenLabs call fails (401 bad key, 402/429 quota, 422 bad voice id) the render stops and does not fall back to `say`.

## Story API

A story (`story/<date>.mjs`) exports `meta` and `beats`. A beat is `{ say, caption?, run }`: `say` is the narration with `{pause}` markers (a beat without `say` is silent and lasts as long as its actions), `caption` replaces the caption text when it should differ from the narration, `run` is an async function of the calls below (from `lib/director.mjs`, `lib/recorder.mjs`).

Captions are cut on sentence boundaries (not at `p.m.`, `e.g.`, initials or `Next.js`), further at clauses and words when a sentence is long, so that each piece fits the caption strip's two lines, and are shown one after the other in proportion to their length over the narration. A beat's actions are timed against the narration: `until(f)` holds until fraction `f` of the audio has played, `ff(time, { until: f })` runs the clock until then. A beat lasts the longer of its actions and its narration plus 0.7 s; with little narration the actions set the length, with a lot the last frame holds.

### Cues: actions anchored to spoken words

The voice's word times drive the scene. A phrase is a string (matched case-insensitively at a word start, first occurrence) or `{ word, nth }`. With an ElevenLabs alignment the time is exact; for `say` and for `--dry` without cached audio it is estimated from the phrase's position in the text. A render prints, per beat, every cue as `cue "word": word 12.34s, action 12.50s (+0.16s)` and writes `out/sync.json` (beat, word and action times, also as absolute video seconds). An action more than 0.4 s after its word is reported as `late:` with by how much; a phrase that is not in the narration fails the render.

| Call | What it does |
|---|---|
| `until('Approve')`, `until({ word: 'Merge', nth: 2 })` | Holds until the word starts. `until(0.5)` (a fraction of the audio) still works. |
| `approve(t, { at })`, `startShipping(t, { at })`, `changes(t, rest, { at, sendAt, ms })`, `dashTab(tab, { at })`, `openPanel(t, kind, scope?, { at })`, `viewSpec({ ..., at })`, `viewPr({ ..., at })`, `filesChanged({ at })`, `backToDash({ at })` | The cursor arrives on the control 0.1 s after the word (the move starts early enough). `sendAt` is the word the typed message is sent on. |
| `type(text, { ms, at })` | Typing starts early enough for the message to be sent on the word. |
| `ff(time, { until: 'word' })` | Runs the clock until the word. |
| beat `delay: 1.5` | Silence before the voice, so the scene can set up first (replies, a time-lapse) and the voice never describes what is not yet on screen. |
| `pauseVoice('word')` ... `resumeVoice(lead = 0.6)` | The voice stops just before the word while a stretch of actions that is longer than the words runs, then carries on; the cached audio is cut there and silence inserted (`media.mjs` `voiceFilter`), no new synthesis. `resumeVoice` lets the voice restart `lead` s later so the next click can travel. |
| `closeOldTabs()` | Closes GitHub tabs down to two (about 1.2 s each). Call it where the voice leaves room, before a view; otherwise the fourth tab is closed on the spot and delays the cues after it. |

The dry run uses the cached audio and its alignment when it exists (no network), so it shows the real cue times.

`meta.sidebarThreads` (or `sidebarThreads(list)`) takes the recorded `threads.json` rows; see below.

| Call | What it does |
|---|---|
| `clock(time)` | Jumps the clock. `time` is `HH:MM:SS` (UTC, on `meta.date`; once the clock is past that time of day it means the next day, so `03:41:13` after `23:57:00` is the next night) or an ISO string. The clock only moves forward; going back throws. |
| `ff(time, { ms, until })` | Runs the clock to `time` while recording, in `ms` or until fraction `until` of the narration. Shows the time-lapse chip `6:03 p.m. → 6:51 p.m.` (fixed range, the date added when both ends would read the same, no chip under a minute). |
| `later(time, { ms })` | A long idle gap: `ff` in about 2.2 s with a `Later` chip, `later('05:06:00')` for the night from 6:57 p.m. to 12:06 a.m. Sidebar ages (`4h`, `2d`) and the dashboard advance with it. |
| `type(text, { attach, ms })` | Types into the composer, then sends. |
| `sent(text, { sender, attach })` | A message the user did not type: appears as sent at once. `sent('CHIEF OF STAFF RESET a7c3e19d. Run /chief-of-staff take over.', { sender: 'Chief of staff reset' })`, between `reply(...)` calls for the chief's `Resetting my context ...` message and its take-over message. |
| `reply(markdown, { think, reveal })` | The chief's answer, block by block; a fenced block is a code block. |
| `thinking(on)`, `worked(label)` | The `Working` indicator, the `Worked for 25s` line. |
| `card({ id, title, subtitle, doneSubtitle, model, runs })` | A child thread card. `runs` are `[start, end]` clock times; the card counts up in a run, says `Finished 6:45 p.m.` between runs, with the model tag (`Opus 5.5` for spec work, `Sonnet 5.5` for builds and ticket helpers). Cards are independent: several can run at once. |
| `patchCard(id, { model, runs, subtitle, ... })` | A spec card turning into the build (`{ model: 'Sonnet 5.5' }`) or resuming (`{ runs: [[...], [...]] }`, all its runs). |
| `waitOn(ids, { commands })` | The wait bar and the sidebar `Waiting` status. One id: `Waiting · <title> 2m 37s  Details Open Stop`. An array (or `commands`, the number of background commands): `Waiting on 2 subagents and 1 command ...`. A child leaves the wait when its run ends. |
| `approve(ticket)` | Moves the cursor to the Approve button of the ticket's card (scrolling the board to it first), clicks it, and the composer is filled with `approve N` and sent. |
| `changes(ticket, rest)` | Clicks Changes; the composer is prefilled with `changes N: ` and `rest` is typed after it. |
| `startShipping(ticket)` | Clicks Start shipping (Backlog tab); the composer gets `mark N todo` and sends it. |
| `openPanel(ticket, 'agents' \| 'details', scope)` | Opens the card's Agents or Details panel (`scope` `'merged'` on the Done tab). The old order `openPanel('agents', ticket)` works too. |
| `dashTab('ship' \| 'backlog' \| 'done' \| 'cos')` | Clicks a dashboard tab. |
| `viewSpec({ ticket, sha, md, path?, scrollTo?, depth?, ms?, stay? })` | Clicks the card's View spec and shows the spec at that commit in a new tab (full blob url in the address bar), then clicks the Agent team tab to go back. `depth: 'skim'` is a quick look (open, one scroll, back; 3 to 4 s), `'read'` (default) is slower and brings the heading `scrollTo` into view; `ms` sets the reading time. `md` defaults to `fixtures/<date>/spec-<ticket>-<sha>.md`. |
| `viewPr({ ticket, pr, diff, depth?, tabs?, scrollTo?, ms?, stay? })` | Same for View PR: `pr` is the parsed `pr-N.json`, `diff` the text of `pr-N.diff`. Drawn as of the clock: only the comments and commits that existed then, the badge Open until the merge time. `read` visits Conversation then Files changed (file list, a few expanded diffs; binary and large files collapsed), `skim` only Conversation; `tabs: ['conversation', 'files']` overrides. |
| `viewIssue({ issue, depth?, scrollTo?, ms?, stay? })` | Clicks the issue's link on the dashboard (it must be visible on the current tab) and shows the parsed `issue-N.json`, open until its `closedAt`. |
| `chatScroll(back)`, `chatToEnd()` | Scrolls the chat up `back` px so the `Scroll to end` pill shows; clicks the pill. |
| `scrollDash(y)`, `scrollToHeading(text)`, `scrollGhBy(fraction)`, `filesChanged()`, `backToDash()`, `openDashTab()` | Lower-level pieces. With `stay: true` a view leaves its page open for these. |

Opening always clicks the dashboard's real action button, going back clicks the Agent team tab. At most three GitHub tabs stay open: the oldest is closed with the cursor on its close button when a fourth opens. A control the dashboard does not offer at the clock fails with the card's state (`lib/buttons.mjs` `locate`).

```js
await approve('ALBUM-4')
await changes('ALBUM-5', 'use the other catalog source')
await startShipping('ALBUM-9')
await viewSpec({ ticket: 'ALBUM-7', sha: 'd99fe7c', depth: 'skim' })
await viewPr({ ticket: 'ALBUM-7', pr: JSON.parse(fs.readFileSync(`${FX}/pr-21.json`, 'utf8')), diff: fs.readFileSync(`${FX}/pr-21.diff`, 'utf8') })
await card({ id: 's7', title: 'ALBUM-7 Elo engine', subtitle: 'SPEC CHILD Writing', model: 'Opus 5.5', runs: [['05:42:37', '05:44:00']] })
await waitOn(['s7', 's10'], { commands: 1 })
await later('05:06:00')
```

The sidebar shows the project's other top-level threads from `threads.json`: `sidebarThreads(threads)` (or `meta.sidebarThreads`). A thread appears at its `createdAt` in the Working group and, once `updatedAt` has passed (unless its status is `running`), settles into the Settled count. Child threads (`parentThreadId`) and the chief's own thread are ignored.

## Layout

- `render.mjs`: runs a story, speaks each beat, assembles the video
- `lib/voice.mjs`: text to speech (ElevenLabs with cache and alignment, or `say`); `lib/timing.mjs`: word start times for cues
- `story/<date>.mjs`: narration and stage actions per beat
- `timeline/<date>.json`: tickets, sessions, stage events and commands with real UTC times
- `fixtures/<date>/`: recorded dashboard JSON, gantt sessions, spec versions, PR data
- `lib/`: director (what a story can do), `state-at` (dashboard state at an instant), recorder, media, dashboard serving, `diff` (a `.diff` file to files and hunks), `captions` (caption pieces), `clock-format` (time labels, the chip, `HH:MM:SS` roll-over), `beat-range` (`BEATS`)
- `static/stage.html`: the stage; `dev/dash-at.mjs`: dashboard screenshot tool

## More

- `STAGE_API.md`: the `window.S` stage API
- `.claude/skills/replay-thread-video`: how to re-render
- `.claude/skills/replay-fidelity-checklist`: what the video must get right
- `.claude/skills/shipping-replay-tool-changes`: how to ship changes
