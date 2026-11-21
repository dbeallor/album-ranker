import test from 'node:test'
import assert from 'node:assert/strict'
import { forModel, plain, forSay, pauseCount } from './narration.mjs'

const t = 'Okay so {pause} I click it. {pause:long} Right. {tag:thoughtful} Done.'

test('v2 gets break tags, tags vanish', () => {
  assert.equal(forModel(t, 'eleven_multilingual_v2'), 'Okay so <break time="0.4s" /> I click it. <break time="0.8s" /> Right. Done.')
})

test('v3 gets pause and audio tags', () => {
  assert.equal(forModel(t, 'eleven_v3'), 'Okay so [pause] I click it. [long pause] Right. [thoughtful] Done.')
})

test('captions drop every marker and keep the sentence text', () => {
  assert.equal(plain(t), 'Okay so I click it. Right. Done.')
  assert.equal(plain('No markers here.'), 'No markers here.')
})

test('say gets silence commands, no tags', () => {
  assert.equal(forSay(t), 'Okay so [[slnc 400]] I click it. [[slnc 800]] Right. Done.')
})

test('counts pauses', () => assert.equal(pauseCount(t), 2))
