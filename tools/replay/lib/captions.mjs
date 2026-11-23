// Caption text: narration cut into pieces that each fit the caption strip's two lines, on sentence boundaries.

const ABBREVIATION = /^(?:mr|mrs|ms|dr|st|vs|etc|approx|no|fig|e\.g|i\.e|a\.m|p\.m)$/i
const INITIALS = /^(?:[A-Za-z]\.)+[A-Za-z]?$/
const CLAUSE = /[;:,]\s|\s[—–-]\s/g

export const MAX_CHARS = 190
export const MERGE_CHARS = 120

/** The sentences of `text`: a period, question or exclamation mark followed by a space and a capital ends one, unless the word before it is an abbreviation or initials (`e.g.`, `p.m.`, `U.S.`). `Next.js` has no space after its dot, so it never splits. */
export function sentences(text) {
  const out = []
  let start = 0
  for (const m of text.matchAll(/[.!?]+["')\]]*(?=\s+\S)/g)) {
    const end = m.index + m[0].length
    const word = text.slice(start, end).match(/(\S+)$/)[1].replace(/["')\]]*$/, '')
    const next = text.slice(end).trimStart()[0]
    if (m[0][0] === '.' && (ABBREVIATION.test(word.replace(/\.+$/, '')) || INITIALS.test(word))) continue
    if (/[a-z]/.test(next)) continue
    out.push(text.slice(start, end).trim())
    start = end
  }
  const rest = text.slice(start).trim()
  return rest ? [...out, rest] : out
}

function split(piece, max) {
  if (piece.length <= max) return [piece]
  const middle = piece.length / 2
  const cuts = [...piece.matchAll(CLAUSE)].map((m) => m.index + m[0].trimEnd().length).filter((i) => i > 20 && i < piece.length - 20)
  const spaces = [...piece.matchAll(/ /g)].map((m) => m.index)
  const pool = cuts.length ? cuts : spaces
  const at = pool.reduce((best, i) => (Math.abs(i - middle) < Math.abs(best - middle) ? i : best), pool[0] ?? max)
  return [...split(piece.slice(0, at).trim(), max), ...split(piece.slice(at).trim(), max)]
}

/** Caption pieces of `text`, each at most `max` characters (two lines of the strip), short neighbours joined up to `merge` characters. */
export function captionChunks(text, { max = MAX_CHARS, merge = MERGE_CHARS } = {}) {
  const pieces = sentences(text.trim()).flatMap((s) => split(s, max))
  const out = []
  for (const p of pieces) {
    if (out.length && out.at(-1).length + 1 + p.length <= merge) out[out.length - 1] += ` ${p}`
    else out.push(p)
  }
  return out
}
