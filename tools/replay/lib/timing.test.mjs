import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import { wordStart, estimateStart, cueLookup, specOf } from './timing.mjs'

// A recorded ElevenLabs alignment (with-timestamps) of: I open the pull request. <break time="0.4s" /> Description
const sample = JSON.parse(fs.readFileSync(new URL('./timing.sample.json', import.meta.url), 'utf8'))
const at = (i) => sample.character_start_times_seconds[i]

test('a word starts at the start time of its first character', () => {
  assert.equal(wordStart(sample, 'I open'), at(0))
  assert.equal(wordStart(sample, 'pull request'), at(sample.characters.join('').indexOf('pull')))
})

test('break tags in the alignment are skipped, the next word keeps its own time', () => {
  const j = sample.characters.join('')
  assert.equal(wordStart(sample, 'Description'), at(j.indexOf('Description')))
  assert.equal(wordStart(sample, 'request. description'), at(j.indexOf('request')))
  assert.equal(wordStart(sample, 'break'), null)
})

test('matching ignores case and needs a word boundary; nth picks the occurrence', () => {
  assert.equal(wordStart(sample, 'pen'), null)
  assert.equal(wordStart(sample, 'the', 1), at(sample.characters.join('').indexOf('the')))
  assert.equal(wordStart(sample, { word: 'the', nth: 2 }), null)
  assert.deepEqual(specOf({ word: 'x', nth: 3 }), { word: 'x', nth: 3 })
})

test('without an alignment the position in the plain text gives the estimate', () => {
  const say = 'One two {pause} three four.'
  assert.equal(estimateStart(say, 'One', 10), 0)
  assert.equal(estimateStart(say, 'three', 10), (8 / 'One two three four.'.length) * 10)
  assert.equal(estimateStart(say, 'zzz', 10), null)
})

test('a phrase that is not spoken throws', () => {
  assert.throws(() => cueLookup('Hello there.', null, 5)('Goodbye'), /not in the narration/)
  assert.equal(cueLookup('Hello there.', sample, 5)('Description') > 0, true)
})
