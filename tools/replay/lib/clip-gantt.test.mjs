import test from 'node:test'
import assert from 'node:assert/strict'
import { clipGantt, isOpenAt } from './clip-gantt.mjs'

const row = (id, start, end, cost, extra = {}) => ({ id, depth: 1, name: id, repo: 'r', start, end, tokens: 100, cost, kind: 'task', model: null, harness: null, segments: [[start, end]], ...extra })
const agent = (id, start, end, cost, extra = {}) => row(id, start, end, cost, { depth: 2, kind: 'agent', ...extra })
const session = (rows, extra = {}) => ({ sessionId: 's', cwd: '/', updatedAt: rows.reduce((m, r) => Math.max(m, r.end ?? 0), 0), stale: false, total: rows.reduce((n, r) => n + (r.cost ?? 0), 0), pricing: 2, rows, ...extra })

test('rows that have not started are dropped, and a session with none is dropped', () => {
  const s = session([row('a', 10, 20, 1), row('b', 30, 40, 2)])
  assert.deepEqual(clipGantt([s], 5), [])
  assert.deepEqual(clipGantt([s], 25)[0].rows.map((r) => r.id), ['a'])
})

test('a subagent still going keeps its span open and its row unpriced until it closes', () => {
  const [s] = clipGantt([session([row('t', 0, 100, 1), agent('a', 10, 20, 4)])], 15)
  const a = s.rows.find((r) => r.id === 'a')
  assert.deepEqual(a.segments, [[10, null]])
  assert.equal(a.end, null)
  assert.equal(a.cost, 0)
  assert.equal(a.tokens, 0)
  assert.equal(s.updatedAt, 15)
  assert.ok(Math.abs(s.total - 2.15) < 1e-9)
})

test('with no subagent working, the dashboard closes the open task at the last write', () => {
  const [s] = clipGantt([session([row('a', 10, 20, 4)])], 15)
  assert.deepEqual(s.rows[0].segments, [[10, 15]])
  assert.equal(s.rows[0].end, 15)
  assert.equal(s.rows[0].cost, 0)
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
  const s = session([row('t', 0, 100, 1), agent('k', 40, 60, 1)])
  assert.deepEqual(clipGantt([s], 30)[0].rows.map((r) => r.id), ['t'])
  assert.deepEqual(clipGantt([s], 50)[0].rows.map((r) => r.id), ['t', 'k'])
})

test('a stopped session keeps its last write: a subagent left running goes stale, a lone task is closed there', () => {
  const stopped = session([row('t', 0, null, 0), agent('k', 10, null, 0)], { updatedAt: 50_000, total: 0 })
  const [s] = clipGantt([stopped], 200_000)
  assert.equal(s.updatedAt, 50_000)
  assert.equal(s.stale, true)
  assert.deepEqual(s.rows.map((r) => r.end), [50_000, 50_000])
  const [lone] = clipGantt([session([row('t', 0, null, 0)], { updatedAt: 50_000, total: 0 })], 200_000)
  assert.equal(lone.stale, false)
  assert.equal(lone.rows[0].end, 50_000)
})

test('the session total counts the cost of rows that never closed, growing to the recorded total', () => {
  const s = session([row('t', 0, 100, 2), agent('k', 20, null, 0)], { updatedAt: 100, total: 5 })
  assert.equal(clipGantt([s], 20)[0].total, 0.4)
  assert.ok(Math.abs(clipGantt([s], 60)[0].total - 2.7) < 1e-9)
  assert.equal(clipGantt([s], 500)[0].total, 5)
})

test('only team sessions carry the thread, heading, ticket and request', () => {
  const extra = { threadId: 't', heading: 'TEAM MODE', ticket: null, request: null }
  const [worktree] = clipGantt([session([row('a', 0, 5, 1)], { cwd: '/w/.t3/worktrees/r/x', ...extra })], 9)
  const [root] = clipGantt([session([row('a', 0, 5, 1)], { cwd: '/r', ...extra })], 9)
  assert.equal('heading' in worktree, false)
  assert.equal(root.heading, 'TEAM MODE')
})

test('a task is open at an instant inside one of its spans', () => {
  const s = session([row('t', 0, 100, 1, { segments: [[0, 10], [50, 100]] })])
  assert.equal(isOpenAt(s, 5), true)
  assert.equal(isOpenAt(s, 30), false)
  assert.equal(isOpenAt(s, 60), true)
})
