import test from 'node:test'
import assert from 'node:assert/strict'
import { injectShim } from './dash.mjs'

test('the clock and link shim go in ahead of the page scripts', () => {
  assert.match(injectShim('<head><title>x</title>'), /^<head><script>.*window\.__clock/s)
  assert.throws(() => injectShim('<html>'))
})
