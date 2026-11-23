// The `BEATS` setting: which beats to render, as `3,7`, `3-7` or `1,4-6`.

/** The beat indices of `spec` (`undefined` or empty: all `count` beats); a bad entry or an index past the last beat throws. */
export function beatRange(spec, count) {
  if (!spec) return null
  const out = new Set()
  for (const part of spec.split(',')) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part.trim())
    if (!m) throw new Error(`BEATS: "${part}" is not a beat number or range like 3-7`)
    const a = +m[1], b = m[2] === undefined ? a : +m[2]
    if (b < a || b >= count) throw new Error(`BEATS: "${part}" is outside 0-${count - 1}`)
    for (let i = a; i <= b; i++) out.add(i)
  }
  return out
}
