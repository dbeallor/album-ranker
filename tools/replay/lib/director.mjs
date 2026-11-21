// What a story can do on the stage: move the clock, type, press the dashboard's real controls, open GitHub in the browser pane.
// `launch` must run first. The dashboard is always drawn from `stateAt(clock)`, and the clock only moves forward through `clock` and `ff`.
import fs from 'fs'
import http from 'http'
import path from 'path'
import { chromium } from 'playwright-core'
import { loadDash, dashRoutes } from './dash.mjs'
import { loadFixtures } from './fixtures.mjs'
import { stateAt } from './state-at.mjs'
import { buttonSelector, commandFor, tabSelector } from './buttons.mjs'
import * as rec from './recorder.mjs'

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..')
const CHROME_PATH = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const FF_STEP = 250
const DASH_TAB = { id: 'dash', title: 'Agent team', kind: 'dash', url: '', favicon: 'dash' }

let page, browser, server, timeline, fixtures, repoUrl, tree
const ui = { clock: 0, lastActive: 0, busy: false, wait: null, waitSince: 0, children: {}, tabs: [], cx: 1500, cy: 900, shown: {} }

const iso = (s) => (typeof s === 'number' ? s : Date.parse(s.length <= 8 ? `${ui.date}T${s}Z` : s))
const ev = (fn, arg) => page.evaluate(fn, arg)
const dframe = () => page.frames().find((f) => f.url().includes('dash.html'))

const fmtClock = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }).replace(' AM', ' a.m.').replace(' PM', ' p.m.')
const fmtDur = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}
const ageLabel = (ms) => (ms < 60000 ? 'now' : ms < 3600000 ? `${Math.floor(ms / 60000)}m` : `${Math.floor(ms / 3600000)}h`)

/** Starts the server, the browser and the stage for a story: `{ date, timeline, fixtures, dashUrl, tree, setup }` (paths relative to tools/replay). */
export async function launch(meta, framesDir) {
  ui.date = meta.date
  timeline = JSON.parse(fs.readFileSync(path.join(ROOT, meta.timeline), 'utf8'))
  fixtures = await loadFixtures(path.join(ROOT, meta.fixtures))
  repoUrl = timeline.repo.url
  tree = meta.tree
  ui.fixturesDir = path.join(ROOT, meta.fixtures)
  const dash = await loadDash(path.join(ROOT, '../../.agent-team'))
  const route = dashRoutes(dash, () => stateAt(ui.clock, timeline, fixtures))
  server = http.createServer((req, res) => {
    if (route(req, res)) return
    if (req.url.split('?')[0] === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(fs.readFileSync(path.join(ROOT, 'static/stage.html'))) }
    else { res.writeHead(404); res.end() }
  }).listen(0)
  browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true })
  page = await browser.newPage({ viewport: { width: 1920, height: 1280 }, timezoneId: 'America/New_York', locale: 'en-US' })
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  await page.waitForFunction(() => window.S)
  await dframe().waitForFunction(() => typeof window.__poll === 'function')
  ui.dashUrl = meta.dashUrl
  await ev((s) => S.setup(s), meta.setup)
  await ev(() => S.browserTabs([]))
  rec.begin(page, framesDir)
}

export async function close() { await browser.close(); server.close() }

// ---------- clock ----------

async function syncSidebar() {
  const age = ageLabel(ui.clock - ui.lastActive)
  const waited = Math.max(1, Math.floor((ui.clock - ui.waitSince) / 60000))
  const next = ui.busy ? { section: 'working', label: 'Working', age } : ui.wait ? { section: 'working', label: `Waiting ${waited}m`, age } : { section: 'settled', age }
  const key = JSON.stringify(next)
  if (ui.shown.sidebar !== key) { ui.shown.sidebar = key; await ev((o) => S.setSidebarStatus(o), next) }
}

/** The run of a child (`[start, end]`) that is going on at the clock, if any. */
const currentRun = (c) => c.runs.find(([a, b]) => a <= ui.clock && ui.clock < b)

