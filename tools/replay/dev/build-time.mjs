// Prints a timeline's active build time: the intervals, the total, and the elapsed build time at every command.
// Check every build-time phrase in a narration against this. Usage: node dev/build-time.mjs timeline/2026-11-21.json [story/2026-11-21.mjs]
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { activeIntervals, elapsedAt, totalActive } from '../lib/active-time.mjs'
import { loadActiveFixtures } from '../lib/fixtures.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const file = process.argv[2]
if (!file) { console.error('usage: node dev/build-time.mjs timeline/<date>.json'); process.exit(1) }
const timeline = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'))
const date = path.basename(file, '.json')
const fx = loadActiveFixtures(path.join(ROOT, 'fixtures', date))
const iv = activeIntervals(timeline, fx)
const fmtHms = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` }
const iso = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19)

console.log(`idle gap ${(timeline.activeTime?.idleGapMs ?? 300000) / 60000} min`)
console.log('active intervals (UTC):')
for (const [a, b] of iv) console.log(`  ${iso(a)} to ${iso(b)}  ${fmtHms(b - a)}`)
console.log(`total active: ${fmtHms(totalActive(iv))}  (wall-clock span ${fmtHms(Date.parse(timeline.snapshot.takenAt) - Date.parse(timeline.commands[0].t))})\n`)
console.log('build time at each command:')
for (const c of timeline.commands) console.log(`  ${fmtHms(elapsedAt(iv, Date.parse(c.t)))}  ${iso(Date.parse(c.t))}  ${c.control.padEnd(8)} ${c.text.slice(0, 60)}`)
