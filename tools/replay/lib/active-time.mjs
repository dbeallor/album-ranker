// Active build time: how long the user was building, not the wall-clock span.
// Active = an agent of the build was running (a drawn gantt bar), or the user was around: gaps of at most `idleGapMs`
// between two pieces of activity (agent segment edges, user commands) count; a longer gap with nothing running does not.

export const DEFAULT_IDLE_GAP_MS = 5 * 60 * 1000

const parse = (t) => (typeof t === 'number' ? t : Date.parse(t))

/** Every `[start, end]` working segment of a gantt row and its children. `end` null means still running (open until `openEnd`). */
function rowSegments(row, openEnd, out = []) {
  for (const [a, b] of row.segments || []) out.push([a, b ?? openEnd])
  for (const c of row.children || []) rowSegments(c, openEnd, out)
  return out
}

/**
 * The agent-running segments of the sessions in `sessionIds`, from `fixtures.sessions` (the gantt folder) and `fixtures.history` (gantt-history.json, `{ sessions: { id: { session } } }`).
 * Sessions that are not listed (other threads that happen to be in the gantt folder) are left out.
 */
export function agentSegments(sessionIds, fixtures, openEnd) {
  const ids = new Set(sessionIds)
  const out = []
  for (const s of Object.values(fixtures.sessions || {})) if (ids.has(s.sessionId)) for (const r of s.rows || []) rowSegments(r, openEnd, out)
  for (const h of Object.values(fixtures.history?.sessions || {})) if (ids.has(h.session?.sessionId)) for (const r of h.session.rows || []) rowSegments(r, openEnd, out)
  return out
}

/** Sorts and merges overlapping or touching `[a, b]` intervals. */
export function mergeIntervals(list) {
  const sorted = list.filter(([a, b]) => b > a).map(([a, b]) => [a, b]).sort((x, y) => x[0] - y[0])
  const out = []
  for (const [a, b] of sorted) {
    const last = out[out.length - 1]
    if (last && a <= last[1]) last[1] = Math.max(last[1], b)
    else out.push([a, b])
  }
  return out
}

/**
 * Merged active intervals `[startMs, endMs]`, clipped to [first command, snapshot].
 * `timeline` needs `sessions`, `commands` and `snapshot` (or `snapshot.takenAt`); `fixtures` is `{ sessions, history? }`.
 * `idleGapMs` defaults to `timeline.activeTime.idleGapMs`, else 5 minutes.
 */
export function activeIntervals(timeline, fixtures, { idleGapMs } = {}) {
  const gap = idleGapMs ?? timeline.activeTime?.idleGapMs ?? DEFAULT_IDLE_GAP_MS
  const commands = timeline.commands.map((c) => parse(c.t))
  const start = Math.min(...commands)
  const end = parse(timeline.snapshot?.takenAt ?? timeline.snapshot)
  const clip = ([a, b]) => [Math.max(a, start), Math.min(b, end)]
  const segs = mergeIntervals(agentSegments(timeline.sessions.map((s) => s.id), fixtures, end).map(clip))
  // A command is an instant: a 1 ms interval, so it can bridge a gap but adds no time on its own.
  const pieces = mergeIntervals([...segs, ...commands.filter((t) => t >= start && t <= end).map((t) => [t, t + 1])])
  const bridged = []
  for (const [a, b] of pieces) {
    const last = bridged[bridged.length - 1]
    if (last && a - last[1] <= gap) last[1] = Math.max(last[1], b)
    else bridged.push([a, b])
  }
  return bridged.filter(([a, b]) => b - a > 1)
}

/** Active ms up to wall-clock time `tMs`. */
export function elapsedAt(intervals, tMs) {
  let sum = 0
  for (const [a, b] of intervals) {
    if (tMs <= a) break
    sum += Math.min(tMs, b) - a
  }
  return sum
}

/** Total active ms. */
export const totalActive = (intervals) => intervals.reduce((s, [a, b]) => s + (b - a), 0)
