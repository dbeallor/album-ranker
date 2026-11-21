// Gantt sessions as the dashboard drew them at one instant, cut from their final recorded form.

const STALE_MS = 30_000
const WORKTREE = /\/worktrees\//
const TEAM_FIELDS = ['threadId', 'heading', 'ticket', 'request']

const activeMs = (segments, t) => segments.reduce((n, [a, b]) => n + Math.max(0, Math.min(b ?? t, t) - a), 0)

function clipRow(r, t, endedAt) {
  if (r.start > t) return null
  const segments = r.segments.filter(([a]) => a <= t).map(([a, b]) => (b !== null && b <= t ? [a, b] : [a, null]))
  const open = segments.some(([, b]) => b === null)
  const done = r.end !== null && r.end <= t
  const end = open ? null : done ? r.end : (segments.at(-1)?.[1] ?? r.start)
  const total = activeMs(r.segments, endedAt)
  const accrued = done || total === 0 ? 1 : activeMs(r.segments, Math.min(t, endedAt)) / total
  // A row is priced when its task closes: until then it reads $0.00 and no tokens, while the session total keeps counting.
  const priced = (x) => (done ? x : x === null ? null : 0)
  return { row: { ...r, end, segments, tokens: priced(r.tokens), cost: priced(r.cost) }, accrued: (r.cost ?? 0) * accrued, openAtEnd: r.end === null, share: Math.min(t, endedAt) > r.start ? activeMs(r.segments, Math.min(t, endedAt)) / Math.max(1, activeMs(r.segments, endedAt)) : 0 }
}

/** True when a task of the session is mid-turn at `t`: the dashboard calls the session running only then. */
export const isOpenAt = (s, t) => s.rows.some((r) => r.kind === 'task' && r.segments.some(([a, b]) => a <= t && (b === null || t < b)))

/**
 * The session as the dashboard cleans a snapshot written at `t`. A session still being written has `t` as its last update; a stopped one keeps its last write, and
 * its open spans are closed there: all of them when a subagent was still working and the write is over 30 s old (stale), else the main and task rows.
 * Rows still open in the final file hold the part of the session total that no closed row carries.
 */
export function clipSession(s, t) {
  const clipped = s.rows.map((r) => clipRow(r, t, s.updatedAt)).filter(Boolean)
  if (clipped.length === 0) return null
  const rows = clipped.map((c) => c.row)
  const open = rows.some((r) => r.end === null)
  const lastEnd = rows.reduce((m, r) => Math.max(m, r.end ?? 0, r.segments.at(-1)?.[1] ?? 0), 0)
  const updatedAt = open ? Math.min(t, s.updatedAt) : t >= s.updatedAt ? s.updatedAt : lastEnd
  const working = rows.some((r) => r.kind === 'agent' && r.id !== 'main' && r.end === null)
  const stale = working && t - updatedAt > STALE_MS
  const close = (r) => ({ ...r, end: updatedAt, segments: r.segments.map(([a, b]) => [a, b === null ? Math.max(a, updatedAt) : b]) })
  const shown = rows.map((r) => (r.end === null && (stale || (!working && (r.id === 'main' || r.kind === 'task'))) ? close(r) : r))
  const carried = s.rows.reduce((n, r) => n + (r.cost ?? 0), 0)
  const unclosed = clipped.filter((c) => c.openAtEnd)
  const residual = Math.max(0, (s.total ?? 0) - carried) * (unclosed.length ? unclosed.reduce((n, c) => n + c.share, 0) / unclosed.length : 0)
  const team = WORKTREE.test(s.cwd) ? Object.fromEntries(Object.entries(s).filter(([k]) => !TEAM_FIELDS.includes(k))) : s
  return { ...team, updatedAt, stale, total: clipped.reduce((n, c) => n + c.accrued, 0) + residual, rows: shown }
}

/** The sessions with every row cut at `timeMs`: rows that have not started are gone, a span still going is open (`null` end), and costs count only for closed rows. */
export const clipGantt = (sessions, timeMs) => sessions.map((s) => clipSession(s, timeMs)).filter(Boolean)
