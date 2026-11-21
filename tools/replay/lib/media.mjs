// Voiceover timing, and the ffmpeg assembly of frames and audio into the final video.
import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import { FPS } from './recorder.mjs'
import { synthesize } from './voice.mjs'

const seconds = (f) => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString())

/** Speaks `text` and returns the audio file's path and length in seconds. */
export async function speak(text, dir, name, near) {
  const file = await synthesize(text, dir, name, near)
  return { file, seconds: seconds(file) }
}

/**
 * Writes `out` from the captured `frames` (`{ f, seconds }`) and the beats' narration (`{ file, seconds }`, `seconds` being the length of the beat's scene; `file` null for a beat without narration).
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
    const input = b.file ? ['-i', b.file, '-af', `apad=whole_dur=${length}`] : ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono']
    execFileSync('ffmpeg', ['-y', '-v', 'error', ...input, '-t', length, '-ar', '44100', '-ac', '1', wav])
    return `file '${wav}'`
  })
  const audioList = path.join(dir, 'audio.txt')
  fs.writeFileSync(audioList, wavs.join('\n'))
  const audio = path.join(dir, 'audio.m4a')
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', audioList, '-c:a', 'aac', '-b:a', '128k', audio])
  fs.mkdirSync(path.dirname(out), { recursive: true })
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', video, '-i', audio, '-c:v', 'copy', '-c:a', 'copy', out])
  return { video: seconds(video), audio: seconds(audio) }
}
