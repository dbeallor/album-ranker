import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveProvider, cacheKey } from './voice.mjs'

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