async function syncCards() {
  for (const c of Object.values(ui.children)) {
    const run = currentRun(c)
    const lastEnd = Math.max(...c.runs.map(([, b]) => b).filter((b) => b <= ui.clock), -Infinity)
    const patch = run || lastEnd === -Infinity
      ? { status: 'running', timeLabel: fmtDur(ui.clock - (run ? run[0] : c.runs[0][0])), subtitle: c.subtitle, model: c.model }
      : { status: 'finished', timeLabel: fmtClock(lastEnd), subtitle: c.doneSubtitle ?? c.subtitle, model: c.model }
    const key = JSON.stringify(patch)
    if (c.shown !== key) { c.shown = key; await ev(([id, p]) => S.updateChildCard(id, p), [c.id, patch]) }
  }
  const w = ui.wait && ui.children[ui.wait]
  const run = w && currentRun(w)
  if (!run) ui.wait = null
  const bar = run ? { title: w.title, elapsed: fmtDur(ui.clock - run[0]) } : null
  const key = JSON.stringify(bar)
  if (ui.shown.wait !== key) { ui.shown.wait = key; await ev((b) => S.setWaitBar(b), bar) }
}

async function refresh() {
  await dframe().evaluate((t) => { window.__clock = t; return window.__poll() }, ui.clock)
  await syncCards()
  await syncSidebar()
}

/** Jumps the clock to `time` (`HH:MM:SS` UTC on the story's date, or an ISO string). Only for moments the viewer does not watch pass. */
export async function clock(time) {
  ui.clock = iso(time)
  ui.lastActive ||= ui.clock
  await refresh()
}

/**
 * Runs the clock forward to `time` while frames are captured: the dashboard is polled every step, so bars grow, rows appear and the timers tick.
 * Lasts `ms`, or until `until` (a fraction of the beat's narration).
 */
export async function ff(time, { ms, until } = {}) {
  const from = ui.clock, to = iso(time)
  const total = ms ?? rec.msUntil(until)
  const steps = Math.max(1, Math.round(total / FF_STEP))
  if (!rec.recording()) { await clock(to); return }
  for (let i = 1; i <= steps; i++) {
    ui.clock = from + ((to - from) * i) / steps
    await ev((t) => S.timelapse(t), `⏩ ${fmtClock(ui.clock)} → ${fmtClock(to)}`)
    await refresh()
    await rec.hold(FF_STEP)
  }
  await ev(() => S.timelapse(''))
  await clock(to)
}

// ---------- cursor ----------

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

async function moveTo(x, y, ms = 700) {
  const x0 = ui.cx, y0 = ui.cy
  await rec.anim(ms, async (p) => {
    const e = ease(p)
    ui.cx = x0 + (x - x0) * e; ui.cy = y0 + (y - y0) * e
    await ev(([a, b]) => S.cursor(a, b), [ui.cx, ui.cy])
  })
}

async function ripple() {
  await rec.anim(280, (p) => ev((q) => S.ripple(q), p))
  await ev(() => S.ripple(0))
}

async function point(loc) {
  await loc.waitFor({ timeout: 8000 })
  await loc.scrollIntoViewIfNeeded()
  const b = await loc.boundingBox()
  return { x: b.x + Math.min(b.width / 2, 60), y: b.y + b.height / 2 }
}

const dashLoc = (sel, text) => {
  const loc = page.frameLocator('#dash').locator(sel).filter({ visible: true })
  return (text ? loc.filter({ hasText: text }) : loc).first()
}

async function clickLoc(loc, { real = true } = {}) {
  const p = await point(loc)
  await moveTo(p.x, p.y)
  await ripple()
  if (real) { await loc.click(); await rec.hold(rec.STEP) }
}

/** Moves the cursor to a control of the dashboard and clicks it. `text` picks among several matches. */
const clickDash = (sel, text) => clickLoc(dashLoc(sel, text))

/** Moves the cursor to a control of the stage (a browser tab, a PR sub-tab) and clicks it. The stage has no handlers, so the caller applies the effect. */
const clickStage = (sel) => clickLoc(page.locator(sel).first(), { real: false })

export const dashTab = (tab) => clickDash(tabSelector(tab))

/** Opens the Agents or Details panel (`kind`) of a ticket's card, unless it is open already. `scope` is `merged` on the Done tab. */
export async function openPanel(kind, ticket, scope = 'ticket') {
  const sel = buttonSelector(kind, ticket, scope)
  const open = await dashLoc(sel).getAttribute('aria-expanded')
  if (open === 'true') await rec.hold(rec.STEP)
  else await clickDash(sel)
}

export async function scrollDash(y, ms = 900) {
  const y0 = await dframe().evaluate(() => window.scrollY)
  await rec.anim(ms, (p) => dframe().evaluate((v) => window.scrollTo(0, v), y0 + (y - y0) * ease(p)))
}

