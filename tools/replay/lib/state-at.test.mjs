import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { loadFixtures } from './fixtures.mjs'
import { stateAt } from './state-at.mjs'

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..')
const { summaryLine } = await import(path.join(os.homedir(), '.collective-wisdom/scripts/dashboard/page/app.js'))
const load = async (date) => ({ timeline: JSON.parse(fs.readFileSync(path.join(ROOT, `timeline/${date}.json`), 'utf8')), fixtures: await loadFixtures(path.join(ROOT, `fixtures/${date}`)) })
const whole = await load('2026-11-21')
const first = await load('2026-11-20')
const at = (iso, { timeline, fixtures } = whole) => stateAt(Date.parse(iso.length <= 8 ? `2026-11-20T${iso}Z` : iso), timeline, fixtures)
const day2 = (iso) => at(`2026-11-21T${iso}Z`)
const group = (api, name) => api.status.find((g) => g.name === name)
const ids = (g) => g?.rows.map((r) => r.id)
const names = (api) => api.status.map((g) => g.name)
const row = (api, id) => api.status.flatMap((g) => g.rows).find((r) => r.id === id)

test('before anything exists the dashboard is empty', () => {
  const api = at('23:03:52')
  assert.deepEqual(api.status, [])
  assert.deepEqual(api.merged, [])
  assert.equal(api.chief.state, 'running')
})

test('while the first ticket helper runs, Writing tickets shows it and the Backlog is empty', () => {
  const api = at('23:08:30')
  assert.deepEqual(names(api), ['Writing tickets'])
  const [r] = group(api, 'Writing tickets').rows
  assert.equal(r.helper, true)
  assert.equal(r.gantt[0].rows[0].end, Date.parse('2026-11-20T23:08:30Z'))
  assert.equal(r.gantt[0].rows[0].name, 'Ticket helper')
})

test('tickets 2 to 10 appear together when the helper finishes, newest first', () => {
  const api = at('23:10:40')
  assert.deepEqual(names(api), ['Backlog'])
  assert.deepEqual(ids(group(api, 'Backlog')), ['ALBUM-10', 'ALBUM-9', 'ALBUM-8', 'ALBUM-7', 'ALBUM-6', 'ALBUM-5', 'ALBUM-4', 'ALBUM-3', 'ALBUM-2'])
})

test('the epic joins the Backlog when its helper finishes and stays there, agent-skip or not; ALBUM-2 waits in Todo once marked', () => {
  assert.equal(group(at('23:13:45'), 'Backlog').count, 10)
  const api = at('23:15:00')
  assert.deepEqual(ids(group(api, 'Waiting to spec')), ['ALBUM-2'])
  assert.equal(group(api, 'Backlog').count, 9)
  for (const t of ['23:56:00', '2026-11-21T05:30:00Z', '2026-11-21T06:05:00Z']) assert.ok(ids(group(at(t), 'Backlog')).includes('ALBUM-11'), t)
})

test('a helper that edited a ticket joins its row in the Backlog and Todo once it finishes', () => {
  assert.equal(row(day2('05:06:20'), 'ALBUM-11').gantt.length, 1)
  assert.equal(row(day2('05:06:20'), 'ALBUM-14').gantt, undefined)
  assert.equal(row(day2('05:44:30'), 'ALBUM-14').gantt, undefined)
  assert.equal(row(day2('05:57:10'), 'ALBUM-14').gantt.length, 3)
})

test('speccing: stage, no risk yet, no spec link, the spec child gantt is running', () => {
  const [r] = group(at('23:15:30'), 'Speccing').rows
  assert.equal(r.stage, 'spec')
  assert.equal(r.risk, 'not rated yet')
  assert.equal(r.specUrl, undefined)
  assert.equal(r.gantt.length, 2)
  assert.equal(r.gantt[1].rows[0].end, Date.parse('2026-11-20T23:15:30Z'))
})

