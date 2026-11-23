// Model-neutral narration markup: `{pause}`, `{pause:long}` and `{tag:thoughtful}` in a beat's text, converted per voice model.
const MARK = /\s*\{(pause(?::long)?|tag:[a-z ]+)\}\s*/g
const BREAK = { pause: '<break time="0.4s" />', 'pause:long': '<break time="0.8s" />' }
const V3 = { pause: '[pause]', 'pause:long': '[long pause]' }

const isV3 = (model) => /^eleven_v3/.test(model)

/** Text for ElevenLabs `model`: pauses become `<break>` tags (v2 and older) or `[pause]` tags (v3), `{tag:x}` becomes `[x]` on v3 and vanishes elsewhere. */
export function forModel(text, model) {
  return text.replace(MARK, (_, m) => {
    if (m.startsWith('tag:')) return isV3(model) ? ` [${m.slice(4)}] ` : ' '
    return ` ${isV3(model) ? V3[m] : BREAK[m]} `
  }).replace(/ +/g, ' ').trim()
}

/** Text with every marker removed: captions and word counts. */
export const plain = (text) => text.replace(MARK, ' ').replace(/ +/g, ' ').trim()

/** Text for macOS `say`: a pause becomes a silence command, tags vanish. */
export const forSay = (text) => text.replace(MARK, (_, m) => (m === 'pause' ? ' [[slnc 400]] ' : m === 'pause:long' ? ' [[slnc 800]] ' : ' ')).replace(/ +/g, ' ').trim()

/** Number of `{pause}` markers: ElevenLabs warns that many break tags in one generation cause artifacts. */
export const pauseCount = (text) => (text.match(/\{pause(?::long)?\}/g) ?? []).length