// ---------- chat ----------

const touch = async () => { ui.lastActive = ui.clock; await syncSidebar() }

/** Types `text` into the composer (after `prefix`, already there), then sends it. */
export async function type(text, { attach, prefix = '', ms } = {}) {
  const total = ms ?? Math.min(4800, Math.max(1000, text.length * 55))
  await rec.anim(total, (p) => ev(([t, a]) => S.composer(t, a), [prefix + text.slice(0, Math.round(p * text.length)), attach]))
  await send(prefix + text, attach)
}

/** Sends the composer's draft as a user message. */
async function send(text, attach) {
  await rec.hold(350)
  await ev(([t, a]) => S.addUser(t, a), [text, attach])
  await touch()
  await rec.hold(300)
}

/** What T3 does when an Approve, Changes or Start shipping link is clicked: it opens the thread with the command in the composer. */
async function applyLink(kind, ticket) {
  const href = await dframe().evaluate(() => window.__opened)
  if (!href?.startsWith('t3code://')) throw new Error(`${kind} ${ticket}: the dashboard control did not open a t3code link (${href})`)
  await dframe().evaluate(() => { window.__opened = undefined })
  const command = commandFor(kind, ticket)
  await ev((t) => S.composer(t), command)
  await rec.hold(600)
  return command
}

/** Clicks the real Approve or Start shipping button of `ticket`, then sends the command the link put in the composer. */
export async function press(kind, ticket) {
  await clickDash(buttonSelector(kind, ticket))
  await send(await applyLink(kind, ticket))
}

/** Clicks the real Changes button of `ticket`, then types `rest` after the prefilled command and sends it. */
export async function pressChanges(ticket, rest) {
  await clickDash(buttonSelector('changes', ticket))
  const prefix = await applyLink('changes', ticket)
  await type(rest, { prefix })
}

/** Shows or hides the chief's `Working` indicator, for a turn that goes on while the clock runs. */
export async function thinking(on) {
  ui.busy = on
  await ev((o) => S.working(o), on)
  ui.shown.sidebar = undefined
  await syncSidebar()
}

/** The chief thinks, then answers with `markdown`, shown block by block. */
export async function reply(markdown, { think = 1400, reveal = 3600 } = {}) {
  await thinking(true)
  await rec.hold(think)
  const blocks = await ev((m) => S.addAssistant(m), markdown)
  await thinking(false)
  const per = Math.min(450, reveal / blocks)
  for (let k = 1; k <= blocks; k++) { await ev((q) => S.reveal(q), k); await rec.hold(per) }
  await touch()
}

/** The dim `Worked for Ns` line after the chief's turn. */
export const worked = (label) => ev((l) => S.addWorked(l), label)

/**
 * A child thread card in the chat: `{ id, title, subtitle, model, runs }`, `runs` being the `[start, end]` clock times of the child's turns.
 * The card counts up during a run and says when it finished between runs; `doneSubtitle` replaces `subtitle` once it has.
 */
export async function card(c) {
  const child = { ...c, runs: c.runs.map(([a, b]) => [iso(a), iso(b)]) }
  ui.children[c.id] = child
  await ev((x) => S.addChildCard(x), { id: c.id, title: c.title, subtitle: c.subtitle, model: c.model, status: 'running', timeLabel: '0s' })
  await syncCards()
}

/** Patches a card, for example `{ model: 'Sonnet 5.5' }`. */
export async function patchCard(id, patch) { Object.assign(ui.children[id], patch); await syncCards() }

/** Shows the wait bar for a child's current run (`null` clears it) and the sidebar's `Waiting` status with it; both end when the run does. */
export async function waitOn(id) {
  ui.wait = id
  ui.waitSince = ui.clock
  ui.shown.wait = undefined
  await syncCards(); await syncSidebar()
}

export const intro = (on) => ev((o) => S.intro(o), on)

// ---------- GitHub in the browser pane ----------

/** Clicks the dashboard's `a.action` of a ticket (View spec or View PR) and returns its url. The dashboard opens it in a new tab, so the click itself is not delivered. */
async function clickAction(ticket, label) {
  const loc = dashLoc(buttonSelector('spec', ticket), label)
  await clickLoc(loc, { real: false })
  return loc.getAttribute('href')
}

