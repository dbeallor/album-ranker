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

test('voiceFilter puts the delay and each pause into the voice as silence', async () => {
  const { voiceFilter } = await import('./media.mjs')
  assert.deepEqual(voiceFilter({}), ['-af', 'apad'])
  const f = voiceFilter({ delay: 1, gaps: [{ audioAt: 8, seconds: 5 }] })
  assert.equal(f[0], '-filter_complex')
  assert.match(f[1], /aevalsrc=0:d=1\.000/)
  assert.match(f[1], /atrim=start=0\.000:end=8\.000/)
  assert.match(f[1], /aevalsrc=0:d=5\.000/)
  assert.match(f[1], /atrim=start=8\.000,/)
  assert.match(f[1], /concat=n=4/)
})
