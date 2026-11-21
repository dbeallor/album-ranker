// Gantt sessions as the dashboard drew them at one instant, cut from their final recorded form.

const activeMs = (segments, t) => segments.reduce((n, [a, b]) => n + Math.max(0, Math.min(b ?? t, t) - a), 0)

function clipRow(r, t) {
  if (r.start > t) return null
  const segments = r.segments.filter(([a]) => a <= t).map(([a, b]) => (b !== null && b <= t ? [a, b] : [a, null]))
  const open = segments.some(([, b]) => b === null)
  const done = r.end !== null && r.end <= t
  const end = open ? null : done ? r.end : (segments.at(-1)?.[1] ?? r.start)
  const total = activeMs(r.segments, Infinity)
  const accrued = done || total === 0 ? 1 : activeMs(r.segments, t) / total
  // A row is priced when its task closes: until then it reads $0.00 and no tokens, while the session total keeps counting.
  const priced = (x) => (done ? x : x === null ? null : 0)
  return { row: { ...r, end, segments, tokens: priced(r.tokens), cost: priced(r.cost) }, accrued: (r.cost ?? 0) * accrued }
}

export function clipSession(s, t) {
  const clipped = s.rows.map((r) => clipRow(r, t)).filter(Boolean)
  if (clipped.length === 0) return null
  const rows = clipped.map((c) => c.row)
  const running = rows.some((r) => r.end === null)
  const lastEnd = rows.reduce((m, r) => Math.max(m, r.end ?? 0, r.segments.at(-1)?.[1] ?? 0), 0)
  return { ...s, updatedAt: running ? t : lastEnd, stale: false, total: clipped.reduce((n, c) => n + c.accrued, 0), rows }
}

/** The sessions with every row cut at `timeMs`: rows that have not started are gone, a span still going is open (`null` end), and costs count only for closed rows. */
export const clipGantt = (sessions, timeMs) => sessions.map((s) => clipSession(s, timeMs)).filter(Boolean)
