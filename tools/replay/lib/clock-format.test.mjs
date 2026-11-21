import test from 'node:test'
import assert from 'node:assert/strict'
import { fmtClock, fmtDur, ageLabel, lapseChip, instant } from './clock-format.mjs'

const t = (iso) => Date.parse(iso)

test('clock labels are New York time across midnight', () => {
  assert.equal(fmtClock(t('2026-11-20T23:57:00Z')), '6:57 p.m.')
  assert.equal(fmtClock(t('2026-11-21T05:06:00Z')), '12:06 a.m.')
})

test('the chip shows the range, never two equal labels, and nothing under a minute', () => {
  assert.equal(lapseChip(t('2026-11-20T23:57:00Z'), t('2026-11-21T05:06:00Z'), 'Later'), '⏩ Later · 6:57 p.m. → 12:06 a.m.')
  assert.equal(lapseChip(t('2026-11-20T23:03:10Z'), t('2026-11-20T23:03:50Z')), '')
  assert.equal(lapseChip(t('2026-11-20T23:03:50Z'), t('2026-11-20T23:04:50Z')), '⏩ 6:03 p.m. → 6:04 p.m.')
  assert.equal(lapseChip(t('2026-11-20T23:03:00Z'), t('2026-11-21T23:03:00Z')), '⏩ Nov 20, 6:03 p.m. → Nov 21, 6:03 p.m.')
})

test('durations and ages', () => {
  assert.equal(fmtDur(157000), '2m 37s')
  assert.equal(fmtDur(45000), '45s')
  assert.deepEqual([30000, 300000, 4 * 3600000, 3 * 86400000].map(ageLabel), ['now', '5m', '4h', '3d'])
})

test('HH:MM:SS rolls into the next day once the clock is past it', () => {
  const date = '2026-11-20'
  assert.equal(instant('23:57:00', date, 0), t('2026-11-20T23:57:00Z'))
  assert.equal(instant('03:41:00', date, t('2026-11-20T23:57:00Z')), t('2026-11-21T03:41:00Z'))
  assert.equal(instant('23:20:45', date, t('2026-11-20T23:21:00Z')), t('2026-11-20T23:20:45Z'))
  assert.equal(instant('2026-11-22T01:00:00Z', date, 0), t('2026-11-22T01:00:00Z'))
})
