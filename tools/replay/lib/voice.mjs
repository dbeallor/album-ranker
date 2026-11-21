// Text to speech: the user's cloned ElevenLabs voice when a key and voice id are configured, else the macOS `say` voice.
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { execFileSync } from 'child_process'
import { forModel, forSay, plain } from './narration.mjs'

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..')
export const CACHE = path.join(ROOT, 'out', 'voice-cache')
const MODEL = 'eleven_multilingual_v2'
const DEFAULTS = { stability: 0.4, similarity: 0.8, style: 0, speed: 0.92 }
const SPEED_RANGE = [0.7, 1.2] // the API rejects anything outside this
const CONTEXT_CHARS = 300
const FORMAT = 'mp3_44100_128'
const KEYCHAIN_SERVICE = 'elevenlabs-api-key'
const SAY_VOICE = 'Samantha'
const SAY_RATE = '178'

const ENV_FILE = path.join(ROOT, '.env')
if (fs.existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE)

function keychainKey() {
  try { return execFileSync('security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return '' }
}

function number(env, name, fallback, [lo, hi] = [0, 1]) {
  if (env[name] === undefined || env[name] === '') return fallback
  const n = Number(env[name])
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number, got "${env[name]}"`)
  if (n < lo || n > hi) throw new Error(`${name} must be between ${lo} and ${hi}, got ${n}`)
  return n
}

/** Voice settings from the env (ELEVENLABS_STABILITY, _SIMILARITY, _STYLE, _SPEED) over the defaults; invalid values throw. */
export const voiceSettings = (env = process.env) => ({
  stability: number(env, 'ELEVENLABS_STABILITY', DEFAULTS.stability),
  similarity_boost: number(env, 'ELEVENLABS_SIMILARITY', DEFAULTS.similarity),
  style: number(env, 'ELEVENLABS_STYLE', DEFAULTS.style),
  speed: number(env, 'ELEVENLABS_SPEED', DEFAULTS.speed, SPEED_RANGE),
  use_speaker_boost: true,
})

/** Picks the provider: ElevenLabs needs a key (env, then Keychain) and a voice id; `TTS=say` or a missing one gives `say`. */
export function resolveProvider(env = process.env, keychain = keychainKey) {
  if (env.TTS === 'say') return { name: 'say', voice: env.VOICE || SAY_VOICE }
  const voiceId = env.ELEVENLABS_VOICE_ID
  const key = voiceId && (env.ELEVENLABS_API_KEY || keychain())
  if (!key) return { name: 'say', voice: env.VOICE || SAY_VOICE }
  return { name: 'elevenlabs', voiceId, key, model: env.ELEVENLABS_MODEL || MODEL, settings: voiceSettings(env) }
}

/** Cache key for one synthesized text: anything that changes the sound (voice, model, settings, the neighbouring text) changes the key. */
export const cacheKey = (p, text, context = {}) => crypto.createHash('sha256').update(JSON.stringify([p.name, p.voiceId, p.model, p.settings, FORMAT, text, context])).digest('hex').slice(0, 32)

// eleven_v3 rejects previous_text and next_text (HTTP 400), so only other models get the neighbouring beats.
const takesContext = (model) => !/^eleven_v3/.test(model)

const FIXES = {
  401: 'the API key was rejected: store a valid key with `security add-generic-password -a "$USER" -s elevenlabs-api-key -w <key> -U` or set ELEVENLABS_API_KEY',
  402: 'the ElevenLabs plan has no credits left for this: upgrade or wait for the quota reset',
  429: 'ElevenLabs rate limit or quota reached: wait and re-run (finished beats are cached), or render with TTS=say',
  422: 'ElevenLabs rejected the request, usually an invalid ELEVENLABS_VOICE_ID: check it in tools/replay/.env',
}

async function elevenlabs(p, text, context, file) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(p.voiceId)}?output_format=${FORMAT}`, {
    method: 'POST',
    headers: { 'xi-api-key': p.key, 'content-type': 'application/json' },
    body: JSON.stringify({ text, model_id: p.model, voice_settings: p.settings, ...context }),
  })
  if (!res.ok) throw new Error(`ElevenLabs HTTP ${res.status}: ${FIXES[res.status] ?? 'unexpected error, see https://elevenlabs.io/docs/api-reference/text-to-speech'}. Render stopped, no fallback to say.`)
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()))
}

let provider, synthesized = 0

function chosen() {
  if (provider) return provider
  provider = resolveProvider()
  console.log(provider.name === 'say' ? `voice: macOS say (${provider.voice})` : `voice: ElevenLabs voice ${provider.voiceId}, model ${provider.model}, ${JSON.stringify(provider.settings)}`)
  return provider
}

/** Characters sent to ElevenLabs so far in this run (cache hits cost none). */
export const charsSynthesized = () => synthesized

/**
 * Speaks `text` (with pause markup, see narration.mjs) to an audio file and returns its path; ElevenLabs audio is cached in CACHE, `say` audio goes to `dir/name.aiff`.
 * `near` is the previous and next beat's narration, sent as continuity context where the model allows it.
 */
export async function synthesize(text, dir, name, near = {}) {
  const provider = chosen()
  if (provider.name === 'say') {
    const file = path.join(dir, `${name}.aiff`)
    execFileSync('say', ['-v', provider.voice, '-r', SAY_RATE, '-o', file, forSay(text)])
    return file
  }
  const spoken = forModel(text, provider.model)
  const context = {}
  if (takesContext(provider.model)) {
    if (near.previous) context.previous_text = plain(near.previous).slice(-CONTEXT_CHARS)
    if (near.next) context.next_text = plain(near.next).slice(0, CONTEXT_CHARS)
  }
  const file = path.join(CACHE, `${cacheKey(provider, spoken, context)}.mp3`)
  if (fs.existsSync(file)) { console.log(`${name}: cache hit, ${spoken.length} chars`); return file }
  fs.mkdirSync(CACHE, { recursive: true })
  await elevenlabs(provider, spoken, context, file)
  synthesized += spoken.length
  console.log(`${name}: synthesized ${spoken.length} chars`)
  return file
}
