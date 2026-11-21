// Clock times as the stage shows them (America/New_York, 12-hour), and instants given in a story as `HH:MM:SS`.

const ZONE = 'America/New_York'

/** `6:57 p.m.` */
export const fmtClock = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: ZONE }).replace(' AM', ' a.m.').replace(' PM', ' p.m.')

/** `Nov 20` */
export const fmtDay = (ms) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: ZONE })

/** `2m 37s`, `45s` */
export const fmtDur = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

/** A sidebar age: `now`, `5m`, `3h`, `2d` */
export const ageLabel = (ms) => (ms < 60000 ? 'now' : ms < 3600000 ? `${Math.floor(ms / 60000)}m` : ms < 86400000 ? `${Math.floor(ms / 3600000)}h` : `${Math.floor(ms / 86400000)}d`)

/** The time-lapse chip's text for a jump: the clock range, with the date when the two times would otherwise read the same. Empty under a minute, where the two labels could not tell the ends apart. */
export function lapseChip(from, to, label) {
  if (to - from < 60000) return ''
  const a = fmtClock(from), b = fmtClock(to)
  const range = a === b ? `${fmtDay(from)}, ${a} → ${fmtDay(to)}, ${b}` : `${a} → ${b}`
  return `⏩ ${label ? `${label} · ` : ''}${range}`
}

/** An instant as epoch ms: a number, an ISO string, or `HH:MM:SS` (UTC) on `date`, rolled into the next day when `clock` (epoch ms) is already more than 12 hours past that time on `date`. */
export function instant(s, date, clock) {
  if (typeof s === 'number') return s
  if (s.length > 8) return Date.parse(s)
  let at = Date.parse(`${date}T${s}Z`)
  while (at < clock - 12 * 3600000) at += 86400000
  return at
}
