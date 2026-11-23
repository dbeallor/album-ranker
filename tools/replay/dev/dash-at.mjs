// node dev/dash-at.mjs <iso time> [ship|backlog|done|cos] [--session 2026-11-21] [--open ALBUM-2:agents|details ...]
// Serves only the dashboard with stateAt(<iso time>) and the fake clock, and screenshots it to out/dash-at/.
import fs from 'fs'
import http from 'http'
import path from 'path'
import { chromium } from 'playwright-core'
import { loadDash, dashRoutes } from '../lib/dash.mjs'
import { loadFixtures } from '../lib/fixtures.mjs'
import { stateAt } from '../lib/state-at.mjs'
import { buttonSelector, tabSelector } from '../lib/buttons.mjs'

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..')
const CHROME_PATH = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const [iso, ...rest] = process.argv.slice(2)
const tab = rest.find((a) => ['ship', 'backlog', 'done', 'cos'].includes(a)) ?? 'ship'
const opens = rest.flatMap((a, i) => (rest[i - 1] === '--open' ? [[a.slice(0, a.lastIndexOf(':')), a.slice(a.lastIndexOf(':') + 1)]] : []))
const session = rest.find((a, i) => rest[i - 1] === '--session') ?? '2026-11-21'
if (!iso || Number.isNaN(Date.parse(iso))) throw new Error('usage: dash-at.mjs <iso time> [tab] [--session 2026-11-21] [--open ALBUM-2:agents]')

const timeline = JSON.parse(fs.readFileSync(path.join(ROOT, `timeline/${session}.json`), 'utf8'))
const fixtures = await loadFixtures(path.join(ROOT, `fixtures/${session}`))
const timeMs = Date.parse(iso)
const dash = await loadDash(path.join(ROOT, '../../.agent-team'))
const route = dashRoutes(dash, () => stateAt(timeMs, timeline, fixtures))
const srv = http.createServer((req, res) => route(req, res) || (res.writeHead(404), res.end())).listen(0)

const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true })
const page = await browser.newPage({ viewport: { width: 1160, height: 1000 }, timezoneId: 'America/New_York', locale: 'en-US' })
await page.addInitScript((t) => { window.__clock = t }, timeMs)
await page.goto(`http://127.0.0.1:${srv.address().port}/dash.html`)
await page.waitForSelector('.tabs .pill:not(:empty)')
await page.locator(tabSelector(tab)).click()
for (const [ticket, view] of opens) await page.locator(buttonSelector(view, ticket, tab === 'done' ? 'merged' : 'ticket')).click()
await page.waitForTimeout(300)
const out = path.join(ROOT, 'out/dash-at', `${iso.replace(/[:]/g, '')}-${tab}.png`)
fs.mkdirSync(path.dirname(out), { recursive: true })
await page.screenshot({ path: out, fullPage: true })
console.log(out)
await browser.close()
srv.close()
