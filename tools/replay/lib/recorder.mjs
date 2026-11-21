// Frame capture and timing: a page screenshot becomes a video frame with a duration, and each beat knows how long its narration is.
import fs from 'fs'
import path from 'path'
import { plain } from './narration.mjs'
import { captionChunks } from './captions.mjs'
import { specLabel } from './timing.mjs'

export const FPS = 12
export const STEP = 1000 / FPS
const WORDS_PER_SECOND = 2.6
const LATE_MS = 700
export const CUE_TOLERANCE = 0.4 // seconds an action may come after its word before it counts as late

let page, framesDir, frames, count, beatMs, narrationS, chunks, shown, skipping, elapsedS, actions, late, cues, delayS, syncs, gaps, openGap

/** `write` false is for a dry run: nothing is captured, so the frames folder stays as it is. */
export function begin(p, dir, { write = true } = {}) {
  page = p; framesDir = write ? dir : null
  if (write) { fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true }) }
  frames = []; count = 0; elapsedS = 0
  beatMs = 0; narrationS = 0; chunks = []; shown = null; skipping = false; actions = []; late = []; cues = null; delayS = 0; syncs = []; gaps = []; openGap = null
}

/** Seconds a voice takes for `text` (markers included), to plan a beat without synthesizing it. */
export const estimateSeconds = (text) => plain(text).split(/\s+/).filter(Boolean).length / WORDS_PER_SECOND + (text.match(/\{pause(?::long)?\}/g) ?? []).length * 0.5

/**
 * Starts a beat `{ say, caption }` whose narration lasts `seconds`, or an unrecorded one (`seconds` null) that only replays its actions.
 * `plan` also leaves the beat unrecorded but gives it the narration length, so `until` and the scene length are what a render would get.
 * `lookup` is `(spec) => seconds` (see timing.mjs `cueLookup`): when a phrase of the narration starts, counted from the start of the voice. The voice starts `beat.delay` seconds into the scene (default 0), so the scene can set up before it speaks.
 */
export function startBeat(beat, seconds, { plan = false, lookup = null } = {}) {
  skipping = seconds === null || plan
  narrationS = seconds ?? 0
  cues = seconds === null ? null : lookup
  delayS = seconds ? beat.delay ?? 0 : 0
  const text = beat.caption ?? (beat.say ? plain(beat.say) : '')
  chunks = text ? captionChunks(text) : []
  beatMs = 0; shown = null; actions = []; late = []; syncs = []; gaps = []; openGap = null
}

/** Ends the beat, padding it to the narration plus a short pause (none for a beat without narration), and returns its length in seconds, the actions that ran (`[{ at, text }]`) and the `until` calls that came late. */
export async function endBeat({ plan = false } = {}) {
  const wantMs = narrationS ? (delayS + narrationS + gapTotal() + 0.7) * 1000 : 0
  if ((!skipping || plan) && beatMs < wantMs) await hold(wantMs - beatMs)
  if (openGap) throw new Error(`the voice was paused before "${openGap.label}" and never resumed`)
  const result = { seconds: beatMs / 1000, delay: delayS, gaps, actions, late, syncs }
  skipping = false
  return result
}

export const recording = () => !skipping
export const totalSeconds = () => elapsedS

/** Notes an action of the story (its name and arguments) at the beat's current time, for the dry run and the render log. */
export const note = (text) => actions.push({ at: beatMs / 1000, text })

async function captionAt() {
  if (!chunks.length) return
  const total = chunks.reduce((a, s) => a + s.length, 0)
  let acc = 0, want = chunks.at(-1)
  for (const s of chunks) { acc += s.length; if (!narrationS || voiceAt(beatMs / 1000) / narrationS <= acc / total) { want = s; break } }
  if (want !== shown) { await page.evaluate((t) => S.caption(t), want); shown = want }
}

/** Shows the stage as it is now for `ms`. */
export async function hold(wantMs) {
  const steps = Math.max(1, Math.round(wantMs / STEP))
  const ms = steps * STEP
  if (skipping) { beatMs += ms; return }
  await captionAt()
  const f = path.join(framesDir, `f${String(count++).padStart(5, '0')}.jpg`)
  await page.screenshot({ path: f, type: 'jpeg', quality: 82 })
  frames.push({ f, seconds: steps / FPS })
  beatMs += ms; elapsedS += ms / 1000
}

/** Runs `step(p)` for p from 0 to 1 over `ms`, a frame per step; an unrecorded beat takes only the last step. */
export async function anim(ms, step, stepMs = STEP) {
  const k = skipping ? 1 : Math.max(1, Math.round(ms / stepMs))
  for (let i = 1; i <= k; i++) { await step(i / k); await hold(skipping ? ms : stepMs) }
}

