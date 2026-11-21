import test from 'node:test'
import assert from 'node:assert/strict'
import { sentences, captionChunks, MAX_CHARS } from './captions.mjs'

test('splits on sentence ends, not on abbreviations, initials or Next.js', () => {
  assert.deepEqual(sentences('It builds a Next.js app. Then I check it at 6:57 p.m. and e.g. the U.S. docs. Done!'), ['It builds a Next.js app.', 'Then I check it at 6:57 p.m. and e.g. the U.S. docs.', 'Done!'])
})

test('a lowercase word after the dot is not a boundary', () => {
  assert.deepEqual(sentences('Version 1. then more. Fine.'), ['Version 1. then more.', 'Fine.'])
})

test('long sentences split at clauses and every piece fits two lines', () => {
  const long = 'So I click View spec, and it opens the file at that commit; then I read the scoring section, which is the part that matters, because the child wants a brand new medal table next to my old scoring, and that is not what I asked for at all, so I send it back.'
  const chunks = captionChunks(long)
  assert.ok(chunks.length > 1)
  for (const c of chunks) assert.ok(c.length <= MAX_CHARS, c)
  assert.equal(chunks.join(' ').replace(/\s+/g, ' '), long)
})

test('short sentences are joined, long text is never cut mid-word', () => {
  assert.deepEqual(captionChunks('Okay. Right. Done.'), ['Okay. Right. Done.'])
  const words = Array.from({ length: 80 }, (_, i) => `word${i}`).join(' ')
  for (const c of captionChunks(words)) assert.ok(!/^\S*\s$/.test(c) && c.split(' ').every((w) => /^word\d+$/.test(w)))
})
