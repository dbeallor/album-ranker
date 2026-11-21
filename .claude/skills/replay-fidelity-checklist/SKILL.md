---
name: replay-fidelity-checklist
description: PASS/FAIL checklist, authoring rules and frame-QA recipe for the thread replay video (T3 Code look, time-accurate dashboard and gantt, real action buttons, GitHub views, voiceover). Use when writing or reviewing a replay story or timeline, when QA-ing a rendered replay video, or when the user gives feedback on the replay video.
user-invocable: true
---

# Replay fidelity checklist

Used by `replay-thread-video` while authoring (`tools/replay/story/`, `timeline/`) and while checking frames. Each rule has its reason, taken from the user's feedback. Every item must PASS.

## When to use

- Before rendering a new story, and after rendering, on extracted frames.
- When the user comments on the video: add the new rule here.

## Checklist

**Source and narration**
1. Replayed from chat history, not from screen recordings. Reason: the video must be reproducible and complete.
2. Scripted first-person voiceover explaining what the user is doing, plus caption strip. The voice is the user's cloned ElevenLabs voice by default (`TTS=say` is only the fallback). Reason: a viewer must follow why each step happens, and it is the user speaking.
3. Complete, with the interactions as they would have played out (every command, approval, view). Reason: skipped steps made the loop unclear.

**Looks like a real T3 Code recording**
4. Threads sidebar on the left, thread in the middle, built-in browser on the right, all T3 chrome. Reason: it must read as a real screen recording.
5. Models visible: chief Sonnet 5.5 Medium; spec children Opus 5.5 (then Sonnet 5.5 for build); helpers Sonnet 5.5; reviewers Opus 5.5. Reason: the user wants to see which model does what.
6. Caption strip never covers the composer or model picker. Reason: it hid the controls.
7. Sidebar working/waiting labels, ages, child-card timers, wait bar, attached-file chip, Done tab all match the instant.

**Dashboard and gantt at that time**
8. Drawn with the fake clock, America/New_York timezone, via `stateAt(time)`; the clock only moves forward. Reason: the real dashboard shows today's state, not then.
9. Long waits are fast-forwarded (`ff`) with the time-lapse chip. Reason: honest about skipped time.
10. Rows appear when they start, bars grow, costs, tokens, counts, tab pills, headers, Backlog contents and the Writing tickets group are consistent with the instant. Reason: anachronisms break trust.
11. No anachronism: no completed build or merge bars while the spec is in review; no later tickets in the Backlog before they exist.

**Controls and GitHub**
12. Use the dashboard's action items (Approve, Changes, Start shipping, View spec, View PR), never the nearby links. Reason: that is what the user clicks.
13. Approvals use the real Approve button, never a typed `approve N`. Changes button, then type the rest. Start shipping for mark-todo. Only combined multi-command messages are typed. Reason: matches real use.
14. View the spec on GitHub at each revision's sha before approving it. View the PR on GitHub (Conversation, then Files changed) before the merge approval. Real URLs shown in the address bar. Reason: the user reviews before approving.

**Editing**
15. Never edit an old story or timeline to fit new data; copy to a new date. Reason: old videos must stay reproducible.
16. Never overwrite an earlier video; use a versioned name. Reason: the user compares versions.
17. Real UTC timestamps in the timeline; no invented events.

## Narration style

The narration is the user thinking out loud while working on their own project: first person, spoken, not written.
- Contractions; varied, mostly short sentences.
- React to what is on screen and what is being decided and why, instead of announcing every click. Do not read UI labels or lists verbatim.
- Sparing fillers and restarts ("okay so", "hm", "let me check", "right"): some beats, never all.
- Less during fast actions, more where there is a decision.
- Spoken numbers, no symbols or ids a voice would mangle ("ticket two", "pull request thirteen").
- No marketing words. Facts must match what happens on screen in that beat.
- Pauses: `{pause}` / `{pause:long}` between thoughts, at most about three per beat; `{tag:thoughtful}` (v3 only) very rarely. The voice layer converts them per model.
- Voice settings come from `ELEVENLABS_*` env (see README), not from the story.

## Frame QA recipe

Extract frames at the start of each beat and at every clock jump, approval and GitHub view (video time from `out/frames.txt` or the render log):
`ffmpeg -v error -ss <sec> -i <video> -frames:v 1 -q:v 2 <scratch>/f<sec>.jpg`, then view them. Check at each: the sidebar label and age, the model picker, caption position, dashboard tab pills and counts against the timeline at that clock, gantt bars (only started rows, partial bars), the time-lapse chip while fast-forwarding, the address bar on GitHub tabs, no clipped or overlapping text. Also check audio length equals video length (`ffprobe`).

## Known approximations

- Subagent models are not visible in T3 itself; the cards show the model from the thread history.
- Voiceover is a clone of the user's voice (ElevenLabs), or macOS `say` when no key or voice id is set or with `TTS=say`.
- Long waits are shortened; the chip shows the real clock range.
- GitHub pages are redrawn from fixtures, not screenshots.
- Headless Chrome drops clicks after the first on `t3code://` links, so the driver plays what T3 does with the link (`lib/dash.mjs`).