const gapTotal = () => gaps.reduce((n, g) => n + g.seconds, 0)

/** Seconds into the audio that the voice has reached at scene time `t`: the delay and the pauses (see `pauseVoice`) are not narration. */
function voiceAt(t) {
  let v = t - delayS
  for (const g of gaps) if (t > g.start) v -= Math.min(g.seconds, t - g.start)
  if (openGap && t > openGap.start) v -= t - openGap.start
  return Math.max(0, v)
}

/** Scene time (seconds) at which the voice reaches `audioS`: the delay plus every pause before it. */
const sceneAt = (audioS) => delayS + audioS + gaps.filter((g) => g.audioAt <= audioS).reduce((n, g) => n + g.seconds, 0)

/** The time in the beat (seconds) at which `spec` (a phrase, or `{ word, nth }`) starts to be spoken; null where there is no narration (a beat that is only replayed silently). */
export const cueAt = (spec) => (cues && narrationS ? sceneAt(cues(spec)) : null)

/**
 * Stops the voice just before `spec` is spoken, for a stretch of actions that take longer than the words allow; `resumeVoice` lets it carry on from that word.
 * The audio is cut there and silence of the length of the actions is put in (see media.mjs), so the words after it come after the actions they describe.
 */
export async function pauseVoice(spec) {
  const t = await holdToCue(spec)
  if (t === null) return
  if (openGap) throw new Error('pauseVoice twice without resumeVoice')
  // The voice stops at the word whether or not the story has got there yet: the gap starts at the word's time.
  openGap = { label: specLabel(spec), audioAt: cues(spec), start: t }
  actions.push({ at: beatMs / 1000, text: `pauseVoice(${JSON.stringify(specLabel(spec))})` })
}

/**
 * The voice carries on from the word `pauseVoice` stopped it at, `lead` seconds from now (default 0.6): the action that follows, a cursor move to a button the word names, uses that time to get there.
 */
export function resumeVoice(lead = 0.6) {
  if (!openGap) return
  const seconds = Math.max(0, beatMs / 1000 + lead - openGap.start)
  gaps.push({ audioAt: openGap.audioAt, start: openGap.start, seconds })
  actions.push({ at: beatMs / 1000, text: `resumeVoice() after ${seconds.toFixed(1)}s` })
  openGap = null
}

/** The beat's current time in seconds. */
export const beatSeconds = () => beatMs / 1000

/** Records that an action happened at `actionS` for the word `spec` spoken at `wordS`; an action more than `CUE_TOLERANCE` after its word is late. */
export function syncMark(spec, wordS, actionS) {
  syncs.push({ word: specLabel(spec), wordS, actionS })
  if (actionS > wordS + CUE_TOLERANCE) late.push({ word: specLabel(spec), byS: actionS - wordS })
}

/** Holds until `spec` is spoken (`lead` seconds before it, for an action that takes that long to reach its point), then notes the sync. No narration, no wait. */
export async function cue(spec, { lead = 0 } = {}) {
  const t = await holdToCue(spec, lead)
  if (t !== null) syncMark(spec, t, beatMs / 1000 + lead)
}

/** Holds until `lead` seconds before `spec` is spoken and returns the time of the word in the beat; null (no wait) where there is no narration. */
export async function holdToCue(spec, lead = 0) {
  const t = cueAt(spec)
  if (t === null) return null
  const want = (t - lead) * 1000
  if (want - beatMs >= STEP / 2) await hold(want - beatMs)
  return t
}

/**
 * Holds until `at` of the narration has played: a fraction (0 to 1) of the audio, or a phrase (`'Approve'`, `{ word: 'Merge', nth: 2 }`) that is waited for by its word.
 * An action that ran past that point is reported as late.
 */
export async function until(at) {
  if (typeof at !== 'number') return cue(at)
  const target = sceneAt(at * narrationS) * 1000
  if (narrationS && beatMs > target + LATE_MS) late.push({ fraction: at, byS: (beatMs - target) / 1000 })
  if (target - beatMs >= STEP / 2) await hold(target - beatMs)
}

/** Milliseconds until `at` (a fraction of the narration, or a phrase) has played, at least `floor`. */
export const msUntil = (at, floor = 1500) => Math.max(floor, (typeof at === 'number' ? sceneAt(at * narrationS) : cueAt(at) ?? 0) * 1000 - beatMs)

export const frameList = () => frames
