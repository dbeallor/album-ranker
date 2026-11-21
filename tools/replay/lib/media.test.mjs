import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import { assemble } from './media.mjs'
import { FPS } from './recorder.mjs'

test('a long video of one-frame steps is as long as its audio', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-'))
  const jpg = path.join(dir, 'f.jpg')
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=64x64', '-frames:v', '1', jpg])
  const frames = Array.from({ length: 6000 }, () => ({ f: jpg, seconds: 1 / FPS }))
  const total = frames.reduce((n, f) => n + f.seconds, 0)
  const len = assemble(frames, [{ file: null, seconds: 200 }, { file: null, seconds: total - 200 }], dir, path.join(dir, 'out.mp4'))
  assert.ok(Math.abs(len.video - total) < 0.05, `video ${len.video}s, expected ${total}s`)
  assert.ok(Math.abs(len.audio - total) < 0.05, `audio ${len.audio}s, expected ${total}s`)
  fs.rmSync(dir, { recursive: true, force: true })
})
