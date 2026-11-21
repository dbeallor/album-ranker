// The /api payload the team dashboard served at one instant of a recorded session, built from a timeline and the recorded gantt sessions.
import { clipGantt, isOpenAt } from './clip-gantt.mjs'

// The groups of the dashboard's status layout (chief-of-staff status.md), in order, with the stages each one lists.
const LAYOUT = [
  ['Awaiting merge approval', ['awaiting-merge']],
  ['Awaiting teammate review', ['awaiting-review']],
  ['Merging', ['merge']],
  ['Queued to merge', ['merge-queued']],
  ['Speccing', ['spec']],
  ['Awaiting build approval', ['awaiting-build']],
  ['Building', ['build']],
  ['Queued to build', ['build-queued']],
  ['Waiting to spec', ['spec-queued']],
  ['Other', ['blocked']],
]
const SPEC_STAGES = ['awaiting-build', 'build', 'build-queued']
const PR_STAGES = ['awaiting-merge', 'merge', 'merge-queued']
const WRITING = 'Writing tickets'

const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z')
const num = (id) => id.split('-').pop()

/** `2026-11-20 11:15 pm UTC`, the form `cos_state.py` writes for `{since}`. */
function sinceText(ms) {
  const d = new Date(ms)
  const h = d.getUTCHours()
  const date = iso(ms).slice(0, 10)
  return `${date} ${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'} UTC`
}

/** Each ticket's record after every event up to `timeMs`. A `stage` in an event moves the ticket onto the board and restates its status. */
function ticketsAt(timeMs, timeline) {
  const out = {}
  const events = timeline.events.filter((e) => Date.parse(e.t) <= timeMs).sort((a, b) => Date.parse(a.t) - Date.parse(b.t))
  for (const e of events) {
    for (const id of e.tickets) {
      const rec = out[id] ?? { id, ...timeline.tickets[id] }
      Object.assign(rec, e.set)
      if (e.set.stage) Object.assign(rec, { list: 'board', stageAt: Date.parse(e.t), risk: e.set.risk, boardedAt: rec.boardedAt ?? Date.parse(e.t) })
      out[id] = rec
    }
  }
  return out
}

const QUEUED = ['merge-queued', 'build-queued', 'spec-queued']

/** A group's rows the way the dashboard orders them: queued stages by when they queued (the order they will start), the others newest issue activity first (the tracker's `updatedAt`); ties keep the order the tickets reached the board. */
function ordered(rows, timeMs, timeline) {
  const byBoard = [...rows].sort((a, b) => a.boardedAt - b.boardedAt)
  if (rows.length && QUEUED.includes(rows[0].stage)) return byBoard.sort((a, b) => a.stageAt - b.stageAt)
  const touched = (t) => Math.max(-Infinity, ...(timeline.tickets[t.id].updates ?? []).map(Date.parse).filter((u) => u <= timeMs))
  return byBoard.sort((a, b) => touched(b) - touched(a))
}

const finishedAt = (s) => s.rows.reduce((m, r) => Math.max(m, r.end ?? 0), 0)
const startedAt = (s) => Math.min(...s.rows.map((r) => r.start))

