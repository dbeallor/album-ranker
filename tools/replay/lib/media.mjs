// Voiceover timing, and the ffmpeg assembly of frames and audio into the final video.
import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import { FPS } from './recorder.mjs'
import { synthesize, cached } from './voice.mjs'

// One loudness pass over the whole narration (the beats are within 2 dB of each other, the raw voice is about -24 dB mean): speech around -17 LUFS, peaks under -1.5 dB.
const LOUDNESS = 'loudnorm=I=-17:TP=-1.5:LRA=11'

const seconds = (f) => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString())

/** Speaks `text` and returns the audio file's path, its length in seconds and the character alignment (null for `say`). */
export async function speak(text, dir, name, near) {
  const { file, alignment } = await synthesize(text, dir, name, near)
  return { file, alignment, seconds: seconds(file) }
}

/**
 * ffmpeg arguments that place a beat's voice in its scene: `delay` seconds of silence first, and for each pause (`gaps`: `{ audioAt, seconds }`, see `pauseVoice` in recorder.mjs) the audio is cut at `audioAt` and that much silence is put in.
 * Without either the audio is only padded to the scene length by the caller's `-t`.
 */
export function voiceFilter(b) {
  const cuts = [...(b.gaps ?? [])].sort((x, y) => x.audioAt - y.audioAt)
  if (!b.delay && !cuts.length) return ['-af', 'apad']
  const parts = []
  if (b.delay) parts.push(`aevalsrc=0:d=${b.delay.toFixed(3)}:s=44100:c=mono[s0]`)
  const labels = b.delay ? ['[s0]'] : []
  let from = 0
  cuts.forEach((g, k) => {
    parts.push(`[0:a]atrim=start=${from.toFixed(3)}:end=${g.audioAt.toFixed(3)},asetpts=PTS-STARTPTS,aresample=44100,aformat=channel_layouts=mono[v${k}]`)
    parts.push(`aevalsrc=0:d=${g.seconds.toFixed(3)}:s=44100:c=mono[g${k}]`)
    labels.push(`[v${k}]`, `[g${k}]`)
    from = g.audioAt
  })
  parts.push(`[0:a]atrim=start=${from.toFixed(3)},asetpts=PTS-STARTPTS,aresample=44100,aformat=channel_layouts=mono[vend]`)
  labels.push('[vend]')
  parts.push(`${labels.join('')}concat=n=${labels.length}:v=0:a=1,apad[o]`)
  return ['-filter_complex', parts.join(';'), '-map', '[o]']
}

/**
 * Writes `out` from the captured `frames` (`{ f, seconds }`) and the beats' narration (`{ file, seconds, delay, gaps }`, `seconds` being the length of the beat's scene, `delay` the silence before the voice starts, `gaps` the pauses of the voice, see `voiceFilter`; `file` null for a beat without narration).
 * Each beat's audio is padded with silence to its scene length, so narration and picture stay aligned.
 * Frame durations are written to eight decimals: a frame lasts 1/12 s, and rounding it to four would shorten a long video by seconds' worth of frames.
 */
export function assemble(frames, beats, dir, out) {
  const total = frames.reduce((n, f) => n + f.seconds, 0)
  const list = path.join(dir, 'frames.txt')
  fs.writeFileSync(list, frames.map((f) => `file '${f.f}'\nduration ${f.seconds.toFixed(8)}`).join('\n') + `\nfile '${frames.at(-1).f}'\n`)
  const video = path.join(dir, 'video.mp4')
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-vf', `fps=${FPS},format=yuv420p`, '-frames:v', String(Math.round(total * FPS)), '-c:v', 'libx264', '-crf', '21', '-preset', 'fast', video])
  const wavs = beats.map((b, i) => {
    const wav = path.join(dir, `beat${i}.wav`)
    const length = b.seconds.toFixed(3)
    const input = b.file ? ['-i', b.file, ...voiceFilter(b)] : ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono']
    execFileSync('ffmpeg', ['-y', '-v', 'error', ...input, '-t', length, '-ar', '44100', '-ac', '1', wav])
    return `file '${wav}'`
  })
  const audioList = path.join(dir, 'audio.txt')
  fs.writeFileSync(audioList, wavs.join('\n'))
  const audio = path.join(dir, 'audio.m4a')
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', audioList, '-af', LOUDNESS, '-ar', '44100', '-c:a', 'aac', '-b:a', '128k', audio])
  fs.mkdirSync(path.dirname(out), { recursive: true })
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', video, '-i', audio, '-c:v', 'copy', '-c:a', 'copy', out])
  return { video: seconds(video), audio: seconds(audio) }
}

/** The cached ElevenLabs narration of `text` as `{ file, alignment, seconds }` (no network), or null: a dry run plans with the real timing where it has it. */
export function peek(text, near) {
  const hit = cached(text, near)
  return hit && { ...hit, seconds: seconds(hit.file) }
}
