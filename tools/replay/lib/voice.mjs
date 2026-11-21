// Text to speech: the user's cloned ElevenLabs voice when a key and voice id are configured, else the macOS `say` voice.
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { execFileSync } from 'child_process'

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..')
export const CACHE = path.join(ROOT, 'out', 'voice-cache')
const SETTINGS = { stability: 0.5, similarity_boost: 0.8, style: 0, use_speaker_boost: true }
const MODEL = 'eleven_multilingual_v2'
const FORMAT = 'mp3_44100_128'
const KEYCHAIN_SERVICE = 'elevenlabs-api-key'
const SAY_VOICE = 'Samantha'
const SAY_RATE = '178'

const ENV_FILE = path.join(ROOT, '.env')
if (fs.existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE)

function keychainKey() {
  try { return execFileSync('security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return '' }
}

/** Picks the provider: ElevenLabs needs a key (env, then Keychain) and a voice id; `TTS=say` or a missing one gives `say`. */
export function resolveProvider(env = process.env, keychain = keychainKey) {
  if (env.TTS === 'say') return { name: 'say', voice: env.VOICE || SAY_VOICE }
  const voiceId = env.ELEVENLABS_VOICE_ID
  const key = voiceId && (env.ELEVENLABS_API_KEY || keychain())
  if (!key) return { name: 'say', voice: env.VOICE || SAY_VOICE }
  return { name: 'elevenlabs', voiceId, key, model: env.ELEVENLABS_MODEL || MODEL }
}

/** Cache key for one synthesized text: anything that changes the sound changes the key. */
export const cacheKey = (p, text) => crypto.createHash('sha256').update(JSON.stringify([p.name, p.voiceId, p.model, SETTINGS, FORMAT, text])).digest('hex').slice(0, 32)

const FIXES = {
  401: 'the API key was rejected: store a valid key with `security add-generic-password -a "$USER" -s elevenlabs-api-key -w <key> -U` or set ELEVENLABS_API_KEY',
  402: 'the ElevenLabs plan has no credits left for this: upgrade or wait for the quota reset',
  429: 'ElevenLabs rate limit or quota reached: wait and re-run (finished beats are cached), or render with TTS=say',
  422: 'ElevenLabs rejected the request, usually an invalid ELEVENLABS_VOICE_ID: check it in tools/replay/.env',
}

async function elevenlabs(p, text, file) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(p.voiceId)}?output_format=${FORMAT}`, {
    method: 'POST',
    headers: { 'xi-api-key': p.key, 'content-type': 'application/json' },
    body: JSON.stringify({ text, model_id: p.model, voice_settings: SETTINGS }),
  })
  if (!res.ok) throw new Error(`ElevenLabs HTTP ${res.status}: ${FIXES[res.status] ?? 'unexpected error, see https://elevenlabs.io/docs/api-reference/text-to-speech'}. Render stopped, no fallback to say.`)
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()))
}

let provider, synthesized = 0

function chosen() {
  if (provider) return provider
  provider = resolveProvider()
  console.log(provider.name === 'say' ? `voice: macOS say (${provider.voice})` : `voice: ElevenLabs voice ${provider.voiceId}, model ${provider.model}`)
  return provider
}

/** Characters sent to ElevenLabs so far in this run (cache hits cost none). */
export const charsSynthesized = () => synthesized

/** Speaks `text` to an audio file and returns its path; ElevenLabs audio is cached in CACHE, `say` audio goes to `dir/name.aiff`. */
export async function synthesize(text, dir, name) {
  const provider = chosen()
  if (provider.name === 'say') {
    const file = path.join(dir, `${name}.aiff`)
    execFileSync('say', ['-v', provider.voice, '-r', SAY_RATE, '-o', file, text])
    return file
  }
  const file = path.join(CACHE, `${cacheKey(provider, text)}.mp3`)
  if (fs.existsSync(file)) { console.log(`${name}: cache hit, ${text.length} chars`); return file }
  fs.mkdirSync(CACHE, { recursive: true })
  await elevenlabs(provider, text, file)
  synthesized += text.length
  console.log(`${name}: synthesized ${text.length} chars`)
  return file
}
