import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import { loadFixtures } from './fixtures.mjs'
import { stateAt } from './state-at.mjs'
import { buttonSelector, commandFor } from './buttons.mjs'
import { injectShim } from './dash.mjs'

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..')
const timeline = JSON.parse(fs.readFileSync(path.join(ROOT, 'timeline/2026-11-20.json'), 'utf8'))
const fixtures = await loadFixtures(path.join(ROOT, 'fixtures/2026-11-20'))
const at = (iso) => stateAt(Date.parse(`2026-11-20T${iso}Z`), timeline, fixtures)
const group = (api, name) => api.status.find((g) => g.name === name)
const ids = (g) => g?.rows.map((r) => r.id)
const names = (api) => api.status.map((g) => g.name)

test('before anything exists the dashboard is empty', () => {
  const api = at('23:03:52')
  assert.deepEqual(api.status, [])
  assert.deepEqual(api.merged, [])
})

test('while the first ticket helper runs, Writing tickets shows it and the Backlog is empty', () => {
  const api = at('23:08:30')
  assert.deepEqual(names(api), ['Writing tickets'])
  const [row] = group(api, 'Writing tickets').rows
  assert.equal(row.helper, true)
  assert.equal(row.gantt[0].rows[0].end, null)
  assert.equal(row.gantt[0].rows[0].name, 'Ticket helper')
})

test('tickets 2 to 10 appear together when the helper finishes, newest first', () => {
  const api = at('23:10:40')
  assert.deepEqual(names(api), ['Backlog'])
  assert.deepEqual(ids(group(api, 'Backlog')), ['ALBUM-10', 'ALBUM-9', 'ALBUM-8', 'ALBUM-7', 'ALBUM-6', 'ALBUM-5', 'ALBUM-4', 'ALBUM-3', 'ALBUM-2'])
})

test('the epic joins the Backlog when its helper finishes, and ALBUM-2 waits in Todo once marked', () => {
  assert.equal(group(at('23:13:45'), 'Backlog').count, 10)
  const api = at('23:15:00')
  assert.deepEqual(ids(group(api, 'Waiting to spec')), ['ALBUM-2'])
  assert.equal(group(api, 'Backlog').count, 9)
})

test('speccing: stage, no risk yet, no spec link, the spec child gantt is running', () => {
  const [row] = group(at('23:15:30'), 'Speccing').rows
  assert.equal(row.stage, 'spec')
  assert.equal(row.risk, 'not rated yet')
  assert.equal(row.specUrl, undefined)
  assert.equal(row.gantt.length, 2)
  assert.equal(row.gantt[1].rows[0].end, null)
})

