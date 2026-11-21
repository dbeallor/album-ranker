import test from 'node:test'
import assert from 'node:assert/strict'
import { clipGantt } from './clip-gantt.mjs'

const row = (id, start, end, cost, extra = {}) => ({ id, depth: 1, name: id, repo: 'r', start, end, tokens: 100, cost, kind: 'task', model: null, harness: null, segments: [[start, end]], ...extra })
const session = (rows, extra = {}) => ({ sessionId: 's', cwd: '/', updatedAt: 0, stale: false, total: 9, pricing: 2, rows, ...extra })

test('rows that have not started are dropped, and a session with none is dropped', () => {
  const s = session([row('a', 10, 20, 1), row('b', 30, 40, 2)])
  assert.deepEqual(clipGantt([s], 5), [])
  assert.deepEqual(clipGantt([s], 25)[0].rows.map((r) => r.id), ['a'])
})

test('a span still going is open, and its row is unpriced until it closes', () => {
  const [s] = clipGantt([session([row('a', 10, 20, 4)])], 15)
  const [r] = s.rows
  assert.deepEqual(r.segments, [[10, null]])
  assert.equal(r.end, null)
  assert.equal(r.cost, 0)
  assert.equal(r.tokens, 0)
  assert.equal(s.updatedAt, 15)
  assert.equal(s.total, 2)
})

test('a closed row keeps its final numbers', () => {
  const [s] = clipGantt([session([row('a', 10, 20, 4)])], 99)
  assert.deepEqual(s.rows[0].segments, [[10, 20]])
  assert.equal(s.rows[0].end, 20)
  assert.equal(s.rows[0].cost, 4)
  assert.equal(s.updatedAt, 20)
  assert.equal(s.total, 4)
})

test('between two spans the row is closed at its last span but still unpriced', () => {
  const r = row('a', 0, 100, 10, { segments: [[0, 10], [50, 100]] })
  const [s] = clipGantt([session([r])], 30)
  assert.deepEqual(s.rows[0].segments, [[0, 10]])
  assert.equal(s.rows[0].end, 10)
  assert.equal(s.rows[0].cost, 0)
  assert.ok(Math.abs(s.total - 10 / 6) < 1e-9)
})

test('a subagent row appears when it starts, under its task', () => {
  const s = session([row('t', 0, 100, 1), row('k', 40, 60, 1, { depth: 2, kind: 'agent' })])
  assert.deepEqual(clipGantt([s], 30)[0].rows.map((r) => r.id), ['t'])
  assert.deepEqual(clipGantt([s], 50)[0].rows.map((r) => r.id), ['t', 'k'])
})
