import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import { loadFixtures } from './fixtures.mjs'
import { stateAt } from './state-at.mjs'
import { locate } from './buttons.mjs'

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..')
const FX = path.join(ROOT, 'fixtures/2026-11-21')
const timeline = JSON.parse(fs.readFileSync(path.join(ROOT, 'timeline/2026-11-21.json'), 'utf8'))
const fixtures = await loadFixtures(FX)
const thread = JSON.parse(fs.readFileSync(path.join(FX, 'thread.json'), 'utf8'))
const ms = Date.parse
const state = (t) => stateAt(typeof t === 'number' ? t : ms(t), timeline, fixtures)
const count = (api, name) => api.status.find((g) => g.name === name)?.count ?? 0

/** Instants across the two working windows of the session, every `step` seconds. */
function* instants(step) {
  for (const [from, to] of [['2026-11-20T23:01:00Z', '2026-11-20T23:59:00Z'], ['2026-11-21T05:04:00Z', timeline.snapshot.takenAt]]) for (let t = ms(from); t <= ms(to); t += step * 1000) yield t
}

test('every event names a known ticket, and they come in time order', () => {
  const times = timeline.events.map((e) => ms(e.t))
  assert.deepEqual(times, [...times].sort((a, b) => a - b))
  for (const e of timeline.events) for (const id of e.tickets) assert.ok(timeline.tickets[id], `${id} at ${e.t}`)
})

test('every spec and PR an event names is recorded, with a fixture to show', () => {
  for (const e of timeline.events) {
    if (e.set.specSha) assert.ok(timeline.specs.some((s) => s.fullSha === e.set.specSha), e.set.specSha)
    if (e.set.specSha) assert.ok(fixtures.specs[e.set.specSha.slice(0, 7)], `spec ${e.set.specSha}`)
    if (e.set.pr) assert.ok(timeline.prs.some((p) => p.number === e.set.pr && p.ticket === e.tickets[0]))
    if (e.set.mergedAt) assert.equal(e.set.mergedAt, timeline.prs.find((p) => p.ticket === e.tickets[0] && p.mergedAt).mergedAt)
  }
  for (const s of timeline.specs) assert.ok(fs.existsSync(path.join(FX, `spec-${s.ticket}-${s.sha}.md`)), s.sha)
})

test('the board never exceeds the slot limits, never repeats a ticket and keeps queues in approval order', () => {
  const { limits } = timeline
  for (const t of instants(7)) {
    const api = state(t)
    const when = new Date(t).toISOString()
    const [spec, build, merge] = ['Speccing', 'Building', 'Merging'].map((g) => count(api, g))
    assert.ok(spec <= limits.spec, `${spec} specs at ${when}`)
    assert.ok(build <= limits.build, `${build} builds at ${when}`)
    assert.ok(merge <= limits.merge, `${merge} merges at ${when}`)
    assert.ok(spec + build + merge <= limits.total, `${spec + build + merge} active at ${when}`)
    const seen = [...api.status.filter((g) => g.name !== 'Writing tickets').flatMap((g) => g.rows.map((r) => r.id)), ...api.merged.map((e) => e.id)]
    assert.deepEqual(seen, [...new Set(seen)], `a ticket twice at ${when}`)
    const queue = api.status.find((g) => g.name === 'Queued to build')?.rows.map((r) => Date.parse(r.stageAt)) ?? []
    assert.deepEqual(queue, [...queue].sort((a, b) => a - b), `queue order at ${when}`)
  }
})

test('every real user message is a command, once and in order', () => {
  const typed = thread.filter((m) => m.role === 'user' && !m.sender)
  assert.deepEqual(timeline.commands.map((c) => c.text), typed.map((m) => m.text.trim()))
  assert.deepEqual(timeline.commands.map((c) => c.t), typed.map((m) => new Date(Math.floor(ms(m.at) / 1000) * 1000).toISOString().replace('.000Z', 'Z')))
})

test('a command uses the dashboard control exactly when that control exists at that instant', () => {
  for (const c of timeline.commands) {
    const found = c.ticket && locate(state(c.t), c.ticket)
    const kind = /^approve \d+$/.test(c.text) ? 'approve' : /^changes \d+:/.test(c.text) ? 'changes' : /^mark \d+ todo$/.test(c.text) ? 'todo' : null
    if (!kind) {
      assert.equal(c.control, 'typed', c.text)
      assert.ok(c.why, c.text)
      continue
    }
    assert.equal(c.control === kind, Boolean(found?.controls.includes(kind)), `${c.t} ${c.text}`)
    if (c.control === 'typed') assert.ok(c.why, c.text)
    else assert.deepEqual([c.tab, c.group], [found.tab, found.group])
  }
})

test('an approval records the spec or PR it approves, as the card shows it', () => {
  const approvals = timeline.commands.filter((c) => c.control === 'approve')
  assert.equal(approvals.length, 15)
  for (const c of approvals) {
    const row = state(c.t).status.flatMap((g) => g.rows).find((r) => r.id === c.ticket)
    if (c.artifact.kind === 'spec') assert.equal(row.specUrl, c.artifact.url)
    else assert.equal(row.prUrl, c.artifact.url)
    assert.equal(c.artifact.kind, row.stage === 'awaiting-build' ? 'spec' : 'pr')
  }
  const sevenMerge = timeline.commands.find((c) => c.t === '2026-11-21T05:55:04Z')
  assert.deepEqual([sevenMerge.control, sevenMerge.artifact.number], ['approve', 21])
})

test('ALBUM-14 was typed twice, once the chief had put it back in the Backlog', () => {
  const typed = timeline.commands.filter((c) => c.ticket === 'ALBUM-14')
  assert.deepEqual(typed.map((c) => c.control), ['typed', 'typed'])
  assert.match(typed[0].why, /Backlog/)
})

test('a Changes command carries the text typed after the prefilled prefix', () => {
  const changes = timeline.commands.find((c) => c.control === 'changes')
  assert.equal(changes.typedAfterPrefill, 'ditch multiple algorithm support\n\ngo with head to head elo algorithm')
  assert.equal(changes.artifact.sha, '5c249ca')
})