export function stateAt(timeMs, timeline, fixtures) {
  const { repo } = timeline
  const sessions = timeline.sessions.map((m) => ({ ...m, session: fixtures.sessions[m.id] }))
  const link = (threadId) => repo.chiefThreadLink.replace(/\/[^/]+>$/, `/${threadId}>`)
  const tickets = Object.values(ticketsAt(timeMs, timeline))
  const ticketOf = (id) => sessions.find((m) => m.role === 'ticket' && m.ticket === id)
  // A helper's session joins the ticket it filed once it has finished.
  const garrison = (id) => [...sessions.filter((m) => m.role === 'helper' && m.session.ticket === id && finishedAt(m.session) <= timeMs), ...sessions.filter((m) => m.role === 'ticket' && m.ticket === id)]
  const ganttOf = (id) => clipGantt(garrison(id).map((m) => m.session), timeMs).sort((a, b) => a.updatedAt - b.updatedAt)

  const listRow = (t) => {
    const row = { id: t.id, title: t.title, risk: '', next: '', stage: '', issueUrl: `${repo.url}/issues/${num(t.id)}`, owner: repo.viewer }
    const gantt = ganttOf(t.id)
    if (gantt.length) row.gantt = gantt
    return row
  }
  const boardRow = (t) => {
    const specUrl = t.specSha && `${repo.url}/blob/${t.specSha}/${t.specPath}`
    const prUrl = t.pr && `${repo.url}/pull/${t.pr}`
    const sections = SPEC_STAGES.includes(t.stage) ? fixtures.specs[t.specSha?.slice(0, 7)] : undefined
    const changes = PR_STAGES.includes(t.stage) ? fixtures.prDetails[t.pr] : undefined
    const row = {
      id: t.id,
      title: t.title,
      risk: t.risk ? `${t.risk}.` : 'not rated yet',
      next: `${t.stage} since ${sinceText(t.stageAt)}: ${t.next}`,
      stage: t.stage,
      stageAt: iso(t.stageAt),
      owner: repo.viewer,
      issueUrl: `${repo.url}/issues/${num(t.id)}`,
    }
    if (prUrl) row.prUrl = prUrl
    const child = ticketOf(t.id)
    if (child) row.threadLink = link(child.session.threadId)
    if (specUrl) row.specUrl = specUrl
    if (sections) row.detail = { kind: 'spec', sections, url: specUrl }
    if (changes) row.detail = { ...changes, url: prUrl }
    const gantt = ganttOf(t.id)
    if (gantt.length) row.gantt = gantt
    return row
  }

  const groups = LAYOUT.map(([name, stages]) => ({ name, rows: ordered(tickets.filter((t) => t.list === 'board' && stages.includes(t.stage)), timeMs, timeline).map(boardRow) }))
  const todo = tickets.filter((t) => t.list === 'todo').sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
  groups.find((g) => g.name === 'Waiting to spec').rows.push(...todo.map(listRow))
  const status = groups.filter((g) => g.rows.length).map((g) => ({ ...g, count: g.rows.length }))

  const writing = sessions
    .filter((m) => m.role === 'helper' && startedAt(m.session) <= timeMs && timeMs < finishedAt(m.session))
    .map((m) => {
      const [session] = clipGantt([m.session], timeMs)
      const rows = session.rows.map((r) => ({ ...r, name: r.name.replace(/ [A-Z]+-\d+$/, '') }))
      return { id: `helper:${m.id}`, title: m.session.request ?? '', helper: true, risk: '', next: '', stage: '', gantt: [{ ...session, rows }], threadLink: link(m.session.threadId) }
    })
  if (writing.length) status.push({ name: WRITING, count: writing.length, rows: writing })

  const backlog = tickets.filter((t) => t.list === 'backlog').sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  if (backlog.length) status.push({ name: 'Backlog', count: backlog.length, rows: backlog.map(listRow), moreUrl: `${repo.url}/issues` })

  const merged = tickets
    .filter((t) => t.list === 'done')
    .sort((a, b) => Date.parse(b.mergedAt) - Date.parse(a.mergedAt))
    .map((t) => {
      const prUrl = `${repo.url}/pull/${t.pr}`
      const gantt = ganttOf(t.id)
      const spend = { cost: gantt.reduce((n, s) => n + s.total, 0), tokens: gantt.reduce((n, s) => n + s.rows.reduce((k, r) => k + r.tokens, 0), 0) }
      return { id: t.id, title: t.mergedTitle, prUrl, mergedAt: Date.parse(t.mergedAt), issueUrl: `${repo.url}/issues/${num(t.id)}`, owner: repo.viewer, spend, gantt, detail: { ...fixtures.prDetails[t.pr], url: prUrl }, ...(t.mergedSpecUrl ? { specUrl: t.mergedSpecUrl } : {}) }
    })

  // The dashboard shows the chief session written to last; a reset leaves the old one behind.
  const chiefs = sessions.filter((m) => m.role === 'chief').map((m) => m.session)
  const live = clipGantt(chiefs, timeMs).reduce((best, s) => (!best || s.updatedAt >= best.updatedAt ? s : best), null)
  const turn = live && isOpenAt(chiefs.find((c) => c.sessionId === live.sessionId), timeMs)
  const chief = { state: turn ? 'running' : 'idle', threadLink: repo.chiefThreadLink, ...(live ? { gantt: [live] } : {}) }

  return { generatedAt: timeMs, status, merged, viewer: repo.viewer, chief, pm: [], version: 'replay', restartError: null, trackerError: null, theme: 'dark' }
}
