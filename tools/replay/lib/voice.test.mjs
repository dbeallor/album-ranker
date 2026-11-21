import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveProvider, cacheKey, voiceSettings } from './voice.mjs'

const none = () => ''

test('ElevenLabs needs a voice id and a key, the env key wins over the Keychain', () => {
  assert.equal(resolveProvider({ ELEVENLABS_VOICE_ID: 'v', ELEVENLABS_API_KEY: 'env' }, () => 'kc').key, 'env')
  assert.equal(resolveProvider({ ELEVENLABS_VOICE_ID: 'v' }, () => 'kc').key, 'kc')
  assert.equal(resolveProvider({ ELEVENLABS_VOICE_ID: 'v' }, none).name, 'say')
  assert.equal(resolveProvider({ ELEVENLABS_API_KEY: 'k' }, none).name, 'say')
})

test('TTS=say forces the fallback and VOICE picks the say voice', () => {
  const p = resolveProvider({ TTS: 'say', VOICE: 'Daniel', ELEVENLABS_VOICE_ID: 'v', ELEVENLABS_API_KEY: 'k' }, none)
  assert.deepEqual(p, { name: 'say', voice: 'Daniel' })
})

test('the cache key changes with the text, voice and model, not with the key', () => {
  const p = resolveProvider({ ELEVENLABS_VOICE_ID: 'v', ELEVENLABS_API_KEY: 'a' }, none)
  const base = cacheKey(p, 'hello')
  assert.equal(cacheKey({ ...p, key: 'b' }, 'hello'), base)
  assert.notEqual(cacheKey(p, 'hello.'), base)
  assert.notEqual(cacheKey({ ...p, voiceId: 'w' }, 'hello'), base)
  assert.notEqual(cacheKey({ ...p, model: 'm' }, 'hello'), base)
})

test('voice settings default to the casual preset and the env overrides them', () => {
  assert.deepEqual(voiceSettings({}), { stability: 0.4, similarity_boost: 0.8, style: 0, speed: 0.92, use_speaker_boost: true })
  const s = voiceSettings({ ELEVENLABS_STABILITY: '0', ELEVENLABS_SIMILARITY: '0.9', ELEVENLABS_STYLE: '0.2', ELEVENLABS_SPEED: '0.8' })
  assert.deepEqual([s.stability, s.similarity_boost, s.style, s.speed], [0, 0.9, 0.2, 0.8])
})

test('out-of-range or non-numeric settings throw, speed is limited to 0.7 to 1.2', () => {
  assert.throws(() => voiceSettings({ ELEVENLABS_SPEED: '1.3' }), /ELEVENLABS_SPEED/)
  assert.throws(() => voiceSettings({ ELEVENLABS_SPEED: '0.5' }), /ELEVENLABS_SPEED/)
  assert.throws(() => voiceSettings({ ELEVENLABS_STABILITY: '2' }), /ELEVENLABS_STABILITY/)
  assert.throws(() => voiceSettings({ ELEVENLABS_STYLE: 'x' }), /ELEVENLABS_STYLE/)
})

test('the cache key changes with the settings and the neighbouring text', () => {
  const env = { ELEVENLABS_VOICE_ID: 'v', ELEVENLABS_API_KEY: 'a' }
  const a = resolveProvider(env, none), b = resolveProvider({ ...env, ELEVENLABS_SPEED: '0.8' }, none)
  assert.notEqual(cacheKey(a, 'hi'), cacheKey(b, 'hi'))
  assert.notEqual(cacheKey(a, 'hi'), cacheKey(a, 'hi', { next_text: 'x' }))
})
