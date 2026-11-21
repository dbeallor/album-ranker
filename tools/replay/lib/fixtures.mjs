// The recorded data a timeline replays: gantt sessions, the specs at each commit and the PR's changes detail.
import fs from 'fs'
import os from 'os'
import path from 'path'

const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'))

/** The Details sections of a spec, cut the way the dashboard cuts them. */
async function specSections(markdown) {
  const { specDetail } = await import(path.join(os.homedir(), '.collective-wisdom/scripts/dashboard/details.ts'))
  return specDetail(markdown)
}

/** `fixtures` for `stateAt`, read from a session's fixture directory (`gantt/*.json`, `spec-<sha>.md`, `live-api.json`). */
export async function loadFixtures(dir) {
  const sessions = Object.fromEntries(fs.readdirSync(path.join(dir, 'gantt')).map((f) => read(path.join(dir, 'gantt', f))).map((s) => [s.sessionId, s]))
  const live = read(path.join(dir, 'live-api.json'))
  const specs = {}
  for (const f of fs.readdirSync(dir).filter((n) => /^spec-(?:[A-Z]+-\d+-)?[0-9a-f]{7}\.md$/.test(n))) specs[f.slice(-10, -3)] = await specSections(fs.readFileSync(path.join(dir, f), 'utf8'))
  for (const row of live.status.flatMap((g) => g.rows)) if (row.detail?.kind === 'spec') specs[row.specUrl.match(/blob\/([0-9a-f]{7})/)[1]] = row.detail.sections
  const prDetails = Object.fromEntries(live.merged.map(({ detail, prUrl }) => [prUrl.split('/').pop(), detail]))
  return { sessions, specs, prDetails }
}
