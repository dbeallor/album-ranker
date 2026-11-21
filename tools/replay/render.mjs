// node render.mjs story/2026-11-20.mjs
// Replays a story (narration beats and stage actions) as a screen recording with voiceover.
// BEATS=3,7 or BEATS=3-7 renders only those beats (the others replay silently so the state carries over); FINAL=<path> sets the output file.
// --dry (or DRY=1) runs the story without screenshots or audio and prints each beat's planned length and actions.
import fs from 'fs'
import path from 'path'
import { launch, close } from './lib/director.mjs'
import { startBeat, endBeat, totalSeconds, estimateSeconds, frameList } from './lib/recorder.mjs'
import { speak, assemble } from './lib/media.mjs'
import { charsSynthesized, resolveProvider } from './lib/voice.mjs'
import { beatRange } from './lib/beat-range.mjs'

const ROOT = path.dirname(new URL(import.meta.url).pathname)
const OUT = path.join(ROOT, 'out')
const AUDIO = path.join(OUT, 'audio')
const storyPath = process.argv[2]
if (!storyPath) throw new Error('usage: node render.mjs story/<name>.mjs [--dry]')
const dry = process.argv.includes('--dry') || process.env.DRY === '1'
const { meta, beats } = await import(path.resolve(storyPath))
const only = beatRange(process.env.BEATS, beats.length)
const shown = (i) => !only || only.has(i)

const stamp = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

function report(i, voiceS, scene, estimated) {
  console.log(`beat ${i}: narration ${estimated ? '~' : ''}${voiceS.toFixed(1)}s, scene ${scene.seconds.toFixed(1)}s${dry ? '' : `, video so far ${totalSeconds().toFixed(0)}s`}`)
  for (const l of scene.late) console.log(`  late: until(${l.fraction}) came ${l.byS.toFixed(1)}s after its point in the narration`)
  if (dry) for (const a of scene.actions) console.log(`  +${a.at.toFixed(1)}s ${a.text}`)
}

if (!dry) { fs.rmSync(AUDIO, { recursive: true, force: true }); fs.mkdirSync(AUDIO, { recursive: true }) }
await launch(meta, path.join(OUT, 'frames'), { dry })

const narrated = []
let planned = 0
for (const [i, beat] of beats.entries()) {
  if (!shown(i)) { startBeat(beat, null); await beat.run(); await endBeat(); continue }
  if (dry) {
    const voiceS = beat.say ? estimateSeconds(beat.say) : 0
    startBeat(beat, voiceS, { plan: true })
    await beat.run()
    const scene = await endBeat({ plan: true })
    planned += scene.seconds
    report(i, voiceS, scene, true)
    continue
  }
  const voice = beat.say ? await speak(beat.say, AUDIO, `beat${i}`, { previous: beats[i - 1]?.say, next: beats[i + 1]?.say }) : { file: null, seconds: 0 }
  startBeat(beat, voice.seconds)
  await beat.run()
  const scene = await endBeat()
  narrated.push({ file: voice.file, seconds: scene.seconds })
  report(i, voice.seconds, scene)
}
await close()

if (dry) {
  console.log(`dry run: ${stamp(planned)} of video planned, nothing rendered`)
} else {
  const final = process.env.FINAL || path.join(OUT, 'replay.mp4')
  const len = assemble(frameList(), narrated, OUT, final)
  const billed = resolveProvider().name === 'elevenlabs' ? `, ${charsSynthesized()} ElevenLabs characters synthesized` : ''
  console.log(`done ${final}: video ${len.video.toFixed(1)}s, audio ${len.audio.toFixed(1)}s${billed}`)
}
