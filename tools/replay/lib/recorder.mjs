// Frame capture and timing: a page screenshot becomes a video frame with a duration, and each beat knows how long its narration is.
import fs from 'fs'
import path from 'path'
import { plain } from './narration.mjs'
import { captionChunks } from './captions.mjs'

export const FPS = 12
export const STEP = 1000 / FPS
const WORDS_PER_SECOND = 2.6
const LATE_MS = 700

let page, framesDir, frames, count, beatMs, narrationS, chunks, shown, skipping, elapsedS, actions, late

/** `write` false is for a dry run: nothing is captured, so the frames folder stays as it is. */
export function begin(p, dir, { write = true } = {}) {
  page = p; framesDir = write ? dir : null
  if (write) { fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true }) }
  frames = []; count = 0; elapsedS = 0
  beatMs = 0; narrationS = 0; chunks = []; shown = null; skipping = false; actions = []; late = []
}

/** Seconds a voice takes for `text` (markers included), to plan a beat without synthesizing it. */
export const estimateSeconds = (text) => plain(text).split(/\s+/).filter(Boolean).length / WORDS_PER_SECOND + (text.match(/\{pause(?::long)?\}/g) ?? []).length * 0.5

/**
 * Starts a beat `{ say, caption }` whose narration lasts `seconds`, or an unrecorded one (`seconds` null) that only replays its actions.
 * `plan` also leaves the beat unrecorded but gives it the narration length, so `until` and the scene length are what a render would get.
 */
export function startBeat(beat, seconds, { plan = false } = {}) {
  skipping = seconds === null || plan
  narrationS = seconds ?? 0
  const text = beat.caption ?? (beat.say ? plain(beat.say) : '')
  chunks = text ? captionChunks(text) : []
  beatMs = 0; shown = null; actions = []; late = []
}

/** Ends the beat, padding it to the narration plus a short pause (none for a beat without narration), and returns its length in seconds, the actions that ran (`[{ at, text }]`) and the `until` calls that came late. */
export async function endBeat({ plan = false } = {}) {
  const wantMs = narrationS ? (narrationS + 0.7) * 1000 : 0
  if ((!skipping || plan) && beatMs < wantMs) await hold(wantMs - beatMs)
  const result = { seconds: beatMs / 1000, actions, late }
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
  for (const s of chunks) { acc += s.length; if (!narrationS || beatMs / 1000 / narrationS <= acc / total) { want = s; break } }
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

/** Holds until `fraction` of the beat's narration has played; an action that ran past that point is reported as late. */
export async function until(fraction) {
  const target = fraction * narrationS * 1000
  if (narrationS && beatMs > target + LATE_MS) late.push({ fraction, byS: (beatMs - target) / 1000 })
  if (target - beatMs >= STEP / 2) await hold(target - beatMs)
}

/** Milliseconds until `fraction` of the narration has played, at least `floor`. */
export const msUntil = (fraction, floor = 1500) => Math.max(floor, fraction * narrationS * 1000 - beatMs)

export const frameList = () => frames