test('spec ready: Awaiting build approval with the first spec, its link and a finished gantt', () => {
  const api = at('23:20:45')
  const [row] = group(api, 'Awaiting build approval').rows
  assert.match(row.next, /^awaiting-build since 2026-11-20 11:20 pm UTC: spec 5c249ca$/)
  assert.match(row.specUrl, /\/blob\/5c249ca[0-9a-f]{33}\/docs\/superpowers\/specs\//)
  assert.equal(row.risk, 'High (touches data, and one call needs your decision).')
  assert.equal(row.detail.kind, 'spec')
  assert.equal(row.prUrl, undefined)
  assert.ok(row.gantt.every((s) => s.rows.every((r) => r.end !== null)))
})

test('the revised spec has its own sha, risk and sections', () => {
  const [row] = group(at('23:27:10'), 'Awaiting build approval').rows
  assert.match(row.specUrl, /\/blob\/3091b45/)
  assert.equal(row.risk, 'High (touches data, new ratings model).')
  assert.notDeepEqual(row.detail.sections, at('23:20:45').status[0].rows[0].detail.sections)
})

test('building at 23:47:07 matches the dashboard: six agents, two review subagents, ticket 14 in the Backlog', () => {
  const api = at('23:47:07')
  const [row] = group(api, 'Building').rows
  const rows = row.gantt.flatMap((s) => s.rows)
  assert.equal(rows.length, 6)
  assert.match(row.prUrl, /pull\/13$/)
  assert.equal(group(api, 'Backlog').count, 10)
  assert.equal(group(api, 'Backlog').rows[0].id, 'ALBUM-14')
  assert.equal(rows.find((r) => r.name === 'Code review PR 13 pass 2').end, null)
  assert.equal(rows.find((r) => r.name === 'Code review PR 13').cost > 0.3, true)
})

test('before the follow-up helper finishes, ALBUM-14 and the retitle are not there', () => {
  const api = at('23:44:30')
  assert.equal(group(api, 'Backlog').rows.some((r) => r.id === 'ALBUM-14'), false)
  assert.equal(group(api, 'Backlog').rows.find((r) => r.id === 'ALBUM-7').title, 'Build the configurable scoring engine')
  assert.deepEqual(names(api), ['Building', 'Writing tickets', 'Backlog'])
})

test('awaiting merge: PR changes with both review verdicts', () => {
  const [row] = group(at('23:51:05'), 'Awaiting merge approval').rows
  assert.equal(row.risk, 'Low (docs only, 1 file).')
  assert.deepEqual(row.detail.reviews.map((r) => r.verdict), ['PASS', 'PASS'])
  assert.match(row.prUrl, /pull\/13$/)
})

test('merged: Done holds ALBUM-2 and the board is empty of it', () => {
  const api = at('23:54:30')
  assert.deepEqual(api.merged.map((e) => e.id), ['ALBUM-2'])
  assert.equal(api.merged[0].spend.cost.toFixed(2), '4.59')
  assert.equal(group(api, 'Awaiting merge approval'), undefined)
  assert.equal(group(api, 'Merging'), undefined)
})

test('ALBUM-3 leaves the Backlog when started, ALBUM-11 when marked done', () => {
  const api = at('23:56:00')
  const backlog = ids(group(api, 'Backlog'))
  assert.equal(backlog.includes('ALBUM-3'), false)
  assert.equal(backlog.includes('ALBUM-11'), false)
  assert.equal(backlog.length, 8)
  assert.equal(group(api, 'Speccing').rows[0].id, 'ALBUM-3')
  assert.deepEqual(names(api), ['Speccing', 'Writing tickets', 'Backlog'])
})

test('ALBUM-3 spec ready joins the earlier helper in its gantt and keeps its recorded spec', () => {
  const [row] = group(at('23:57:25'), 'Awaiting build approval').rows
  assert.equal(row.gantt.length, 2)
  assert.match(row.next, /spec 111a741$/)
  assert.ok(row.detail.sections.length > 0)
})

test('the chief gantt grows with time and is running only while a turn is open', () => {
  assert.equal(at('23:03:30').chief.state, 'running')
  assert.equal(at('23:06:00').chief.state, 'idle')
  assert.ok(at('23:57:25').chief.gantt[0].rows.length > at('23:20:45').chief.gantt[0].rows.length)
})

test('button selectors and chief-thread commands', () => {
  assert.equal(commandFor('approve', 'ALBUM-2'), 'approve 2')
  assert.equal(commandFor('changes', 'ALBUM-2'), 'changes 2: ')
  assert.equal(commandFor('todo', 'ALBUM-3'), 'mark 3 todo')
  assert.equal(buttonSelector('approve', 'ALBUM-2'), 'a.approve[data-return="approve 2"]')
  assert.equal(buttonSelector('agents', 'ALBUM-2', 'merged'), 'button.seg[data-merged="ALBUM-2"][data-view="agents"]')
})

test('the clock and link shim go in ahead of the page scripts', () => {
  assert.match(injectShim('<head><title>x</title>'), /^<head><script>.*window\.__clock/s)
  assert.throws(() => injectShim('<html>'))
})
