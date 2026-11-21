// Frame capture and timing: a page screenshot becomes a video frame with a duration, and each beat knows how long its narration is.
import fs from 'fs'
import path from 'path'
import { plain } from './narration.mjs'

export const FPS = 12
export const STEP = 1000 / FPS

let page, framesDir, frames, count, beatMs, narrationS, sentences, shown, skipping, elapsedS

export function begin(p, dir) {
  page = p; framesDir = dir
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true })
  frames = []; count = 0; elapsedS = 0
  beatMs = 0; narrationS = 0; sentences = []; shown = null; skipping = false
}

/** Starts a beat of `seconds` of narration whose text is `text`, or an unrecorded one (`seconds` null) that only replays its actions. */
export function startBeat(text, seconds) {
  skipping = seconds === null
  narrationS = seconds ?? 0
  const spoken = plain(text)
  sentences = spoken.match(/.+?[.!?](?=\s|$)/g)?.map((s) => s.trim()) ?? [spoken]
  beatMs = 0; shown = null
}

/** Ends the beat, padding it to the narration plus a short pause, and returns its length in seconds. */
export async function endBeat() {
  const wantMs = (narrationS + 0.7) * 1000
  if (!skipping && beatMs < wantMs) await hold(wantMs - beatMs)
  const seconds = beatMs / 1000
  skipping = false
  return seconds
}

export const recording = () => !skipping
export const totalSeconds = () => elapsedS

async function captionAt() {
  if (!narrationS) return
  const total = sentences.reduce((a, s) => a + s.length, 0)
  let acc = 0, want = sentences.at(-1)
  for (const s of sentences) { acc += s.length; if (beatMs / 1000 / narrationS <= acc / total) { want = s; break } }
  if (want !== shown) { await page.evaluate((t) => S.caption(t), want); shown = want }
}

/** Shows the stage as it is now for `ms`. */
export async function hold(wantMs) {
  const ms = Math.max(1, Math.round(wantMs / STEP)) * STEP
  if (skipping) { beatMs += ms; return }
  await captionAt()
  const f = path.join(framesDir, `f${String(count++).padStart(5, '0')}.jpg`)
  await page.screenshot({ path: f, type: 'jpeg', quality: 82 })
  frames.push({ f, seconds: ms / 1000 })
  beatMs += ms; elapsedS += ms / 1000
}

/** Runs `step(p)` for p from 0 to 1 over `ms`, a frame per step; an unrecorded beat takes only the last step. */
export async function anim(ms, step, stepMs = STEP) {
  const k = skipping ? 1 : Math.max(1, Math.round(ms / stepMs))
  for (let i = 1; i <= k; i++) { await step(i / k); await hold(skipping ? ms : stepMs) }
}

/** Holds until `fraction` of the beat's narration has played. */
export const until = (fraction) => hold(Math.max(0, fraction * narrationS * 1000 - beatMs))

/** Milliseconds until `fraction` of the narration has played, at least `floor`. */
export const msUntil = (fraction, floor = 1500) => Math.max(floor, fraction * narrationS * 1000 - beatMs)

export const frameList = () => frames
