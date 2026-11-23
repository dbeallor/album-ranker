// When a word is spoken: the lookup behind story cues. ElevenLabs gives the start of every character; `say` and the dry run get an estimate.
import { plain } from './narration.mjs'

const BREAK = /<break\b[^>]*>/g

/** `spec` is a phrase or `{ word, nth }` (nth occurrence, from 1). */
export const specOf = (spec) => (typeof spec === 'string' ? { word: spec, nth: 1 } : { word: spec.word, nth: spec.nth ?? 1 })
export const specLabel = (spec) => { const { word, nth } = specOf(spec); return nth > 1 ? `${word} #${nth}` : word }

/** Lower-cased text with whitespace runs collapsed to one space, and `skip(i)` characters dropped; `at[k]` is the source index of character k. */
function compact(chars, skip = () => false) {
  let text = '', at = [], space = false
  chars.forEach((c, i) => {
    if (skip(i)) return
    if (/\s/.test(c)) { if (text && !space) { text += ' '; at.push(i); space = true } return }
    text += c.toLowerCase(); at.push(i); space = false
  })
  return { text, at }
}

/** Index in `text` of the `nth` occurrence of `word` starting at a word boundary, or -1. */
function find(text, word, nth) {
  const w = compact([...word]).text
  let from = 0, found = 0
  for (;;) {
    const i = text.indexOf(w, from)
    if (i < 0) return -1
    if ((i === 0 || !/[\p{L}\p{N}]/u.test(text[i - 1])) && ++found === nth) return i
    from = i + 1
  }
}

/**
 * Seconds at which `spec` starts in the audio, from an ElevenLabs `alignment` (`characters`, `character_start_times_seconds`); `<break>` tags that appear in the alignment are ignored.
 * Returns null when the phrase is not in the text.
 */
export function wordStart(alignment, spec) {
  const { word, nth } = specOf(spec)
  const chars = alignment.characters
  const joined = chars.join('')
  const drop = new Set()
  const starts = []
  let n = 0
  for (const c of chars) { starts.push(n); n += c.length }
  for (const m of joined.matchAll(BREAK)) for (let k = 0; k < chars.length; k++) if (starts[k] >= m.index && starts[k] < m.index + m[0].length) drop.add(k)
  const { text, at } = compact(chars, (i) => drop.has(i))
  const i = find(text, word, nth)
  return i < 0 ? null : alignment.character_start_times_seconds[at[i]]
}

/** The estimate for `say` and the dry run: where the phrase sits in the plain text, as a fraction of `seconds`. Null when it is not there. */
export function estimateStart(say, spec, seconds) {
  const { word, nth } = specOf(spec)
  const { text } = compact([...plain(say)])
  const i = find(text, word, nth)
  return i < 0 ? null : (i / text.length) * seconds
}

/** `(spec) => seconds` for a beat's narration `say` that lasts `seconds`: exact with an alignment, estimated without. Throws for a phrase that is not spoken, so a typo in a story fails the render. */
export function cueLookup(say, alignment, seconds) {
  return (spec) => {
    const t = alignment ? wordStart(alignment, spec) : estimateStart(say, spec, seconds)
    if (t === null) throw new Error(`cue "${specLabel(spec)}" is not in the narration: ${plain(say).slice(0, 80)}...`)
    return t
  }
}