test('spec ready: Awaiting build approval with the first spec, its link and a finished gantt', () => {
  const api = at('23:20:45')
  const [r] = group(api, 'Awaiting build approval').rows
  assert.match(r.next, /^awaiting-build since 2026-11-20 11:20 pm UTC: spec 5c249ca$/)
  assert.match(r.specUrl, /\/blob\/5c249ca[0-9a-f]{33}\/docs\/superpowers\/specs\//)
  assert.equal(r.risk, 'High (touches data, and one call needs your decision).')
  assert.equal(r.detail.kind, 'spec')
  assert.equal(r.prUrl, undefined)
  assert.ok(r.gantt.every((s) => s.rows.every((x) => x.end !== null)))
})

test('the revised spec has its own sha, risk and sections', () => {
  const [r] = group(at('23:27:10'), 'Awaiting build approval').rows
  assert.match(r.specUrl, /\/blob\/3091b45/)
  assert.equal(r.risk, 'High (touches data, new ratings model).')
  assert.notDeepEqual(r.detail.sections, at('23:20:45').status[0].rows[0].detail.sections)
})

for (const [date, name] of [['2026-11-20', 'first-hour'], ['2026-11-21', 'whole-session']]) {
  test(`the dashboard at 23:47:07 shows ALBUM-2 building: 6 agents, 13m 31s, $2.67 (${name} timeline)`, async () => {
    const api = at('23:47:07', date === '2026-11-20' ? first : whole)
    const r = row(api, 'ALBUM-2')
    assert.equal(r.stage, 'build')
    assert.equal(r.gantt.flatMap((s) => s.rows).length, 6)
    assert.match(r.prUrl, /pull\/13$/)
    assert.equal(summaryLine(r.gantt, Date.parse('2026-11-20T23:47:07Z')), '13m 31s · $2.67')
    const rows = r.gantt.flatMap((s) => s.rows)
    assert.equal(rows.find((x) => x.name === 'Code review PR 13 pass 2').end, null)
    assert.equal(rows.find((x) => x.name === 'Code review PR 13').cost > 0.3, true)
    assert.equal(group(api, 'Backlog').count, 10)
    assert.equal(group(api, 'Backlog').rows[0].id, 'ALBUM-14')
  })
}

test('before the follow-up helper finishes, ALBUM-14 and the retitle are not there', () => {
  const api = at('23:44:30')
  assert.equal(group(api, 'Backlog').rows.some((r) => r.id === 'ALBUM-14'), false)
  assert.equal(group(api, 'Backlog').rows.find((r) => r.id === 'ALBUM-7').title, 'Build the configurable scoring engine')
  assert.deepEqual(names(api), ['Building', 'Writing tickets', 'Backlog'])
})

test('awaiting merge: PR changes with both review verdicts', () => {
  const [r] = group(at('23:51:05'), 'Awaiting merge approval').rows
  assert.equal(r.risk, 'Low (docs only, 1 file).')
  assert.deepEqual(r.detail.reviews.map((x) => x.verdict), ['PASS', 'PASS'])
  assert.match(r.prUrl, /pull\/13$/)
})

test('merged: Done holds ALBUM-2 and the board is empty of it', () => {
  const api = at('23:54:30')
  assert.deepEqual(api.merged.map((e) => e.id), ['ALBUM-2'])
  assert.equal(api.merged[0].spend.cost.toFixed(2), '4.59')
  assert.equal(group(api, 'Awaiting merge approval'), undefined)
  assert.equal(group(api, 'Merging'), undefined)
})

test('ALBUM-3 leaves the Backlog when started, the epic stays', () => {
  const api = at('23:56:00')
  const backlog = ids(group(api, 'Backlog'))
  assert.equal(backlog.includes('ALBUM-3'), false)
  assert.equal(backlog.length, 9)
  assert.equal(group(api, 'Speccing').rows[0].id, 'ALBUM-3')
  assert.deepEqual(names(api), ['Speccing', 'Writing tickets', 'Backlog'])
})

test('ALBUM-3 spec ready joins the earlier helper in its gantt and keeps its recorded spec', () => {
  const [r] = group(at('23:57:25'), 'Awaiting build approval').rows
  assert.equal(r.gantt.length, 2)
  assert.match(r.next, /spec 111a741$/)
  assert.ok(r.detail.sections.length > 0)
})

test('the five hours between the sessions change nothing on the board', () => {
  assert.deepEqual(day2('00:00:00').status, at('23:58:00').status)
  assert.equal(at('2026-11-21T03:00:00Z').chief.state, 'idle')
})

test('ALBUM-3 builds, shows its PR, comes back for the merge approval and is merged', () => {
  const building = row(day2('05:07:00'), 'ALBUM-3')
  assert.equal(building.stage, 'build')
  assert.equal(building.prUrl, undefined)
  assert.equal(row(day2('05:10:30'), 'ALBUM-3').prUrl, 'https://github.com/dbeallor/album-ranker/pull/16')
  const ready = row(day2('05:13:45'), 'ALBUM-3')
  assert.equal(ready.stage, 'awaiting-merge')
  assert.equal(ready.detail.kind, 'changes')
  assert.match(ready.risk, /^Medium \(21 files/)
  assert.equal(day2('05:16:40').merged[0].id, 'ALBUM-3')
  assert.equal(day2('05:16:40').merged[0].mergedAt, Date.parse('2026-11-21T05:16:40Z'))
  assert.equal(row(day2('05:16:40'), 'ALBUM-3'), undefined)
})

test('two tickets spec at once, then wait for approval together', () => {
  const specs = day2('05:18:30')
  assert.deepEqual(ids(group(specs, 'Speccing')).sort(), ['ALBUM-4', 'ALBUM-5'])
  assert.equal(group(specs, 'Backlog').rows.some((r) => ['ALBUM-4', 'ALBUM-5'].includes(r.id)), false)
  const ready = day2('05:21:20')
  assert.deepEqual(ids(group(ready, 'Awaiting build approval')).sort(), ['ALBUM-4', 'ALBUM-5'])
  assert.match(row(ready, 'ALBUM-4').specUrl, /\/blob\/07ea80517c57dfc29ba4bebb44aabde10938fda6\//)
  assert.match(row(ready, 'ALBUM-5').specUrl, /\/blob\/607a5f3e19293e9200c841bbddbf58105260be4c\//)
  assert.deepEqual(ids(group(day2('05:26:00'), 'Building')).sort(), ['ALBUM-4', 'ALBUM-5'])
})

test('one ticket awaits its merge while another builds, and the merged list keeps newest first', () => {
  const api = day2('05:31:50')
  assert.deepEqual(ids(group(api, 'Awaiting merge approval')), ['ALBUM-5'])
  assert.deepEqual(ids(group(api, 'Building')), ['ALBUM-4'])
  assert.deepEqual(day2('05:39:40').merged.map((e) => e.id), ['ALBUM-4', 'ALBUM-5', 'ALBUM-3', 'ALBUM-2'])
})

test('Todo tickets wait in Waiting to spec, behind nothing, then start in their order as spec slots allow', () => {
  assert.deepEqual(ids(group(day2('05:42:10'), 'Waiting to spec')), ['ALBUM-7', 'ALBUM-10', 'ALBUM-14'])
  const api = day2('05:42:50')
  assert.deepEqual(ids(group(api, 'Speccing')).sort(), ['ALBUM-10', 'ALBUM-7'])
  assert.deepEqual(ids(group(api, 'Waiting to spec')), ['ALBUM-14'])
  assert.deepEqual(ids(group(day2('05:46:40'), 'Speccing')), ['ALBUM-14'])
})

test('the writing-tickets group follows the helper and the new ticket lands in the Backlog after it', () => {
  const writing = day2('05:46:40')
  assert.equal(group(writing, 'Writing tickets').rows[0].title, 'Frontend event tracking so browser tests can be replayed')
  assert.equal(row(writing, 'ALBUM-19'), undefined)
  assert.equal(ids(group(day2('05:46:55'), 'Backlog'))[0], 'ALBUM-19')
  assert.equal(group(day2('05:46:55'), 'Writing tickets'), undefined)
  assert.deepEqual(ids(group(day2('05:48:10'), 'Backlog')).slice(0, 2), ['ALBUM-20', 'ALBUM-19'])
})

test('a held ticket goes back to the Backlog and is retitled by the helper that rewrote it', () => {
  assert.equal(row(day2('05:48:00'), 'ALBUM-14').stage, 'awaiting-build')
  const held = day2('05:48:40')
  assert.equal(row(held, 'ALBUM-14').stage, '')
  assert.equal(group(held, 'Backlog').rows.find((r) => r.id === 'ALBUM-14').title, 'Deploy the app with a password gate')
  assert.equal(row(day2('05:53:40'), 'ALBUM-14').title, 'Deploy the app to AWS with staging and production behind a password gate')
})

test('four tickets are active at once: two specs and two builds', () => {
  const api = day2('05:49:40')
  assert.deepEqual(ids(group(api, 'Speccing')).sort(), ['ALBUM-19', 'ALBUM-20'])
  assert.deepEqual(ids(group(api, 'Building')).sort(), ['ALBUM-10', 'ALBUM-7'])
})

test('approved specs wait in Queued to build in the order they were approved while both build slots are full', () => {
  const api = day2('05:52:00')
  assert.deepEqual(ids(group(api, 'Queued to build')), ['ALBUM-20', 'ALBUM-19'])
  assert.match(row(api, 'ALBUM-20').next, /build-queued since 2026-11-21 5:51 am UTC: spec approved, waiting for a build slot \(builds running: ALBUM-7, ALBUM-10\)$/)
  assert.equal(row(api, 'ALBUM-20').detail.kind, 'spec')
})

test('a build slot frees when a PR is ready: the queue head builds while the PR waits for its merge approval', () => {
  const api = day2('05:55:10')
  assert.deepEqual(ids(group(api, 'Awaiting merge approval')), ['ALBUM-7'])
  assert.deepEqual(ids(group(api, 'Building')).sort(), ['ALBUM-10', 'ALBUM-20'])
  assert.deepEqual(ids(group(api, 'Queued to build')), ['ALBUM-19'])
  const merging = day2('05:55:20')
  assert.deepEqual(ids(group(merging, 'Merging')), ['ALBUM-7'])
  assert.equal(day2('05:55:30').merged[0].id, 'ALBUM-7')
})

test('the Done list keeps every merge with its spend and gantt, newest first', () => {
  const api = day2('05:56:00')
  assert.deepEqual(api.merged.map((e) => e.id), ['ALBUM-7', 'ALBUM-4', 'ALBUM-5', 'ALBUM-3', 'ALBUM-2'])
  assert.deepEqual(api.merged.map((e) => e.mergedAt), ['05:55:27', '05:39:38', '05:33:03', '05:16:40', '2026-11-20T23:53:48'].map((t) => Date.parse(t.length > 8 ? `${t}Z` : `2026-11-21T${t}Z`)))
  assert.equal(api.merged[0].spend.cost.toFixed(2), '3.45')
  assert.match(api.merged[0].specUrl, /\/blob\/d70adc5[0-9a-f]+\/docs\/superpowers\/specs\/2026-11-21-album-7-elo-matchup\.md$/)
  assert.deepEqual(api.merged.at(-1).gantt.map((s) => s.sessionId.slice(0, 8)), ['82b8dd79', '2f88592c'])
})

test('after a reset the chief gantt shows only the newest session', () => {
  assert.equal(day2('05:20:00').chief.gantt[0].sessionId.slice(0, 8), 'ecf006d0')
  assert.equal(day2('05:36:00').chief.gantt[0].sessionId.slice(0, 8), '10c9aa0f')
  const last = day2('06:00:00')
  assert.equal(last.chief.gantt.length, 1)
  assert.equal(last.chief.gantt[0].sessionId.slice(0, 8), 'd600851e')
  assert.equal(last.chief.gantt[0].rows.length, 1)
  assert.deepEqual(last.pm, [])
})

test('gantt rows appear as the build children start them, sub-agents included, and cost nothing until they close', () => {
  const early = row(day2('05:55:40'), 'ALBUM-20').gantt.find((s) => s.rows.some((r) => r.name.startsWith('Implement')))
  const impl = early.rows.find((r) => r.name === 'Implement ALBUM-20 previews')
  assert.equal(impl.end, null)
  assert.equal(impl.cost, 0)
  const later = row(day2('06:05:00'), 'ALBUM-20').gantt.at(-1).rows
  assert.deepEqual(later.map((r) => r.name), ['Spec ALBUM-20: Add local preview environments for main and p', 'build', 'Implement ALBUM-20 previews', 'Code review PR 23', 'Security review PR 23'])
  assert.equal(later.find((r) => r.name === 'Code review PR 23').end, null)
  assert.equal(later.find((r) => r.name === 'Security review PR 23').end !== null, true)
})

test('Details content follows the stage: a spec while approving and building, the PR changes while merging, nothing in the Backlog', () => {
  assert.equal(row(day2('05:21:20'), 'ALBUM-4').detail.kind, 'spec')
  assert.equal(row(day2('05:26:00'), 'ALBUM-4').detail.kind, 'spec')
  assert.equal(row(day2('05:39:20'), 'ALBUM-4').detail.kind, 'changes')
  assert.equal(row(day2('05:39:20'), 'ALBUM-4').detail.files.length, 27)
  assert.deepEqual(row(day2('05:39:20'), 'ALBUM-4').detail.reviews.map((r) => r.verdict), ['PASS', 'PASS'])
  assert.equal(row(day2('05:39:20'), 'ALBUM-5'), undefined)
  assert.equal(row(day2('05:57:10'), 'ALBUM-14').detail, undefined)
})
