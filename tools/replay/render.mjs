// node render.mjs story/2026-11-20.mjs
// Replays a story (narration beats and stage actions) as a screen recording with voiceover.
// BEATS=3,7 renders only those beats (the others replay silently so the state carries over); FINAL=<path> sets the output file.
import fs from 'fs'
import path from 'path'
import { launch, close } from './lib/director.mjs'
import { startBeat, endBeat, totalSeconds } from './lib/recorder.mjs'
import { speak, assemble } from './lib/media.mjs'

const ROOT = path.dirname(new URL(import.meta.url).pathname)
const OUT = path.join(ROOT, 'out')
const AUDIO = path.join(OUT, 'audio')
const storyPath = process.argv[2]
if (!storyPath) throw new Error('usage: node render.mjs story/<name>.mjs')
const { meta, beats } = await import(path.resolve(storyPath))
const only = process.env.BEATS ? process.env.BEATS.split(',').map(Number) : null

fs.rmSync(AUDIO, { recursive: true, force: true }); fs.mkdirSync(AUDIO, { recursive: true })
await launch(meta, path.join(OUT, 'frames'))

const narrated = []
for (const [i, beat] of beats.entries()) {
  if (only && !only.includes(i)) { startBeat(beat.say, null); await beat.run(); await endBeat(); continue }
  const voice = speak(beat.say, AUDIO, `beat${i}`)
  startBeat(beat.say, voice.seconds)
  await beat.run()
  const scene = await endBeat()
  narrated.push({ file: voice.file, seconds: scene })
  console.log(`beat ${i}: narration ${voice.seconds.toFixed(1)}s, scene ${scene.toFixed(1)}s, video so far ${totalSeconds().toFixed(0)}s`)
}
await close()

const final = process.env.FINAL || path.join(OUT, 'replay.mp4')
const len = assemble(narrated, OUT, final)
console.log(`done ${final}: video ${len.video.toFixed(1)}s, audio ${len.audio.toFixed(1)}s`)
