import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import { activeIntervals, elapsedAt, totalActive, mergeIntervals } from './active-time.mjs'
import { loadActiveFixtures } from './fixtures.mjs'

const MIN = 60000
const T0 = Date.parse('2026-11-21T10:00:00Z')
const at = (min) => T0 + min * MIN

/** A timeline with the given commands (minutes) and one gantt session `s1` with segments (minutes, `null` end = open). */
function build({ commands = [0], segments = [], end = 600, extra = {}, sessions = ['s1'], idleGapMs } = {}) {
  const timeline = {
    sessions: sessions.map((id) => ({ id })),
    commands: commands.map((m) => ({ t: new Date(at(m)).toISOString() })),
    snapshot: { takenAt: new Date(at(end)).toISOString() },
    ...(idleGapMs ? { activeTime: { idleGapMs } } : {}),
  }
  const rows = [{ segments: segments.map(([a, b]) => [at(a), b === null ? null : at(b)]) }]
  const fixtures = { sessions: { s1: { sessionId: 's1', rows }, ...extra } }
  return activeIntervals(timeline, fixtures)
}
const mins = (iv) => iv.map(([a, b]) => [(a - T0) / MIN, (b - T0) / MIN])

test('a gap at the threshold is bridged, over it is idle', () => {
  assert.deepEqual(mins(build({ segments: [[0, 10], [15, 20]] })), [[0, 20]])
  assert.deepEqual(mins(build({ segments: [[0, 10], [14, 20]] })), [[0, 20]])
  assert.deepEqual(mins(build({ segments: [[0, 10], [15.01, 20]] })), [[0, 10], [15.01, 20]])
})

test('the idle threshold can be set on the timeline', () => {
  assert.deepEqual(mins(build({ segments: [[0, 10], [20, 30]], idleGapMs: 10 * MIN })), [[0, 30]])
  assert.deepEqual(mins(build({ segments: [[0, 10], [20, 30]] })), [[0, 10], [20, 30]])
})

test('overlapping segments count once', () => {
  const iv = build({ segments: [[0, 10], [5, 12], [30, 40], [31, 32]] })
  assert.deepEqual(mins(iv), [[0, 12], [30, 40]])
  assert.equal(totalActive(iv), 22 * MIN)
})

test('a command bridges a short gap but one alone adds no time', () => {
  assert.deepEqual(mins(build({ commands: [0, 13], segments: [[0, 10], [16, 20]] })), [[0, 20]])
  const lone = build({ commands: [0, 100], segments: [[0, 10]] })
  assert.deepEqual(mins(lone).map(([a]) => a), [0])
  assert.ok(Math.abs(totalActive(lone) - 10 * MIN) < 5)
})

test('only the build sessions count', () => {
  const other = { sessionId: 'other', rows: [{ segments: [[at(100), at(160)]] }] }
  assert.deepEqual(mins(build({ segments: [[0, 10]], extra: { other } })), [[0, 10]])
  assert.deepEqual(mins(build({ segments: [[0, 10]], extra: { other }, sessions: ['s1', 'other'] })), [[0, 10], [100, 160]])
})

test('children rows and an open segment count; everything is clipped to first command and snapshot', () => {
  const timeline = { sessions: [{ id: 's1' }], commands: [{ t: new Date(at(5)).toISOString() }], snapshot: { takenAt: new Date(at(30)).toISOString() } }
  const rows = [{ segments: [[at(0), at(8)]], children: [{ segments: [[at(20), null]] }] }]
  assert.deepEqual(mins(activeIntervals(timeline, { sessions: { s1: { sessionId: 's1', rows } } })), [[5, 8], [20, 30]])
})

test('history sessions are counted too', () => {
  const timeline = { sessions: [{ id: 'h1' }], commands: [{ t: new Date(at(0)).toISOString() }], snapshot: { takenAt: new Date(at(60)).toISOString() } }
  const history = { sessions: { h1: { ticket: 'X-1', session: { sessionId: 'h1', rows: [{ segments: [[at(2), at(9)]] }] } } } }
  assert.deepEqual(mins(activeIntervals(timeline, { sessions: {}, history })), [[0, 9]])
})

test('elapsedAt inside, between and after intervals', () => {
  const iv = [[at(0), at(10)], [at(60), at(70)]]
  assert.equal(elapsedAt(iv, at(-5)), 0)
  assert.equal(elapsedAt(iv, at(4)), 4 * MIN)
  assert.equal(elapsedAt(iv, at(10)), 10 * MIN)
  assert.equal(elapsedAt(iv, at(30)), 10 * MIN)
  assert.equal(elapsedAt(iv, at(65)), 15 * MIN)
  assert.equal(elapsedAt(iv, at(500)), 20 * MIN)
})

test('mergeIntervals merges touching and drops empty ones', () => {
  assert.deepEqual(mergeIntervals([[5, 8], [0, 5], [20, 20], [30, 31]]), [[0, 8], [30, 31]])
})

// The whole-session video: pins what the gantt data gives, not the dashboard's code.
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..')
test('2026-11-21: three active stretches, 1:39:05 in all, unrelated sessions left out', () => {
  const timeline = JSON.parse(fs.readFileSync(path.join(ROOT, 'timeline/2026-11-21.json'), 'utf8'))
  const fx = loadActiveFixtures(path.join(ROOT, 'fixtures/2026-11-21'))
  const iv = activeIntervals(timeline, fx)
  const utc = (iv) => iv.map(([a, b]) => [new Date(a).toISOString().slice(0, 19) + 'Z', new Date(b).toISOString().slice(0, 19) + 'Z'])
  assert.deepEqual(utc(iv), [
    ['2026-11-20T23:01:19Z', '2026-11-20T23:27:20Z'],
    ['2026-11-20T23:43:21Z', '2026-11-20T23:57:21Z'],
    ['2026-11-21T05:06:17Z', '2026-11-21T06:05:21Z'],
  ])
  assert.equal(Math.floor(totalActive(iv) / 1000), 99 * 60 + 5)
  assert.equal(Math.floor(elapsedAt(iv, Date.parse('2026-11-21T05:06:17Z')) / 1000), 40 * 60 + 1)
  assert.equal(elapsedAt(iv, Date.parse('2026-11-21T05:06:00Z')), elapsedAt(iv, iv[1][1]))
  // the video-making thread and the screen-recordings thread are in the gantt folder but not in the build
  const ids = new Set(timeline.sessions.map((s) => s.id))
  assert.ok(Object.keys(fx.sessions).some((id) => id.startsWith('cd463419') && !ids.has(id)))
  assert.ok(Object.keys(fx.sessions).some((id) => id.startsWith('b2c1ae40') && !ids.has(id)))
  const withThem = activeIntervals({ ...timeline, sessions: [...timeline.sessions, ...Object.keys(fx.sessions).map((id) => ({ id }))] }, fx)
  assert.ok(totalActive(withThem) > totalActive(iv))
})