async function openGh(tab, html, url) {
  ui.tabs.push(tab)
  await ev(([t, d]) => S.browserTabs([d, ...t]), [ui.tabs, { ...DASH_TAB, url: ui.dashUrl }])
  await ev(([id, h]) => S.ghPage(id, h), [tab.id, html])
  await ev((id) => { S.browserSelect(id); S.browserExpand(true) }, tab.id)
  await rec.hold(900)
  return url
}

async function scrollGh(y, ms = 1400) {
  const y0 = await ev(() => document.querySelector('.ghp.on .gsc').scrollTop)
  await rec.anim(ms, (p) => ev((v) => S.ghScroll(v), y0 + (y - y0) * ease(p)))
}

/** Scrolls the open GitHub page to the heading containing `text`. */
export async function scrollToHeading(text, ms = 1800) {
  await scrollGh(await ev((t) => S.ghScrollTo(t), text), ms)
}

/** Clicks the dashboard's View spec for `ticket` and shows the spec as of commit `sha` (short, from the timeline) in a new browser tab, expanded. */
export async function viewSpec(ticket, sha) {
  const url = await clickAction(ticket, 'View spec')
  const t = timeline.tickets[ticket]
  const full = timeline.events.map((e) => e.set.specSha).find((s) => s?.startsWith(sha))
  const expected = `${repoUrl}/blob/${full}/${t.specPath}`
  if (url !== expected) throw new Error(`View spec ${ticket}: the dashboard links ${url}, expected ${expected}`)
  const md = fs.readFileSync(path.join(ui.fixturesDir, `spec-${sha}.md`), 'utf8')
  const html = await ev((a) => S.ghBlobPage(a), { path: t.specPath, sha, md, lines: md.split('\n').length - 1, size: Buffer.byteLength(md), tree: [...tree, t.specPath] })
  const title = `album-ranker/${t.specPath} at ${sha} · dbeallor/album-ranker`
  await openGh({ id: `spec-${sha}`, title, kind: 'gh', url, favicon: 'github' }, html, url)
}

/** Clicks the dashboard's View PR for `ticket` and shows the PR (Conversation) in a new browser tab, expanded. */
export async function viewPr(ticket) {
  const url = await clickAction(ticket, 'View PR')
  const pr = JSON.parse(fs.readFileSync(path.join(ui.fixturesDir, 'pr13.json'), 'utf8'))
  if (url !== `${repoUrl}/pull/${pr.number}`) throw new Error(`View PR ${ticket}: the dashboard links ${url}`)
  const md = fs.readFileSync(path.join(ui.fixturesDir, 'spec-42e9abb.md'), 'utf8')
  const diffLines = md.replace(/\n$/, '').split('\n')
  const specPath = timeline.tickets[ticket].specPath
  const html = await ev((a) => S.ghPrPage(a), { pr: { title: pr.title, number: pr.number, headRefName: pr.headRefName }, bodyMd: pr.body, comments: pr.comments, files: [{ path: specPath, additions: diffLines.length, deletions: 0 }], diffLines, checks: [], mergeable: true })
  await openGh({ id: `pr-${pr.number}`, title: `${pr.title} by dbeallor · Pull Request #${pr.number} · dbeallor/album-ranker`, kind: 'gh', url, favicon: 'github' }, html, url)
}

/** Scrolls the open GitHub page to `fraction` of its length. */
export async function scrollGhBy(fraction, ms) {
  const [height, view] = await ev(() => [S.ghScrollHeight(), document.querySelector('.ghp.on .gsc').clientHeight])
  await scrollGh(Math.round((height - view) * fraction), ms)
}

/** Clicks the PR page's Files changed tab. */
export async function filesChanged() {
  await clickStage('.ghp.on .g-tabs [data-n="1"]')
  await ev(() => S.ghTabSwitch(1))
  await rec.hold(700)
}

/** Clicks the Agent team tab to go back to the dashboard. */
export async function backToDash() {
  await clickStage('#tabs .tab[data-tab-id="dash"]')
  await ev(() => { S.browserSelect('dash'); S.browserExpand(false) })
  await refresh()
  await rec.hold(500)
}

/** Opens the Agent team tab (the dashboard) in the browser pane, as `start the team` does. */
export async function openDashTab() {
  await ev(([d]) => S.browserTabs([d]), [{ ...DASH_TAB, url: ui.dashUrl }])
  await refresh()
}
