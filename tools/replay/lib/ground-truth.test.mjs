import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { loadFixtures } from './fixtures.mjs'
import { stateAt } from './state-at.mjs'

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..')
const DIR = path.join(ROOT, 'fixtures/2026-11-21')
const timeline = JSON.parse(fs.readFileSync(path.join(ROOT, 'timeline/2026-11-21.json'), 'utf8'))
const fixtures = await loadFixtures(DIR)
const live = JSON.parse(fs.readFileSync(path.join(DIR, 'live-api.json'), 'utf8'))

// The capture's own clock and server fields are not part of the replay; sums of costs agree to float rounding.
const SKIPPED = new Set(['generatedAt', 'version', 'restartError', 'trackerError', 'theme'])
const MONEY = new Set(['cost', 'total'])

/** Every difference between the live /api payload and the replayed one, as `path: expected, got` lines. */
function differences(expected, got, where = '$') {
  const key = where.split('.').pop().replace(/\[\d+\]$/, '')
  if (SKIPPED.has(key)) return []
  if (typeof expected === 'number' && typeof got === 'number') {
    return Math.abs(expected - got) <= (MONEY.has(key) ? 1e-9 : 0) ? [] : [`${where}: ${expected}, got ${got}`]
  }
  if (Array.isArray(expected) && Array.isArray(got)) {
    const lines = expected.length === got.length ? [] : [`${where}: ${expected.length} items, got ${got.length}`]
    for (let i = 0; i < Math.min(expected.length, got.length); i++) lines.push(...differences(expected[i], got[i], `${where}[${i}]`))
    return lines
  }
  if (expected && got && typeof expected === 'object' && typeof got === 'object') {
    const keys = new Set([...Object.keys(expected), ...Object.keys(got)])
    return [...keys].flatMap((k) => (k in expected ? (k in got ? differences(expected[k], got[k], `${where}.${k}`) : [`${where}.${k}: ${JSON.stringify(expected[k]).slice(0, 80)}, missing`]) : [`${where}.${k}: not in the live payload, got ${JSON.stringify(got[k]).slice(0, 80)}`]))
  }
  return expected === got ? [] : [`${where}: ${JSON.stringify(expected)?.slice(0, 100)}, got ${JSON.stringify(got)?.slice(0, 100)}`]
}

test('the replay at the snapshot matches the live dashboard payload', () => {
  const got = stateAt(Date.parse(timeline.snapshot.takenAt), timeline, fixtures)
  const lines = differences(live, got)
  assert.equal(lines.length, 0, `${lines.length} differences from live-api.json:\n${lines.join('\n')}`)
})

test('the spec sections cut from the recorded markdown are the ones the dashboard served', async () => {
  const { specDetail } = await import(path.join(os.homedir(), '.collective-wisdom/scripts/dashboard/details.ts'))
  const rows = live.status.flatMap((g) => g.rows).filter((r) => r.detail?.kind === 'spec')
  assert.equal(rows.length, 5)
  for (const r of rows) {
    const sha = r.specUrl.match(/blob\/([0-9a-f]{7})/)[1]
    const file = fs.readdirSync(DIR).find((n) => n.endsWith(`-${sha}.md`))
    assert.deepEqual(specDetail(fs.readFileSync(path.join(DIR, file), 'utf8')), r.detail.sections, r.id)
  }
})
