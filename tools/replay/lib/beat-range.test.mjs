import test from 'node:test'
import assert from 'node:assert/strict'
import { beatRange } from './beat-range.mjs'

test('lists and ranges', () => {
  assert.deepEqual([...beatRange('1,4-6', 9)], [1, 4, 5, 6])
  assert.equal(beatRange('', 9), null)
})

test('bad entries throw', () => {
  assert.throws(() => beatRange('a', 9), /not a beat/)
  assert.throws(() => beatRange('3-12', 9), /outside/)
  assert.throws(() => beatRange('5-3', 9), /outside/)
})
