// What a story can do on the stage: move the clock, type, press the dashboard's real controls, open GitHub in the browser pane.
// `launch` must run first. The dashboard is always drawn from `stateAt(clock)`, and the clock only moves forward through `clock`, `ff` and `later`.
// Every export a story calls is noted in the beat's action list (see `--dry` in README.md).
import fs from 'fs'
import http from 'http'
import path from 'path'
import { chromium } from 'playwright-core'
import { loadDash, dashRoutes } from './dash.mjs'
import { loadFixtures } from './fixtures.mjs'
import { stateAt } from './state-at.mjs'
import { buttonSelector, commandFor, tabSelector, locate } from './buttons.mjs'
import { parseDiff, layout } from './diff.mjs'
import { fmtClock, fmtDur, ageLabel, lapseChip, instant } from './clock-format.mjs'
import * as rec from './recorder.mjs'

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..')
const CHROME_PATH = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const FF_STEP = 250
const SCALE = 1920 / 1800
const MAX_GH_TABS = 3
const DASH_TAB = { id: 'dash', title: 'Agent team', kind: 'dash', url: '', favicon: 'dash' }

let page, browser, server, timeline, fixtures, repoUrl, tree
const ui = { clock: 0, lastActive: 0, busy: false, waits: [], commands: 0, waitSince: 0, children: {}, threads: [], tabs: [], cx: 1500, cy: 900, shown: {} }

const iso = (s) => instant(s, ui.date, ui.clock)
const ev = (fn, arg) => page.evaluate(fn, arg)
const dframe = () => page.frames().find((f) => f.url().includes('dash.html'))

const fmtArg = (a) => JSON.stringify(a, (k, v) => (typeof v === 'string' && v.length > 36 ? `${v.slice(0, 33)}...` : v)).slice(0, 110)
const act = (name, fn) => async (...args) => {
  rec.note(`${name}(${args.filter((a) => a !== undefined).map(fmtArg).join(', ')})`)
  return fn(...args)
}

/**
 * Starts the server, the browser and the stage for a story: `{ date, timeline, fixtures, dashUrl, tree, setup, sidebarThreads? }` (paths relative to tools/replay).
 * `dry` runs without writing frames.
 */
export async function launch(meta, framesDir, { dry = false } = {}) {
  ui.date = meta.date
  ui.thread = meta.setup.thread
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
  rec.begin(page, framesDir, { write: !dry })
  if (meta.sidebarThreads) await sidebarThreads(meta.sidebarThreads)
}

export async function close() { await browser.close(); server.close() }

// ---------- sidebar and cards ----------

/** The children the chief is waiting on that are running at the clock; the ones that finished drop out of the wait. */
const activeWaits = () => ui.waits.filter((id) => currentRun(ui.children[id]))

async function syncSidebar() {
  const age = ageLabel(ui.clock - ui.lastActive)
  const waiting = activeWaits().length > 0
  const waited = Math.max(1, Math.floor((ui.clock - ui.waitSince) / 60000))
  const next = ui.busy ? { section: 'working', label: 'Working', age } : waiting ? { section: 'working', label: `Waiting ${waited}m`, age } : { section: 'settled', age }
  const key = JSON.stringify(next)
  if (ui.shown.sidebar !== key) { ui.shown.sidebar = key; await ev((o) => S.setSidebarStatus(o), next) }
  const rows = ui.threads.filter((t) => t.created <= ui.clock).map((t) => ({ title: t.title, branch: t.branch, working: t.settled === null || ui.clock < t.settled, label: 'Working', age: ageLabel(ui.clock - t.created) }))
  const rowsKey = JSON.stringify(rows)
  if (ui.shown.threads !== rowsKey) { ui.shown.threads = rowsKey; await ev((r) => S.setSidebarThreads(r), rows) }
}

/**
 * The other top-level threads of the project, shown in the sidebar from when they were created: working until they settle, then counted in Settled.
 * Takes rows of the recorded `threads.json` (`title`, `createdAt`, `updatedAt`, `status`; a `running` thread never settles) or `{ title, createdAt, settledAt?, branch? }`. Child threads and the chief's own thread are left out.
 */
export const sidebarThreads = act('sidebarThreads', async (list) => {
  ui.threads = list.filter((t) => !t.parentThreadId && t.title !== ui.thread).map((t) => {
    const settled = t.settledAt ?? (t.status === 'running' ? null : t.updatedAt)
    return { title: t.title, branch: t.branch, created: iso(t.createdAt), settled: settled ? iso(settled) : null }
  })
  ui.shown.threads = undefined
  await syncSidebar()
})

/** The run of a child (`[start, end]`) that is going on at the clock, if any. */
const currentRun = (c) => c.runs.find(([a, b]) => a <= ui.clock && ui.clock < b)

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

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
  ui.waits = activeWaits()
  if (!ui.waits.length) ui.commands = 0
  const waited = ui.waits.map((id) => ui.children[id])
  const bar = !waited.length ? null
    : waited.length === 1 && !ui.commands ? { title: waited[0].title, elapsed: fmtDur(ui.clock - currentRun(waited[0])[0]) }
    : { label: `Waiting on ${plural(waited.length, 'subagent')}${ui.commands ? ` and ${plural(ui.commands, 'command')}` : ''}`, detail: waited.map((c) => c.title).join(', ') }
  const key = JSON.stringify(bar)
  if (ui.shown.wait !== key) { ui.shown.wait = key; await ev((b) => S.setWaitBar(b), bar) }
}

async function refresh() {
  await dframe().evaluate((t) => { window.__clock = t; return window.__poll() }, ui.clock)
  await syncCards()
  await syncSidebar()
}

// ---------- clock ----------

async function setClock(time) {
  const to = iso(time)
  if (to < ui.clock) throw new Error(`the clock only moves forward: ${time} is before ${new Date(ui.clock).toISOString()}`)
  ui.clock = to
  ui.lastActive ||= ui.clock
  await refresh()
}

/** Jumps the clock to `time` (`HH:MM:SS` UTC on the story's date, rolling into the next day once the clock is past it, or an ISO string). Only for moments the viewer does not watch pass. */
export const clock = act('clock', setClock)

async function fastForward(time, { ms, until, label } = {}) {
  const from = ui.clock, to = iso(time)
  if (to < from) throw new Error(`the clock only moves forward: ${time} is before ${new Date(from).toISOString()}`)
  const total = ms ?? (until === undefined ? 1500 : rec.msUntil(until))
  if (!rec.recording()) { await rec.hold(total); await setClock(to); return }
  const chip = lapseChip(from, to, label)
  const steps = Math.max(1, Math.round(total / FF_STEP))
  for (let i = 1; i <= steps; i++) {
    ui.clock = from + ((to - from) * i) / steps
    await ev((t) => S.timelapse(t), chip)
    await refresh()
    await rec.hold(FF_STEP)
  }
  await ev(() => S.timelapse(''))
  await setClock(to)
}

/**
 * Runs the clock forward to `time` while frames are captured: the dashboard is polled every step, so bars grow, rows appear and the timers tick.
 * Lasts `ms`, or until `until` (a fraction of the beat's narration). The time-lapse chip shows the clock range; a jump under a minute shows none.
 */
export const ff = act('ff', fastForward)

/** A long idle gap, such as the night between two work sessions: `ff` to `time` in about `ms` (default 2.2 s) with a `Later` chip, while the sidebar ages and the dashboard advance. */
export const later = act('later', (time, { ms = 2200 } = {}) => fastForward(time, { ms, label: 'Later' }))

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

async function scrollDashTo(y, ms = 900) {
  const y0 = await dframe().evaluate(() => window.scrollY)
  await rec.anim(ms, (p) => dframe().evaluate((v) => window.scrollTo(0, v), y0 + (y - y0) * ease(p)))
}

/** Scrolls the dashboard, with the animation, until `loc` is well inside the visible part of the browser pane. */
async function bringIntoView(loc) {
  const b = await loc.boundingBox()
  if (b.y >= 150 && b.y + b.height <= 1150) return
  const y0 = await dframe().evaluate(() => window.scrollY)
  await scrollDashTo(Math.max(0, y0 + (b.y - 420) / SCALE))
}

async function point(loc, inDash) {
  await loc.waitFor({ timeout: 8000 })
  if (inDash) await bringIntoView(loc)
  await loc.scrollIntoViewIfNeeded()
  const b = await loc.boundingBox()
  return { x: b.x + Math.min(b.width / 2, 60), y: b.y + b.height / 2 }
}

const dashLoc = (sel) => page.frameLocator('#dash').locator(sel).filter({ visible: true }).first()

async function clickLoc(loc, { real = true, inDash = false } = {}) {
  const p = await point(loc, inDash)
  await moveTo(p.x, p.y)
  await ripple()
  if (real) { await loc.click(); await rec.hold(rec.STEP) }
}

/** Checks that the dashboard offers `kind` (a `buttonSelector` kind) on `ticket`'s card at the clock, so a story that asks for a control that is not there fails with the reason. */
function offered(kind, ticket) {
  const at = locate(stateAt(ui.clock, timeline, fixtures), ticket)
  const when = new Date(ui.clock).toISOString()
  if (!at) throw new Error(`${kind} ${ticket}: the dashboard has no card for ${ticket} at ${when}`)
  if (!at.controls.includes(kind)) throw new Error(`${kind} ${ticket}: not offered at ${when}; the card is in ${at.group} (${at.tab} tab) and offers ${at.controls.join(', ')}`)
}

/** Moves the cursor to a control of the dashboard and clicks it. */
const clickDash = (sel, opts) => clickLoc(dashLoc(sel), { inDash: true, ...opts })

/** Moves the cursor to a control of the stage (a browser tab, a PR sub-tab) and clicks it. The stage has no handlers, so the caller applies the effect. */
const clickStage = (sel) => clickLoc(page.locator(sel).first(), { real: false })

/** Clicks a dashboard tab: `ship`, `backlog`, `done` or `cos`. */
export const dashTab = act('dashTab', (tab) => clickDash(tabSelector(tab)))

/**
 * Opens the Agents or Details panel (`kind`) of a ticket's card, unless it is open already: `openPanel('ALBUM-7', 'agents')`, `scope` `merged` on the Done tab.
 * The old argument order `openPanel('agents', 'ALBUM-7')` works too.
 */
export const openPanel = act('openPanel', async (a, b, c) => {
  const [ticket, kind] = ['agents', 'details'].includes(a) ? [b, a] : [a, b]
  offered(kind, ticket)
  const sel = buttonSelector(kind, ticket, c)
  const open = await dashLoc(sel).getAttribute('aria-expanded')
  if (open === 'true') await rec.hold(rec.STEP)
  else await clickDash(sel)
})

/** Scrolls the dashboard to `y` (CSS pixels of the dashboard page). */
export const scrollDash = act('scrollDash', scrollDashTo)

// ---------- chat ----------

const touch = async () => { ui.lastActive = ui.clock; await syncSidebar() }

async function typeText(text, { attach, prefix = '', ms } = {}) {
  const total = ms ?? Math.min(4800, Math.max(1000, text.length * 55))
  await rec.anim(total, (p) => ev(([t, a]) => S.composer(t, a), [prefix + text.slice(0, Math.round(p * text.length)), attach]))
  await send(prefix + text, attach)
}

/** Types `text` into the composer (after `prefix`, already there), then sends it. */
export const type = act('type', typeText)

/** Sends the composer's draft as a user message. */
async function send(text, attach) {
  await rec.hold(350)
  await ev(([t, a]) => S.addUser(t, a), [text, attach])
  await touch()
  await rec.hold(300)
}

/**
 * A message the user did not type, such as the agent-sent reset message: it appears as sent at once, no typing.
 * `sender` puts a small label above it.
 */
export const sent = act('sent', async (text, { sender, attach } = {}) => {
  await ev(([t, a, s]) => S.addUser(t, a, s), [text, attach, sender])
  await touch()
  await rec.hold(500)
})

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

/** Clicks the real Approve or Start shipping button (`approve` or `todo`) of `ticket`, then sends the command the link put in the composer. */
async function pressButton(kind, ticket) {
  offered(kind, ticket)
  await clickDash(buttonSelector(kind, ticket))
  await send(await applyLink(kind, ticket))
}

/** Clicks the real Changes button of `ticket`, then types `rest` after the prefilled `changes N: ` and sends it. */
async function pressChangesButton(ticket, rest) {
  offered('changes', ticket)
  await clickDash(buttonSelector('changes', ticket))
  const prefix = await applyLink('changes', ticket)
  await typeText(rest, { prefix })
}

/** Clicks Approve on `ticket`'s card (scrolling the board to it first), and the composer gets `approve N` and sends it. */
export const approve = act('approve', (ticket) => pressButton('approve', ticket))

/** Clicks Changes on `ticket`'s card; the composer is prefilled with `changes N: ` and `restOfText` is typed after it. */
export const changes = act('changes', pressChangesButton)

/** Clicks Start shipping on `ticket`'s card (Backlog tab); the composer gets `mark N todo` and sends it. */
export const startShipping = act('startShipping', (ticket) => pressButton('todo', ticket))

/** The old names of `approve` / `startShipping` (`press('approve', t)`, `press('todo', t)`) and `changes` (`pressChanges`). */
export const press = act('press', pressButton)
export const pressChanges = act('pressChanges', pressChangesButton)

async function setThinking(on) {
  ui.busy = on
  await ev((o) => S.working(o), on)
  ui.shown.sidebar = undefined
  await syncSidebar()
}

/** Shows or hides the chief's `Working` indicator, for a turn that goes on while the clock runs. */
export const thinking = act('thinking', setThinking)

/** The chief thinks, then answers with `markdown`, shown block by block. A fenced block is drawn as a code block. */
export const reply = act('reply', async (markdown, { think = 1400, reveal = 3600 } = {}) => {
  await setThinking(true)
  await rec.hold(think)
  const blocks = await ev((m) => S.addAssistant(m), markdown)
  await setThinking(false)
  const per = Math.min(450, reveal / blocks)
  for (let k = 1; k <= blocks; k++) { await ev((q) => S.reveal(q), k); await rec.hold(per) }
  await touch()
})

/** The dim `Worked for Ns` line after the chief's turn. */
export const worked = act('worked', (label) => ev((l) => S.addWorked(l), label))

/** Scrolls the chat up by `back` pixels from its end, so the `Scroll to end` pill shows. */
export const chatScroll = act('chatScroll', async (back, ms = 900) => {
  const m = await ev(() => S.chatMetrics())
  const to = Math.max(0, m.height - m.view - back)
  await rec.anim(ms, (p) => ev((y) => S.chatScroll(y), m.top + (to - m.top) * ease(p)))
})

/** Clicks the `Scroll to end` pill and returns the chat to its end. */
export const chatToEnd = act('chatToEnd', async () => {
  await clickStage('#toend')
  await ev(() => S.bottom())
  await rec.hold(300)
})

/**
 * A child thread card in the chat: `{ id, title, subtitle, model, runs }`, `runs` being the `[start, end]` clock times of the child's turns.
 * Cards run, finish and resume independently of each other: each counts up during its own runs and says when it finished between them; `doneSubtitle` replaces `subtitle` once it has.
 */
export const card = act('card', async (c) => {
  ui.children[c.id] = { ...c, runs: c.runs.map(([a, b]) => [iso(a), iso(b)]) }
  await ev((x) => S.addChildCard(x), { id: c.id, title: c.title, subtitle: c.subtitle, model: c.model, status: 'running', timeLabel: '0s' })
  await syncCards()
})

/** Patches a card, for example `{ model: 'Sonnet 5.5' }` when a spec child turns into the build, or `{ runs: [...] }` with its next runs when it resumes (all the runs, as in `card`). */
export const patchCard = act('patchCard', async (id, patch) => {
  const { runs, ...rest } = patch
  Object.assign(ui.children[id], rest, runs && { runs: runs.map(([a, b]) => [iso(a), iso(b)]) })
  await syncCards()
})

/**
 * Shows the wait bar for the running turns of the children `ids` (one id or several) and the sidebar's `Waiting` status with it.
 * One child shows `Waiting · <title> 2m 37s`; several show `Waiting on 2 subagents and 1 command`, with `commands` the number of background commands. A child drops out of the wait when its run ends, the bar goes when the last one has.
 */
export const waitOn = act('waitOn', async (ids, { commands = 0 } = {}) => {
  const was = activeWaits().length > 0
  ui.waits = [ids].flat()
  ui.commands = commands
  if (!was) ui.waitSince = ui.clock
  ui.shown.wait = undefined
  await syncCards(); await syncSidebar()
})

export const intro = act('intro', (on) => ev((o) => S.intro(o), on))

// ---------- GitHub in the browser pane ----------

/** Clicks the dashboard link found by `sel` and returns its url. The dashboard opens it in a new tab, so the click itself is not delivered. */
async function clickLink(sel) {
  const loc = dashLoc(sel)
  await clickLoc(loc, { real: false, inDash: true })
  return loc.getAttribute('href')
}

const clickAction = (kind, ticket) => { offered(kind, ticket); return clickLink(buttonSelector(kind, ticket)) }

async function showTabs() { await ev(([t, d]) => S.browserTabs([d, ...t]), [ui.tabs, { ...DASH_TAB, url: ui.dashUrl }]) }

/** Closes a GitHub tab the way a user does: the cursor goes to its close button, which shows on hover, and clicks it. */
async function closeTab(id) {
  await ev((i) => S.tabHover(i), id)
  await clickStage(`#tabs .tab[data-tab-id="${id}"] .x`)
  ui.tabs = ui.tabs.filter((t) => t.id !== id)
  await ev(() => S.tabHover(null))
  await showTabs()
  await rec.hold(500)
}

/** Opens `tab` in the browser pane, expanded, with `html`; the oldest GitHub tab is closed once there are more than three. */
async function openGh(tab, html) {
  ui.tabs = [...ui.tabs.filter((t) => t.id !== tab.id), tab]
  await showTabs()
  await ev(([id, h]) => S.ghPage(id, h), [tab.id, html])
  await ev((id) => { S.browserSelect(id); S.browserExpand(true) }, tab.id)
  await rec.hold(700)
  if (ui.tabs.length > MAX_GH_TABS) await closeTab(ui.tabs[0].id)
}

async function scrollGh(y, ms = 1400) {
  const y0 = await ev(() => document.querySelector('.ghp.on .gsc').scrollTop)
  await rec.anim(ms, (p) => ev((v) => S.ghScroll(v), y0 + (y - y0) * ease(p)))
}

async function scrollFraction(fraction, ms) {
  const [height, view] = await ev(() => [S.ghScrollHeight(), document.querySelector('.ghp.on .gsc').clientHeight])
  await scrollGh(Math.round((height - view) * fraction), ms)
}

async function scrollScreens(screens, ms) {
  const [top, view] = await ev(() => [document.querySelector('.ghp.on .gsc').scrollTop, document.querySelector('.ghp.on .gsc').clientHeight])
  await scrollGh(Math.round(top + view * screens), ms)
}

async function scrollHeading(text, ms = 1800) { await scrollGh(await ev((t) => S.ghScrollTo(t), text), ms) }

/** Scrolls the open GitHub page to the heading containing `text`. */
export const scrollToHeading = act('scrollToHeading', scrollHeading)

/** Scrolls the open GitHub page to `fraction` of its length. */
export const scrollGhBy = act('scrollGhBy', scrollFraction)

async function showFiles() {
  await clickStage('.ghp.on .g-tabs [data-n="1"]')
  await ev(() => S.ghTabSwitch(1))
  await rec.hold(700)
}

/** Clicks the PR page's Files changed tab. */
export const filesChanged = act('filesChanged', showFiles)

async function toDash() {
  await clickStage('#tabs .tab[data-tab-id="dash"]')
  await ev(() => { S.browserSelect('dash'); S.browserExpand(false) })
  await refresh()
  await rec.hold(500)
}

/** Clicks the Agent team tab to go back to the dashboard. */
export const backToDash = act('backToDash', toDash)

/**
 * How long a look takes: `skim` is a quick one (about 3 to 4 s with the way back), `read` is slower and brings `scrollTo` (a heading) into view.
 * `ms` stretches the time spent reading to fit the narration.
 */
async function look(depth, { scrollTo, ms }) {
  if (depth === 'skim') {
    if (scrollTo) await scrollHeading(scrollTo, 900)
    else await scrollFraction(0.3, 900)
    await rec.hold(ms ?? 300)
    return
  }
  if (scrollTo) await scrollHeading(scrollTo, 1800)
  else await scrollFraction(0.2, 1800)
  await rec.hold(ms ? ms / 2 : 2000)
  await scrollFraction(0.55, 1600)
  await rec.hold(ms ? ms / 2 : 1200)
}

const fixture = (...names) => {
  const found = names.map((n) => path.join(ui.fixturesDir, n)).find((f) => fs.existsSync(f))
  if (!found) throw new Error(`no fixture among ${names.join(', ')} in ${ui.fixturesDir}`)
  return fs.readFileSync(found, 'utf8')
}

async function openSpec({ ticket, sha, path: specPath, md, scrollTo, depth = 'read', ms, stay = false }) {
  const url = await clickAction('spec', ticket)
  const m = new RegExp(`^${repoUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/blob/([0-9a-f]{40})/(.+)$`).exec(url)
  if (!m || !m[1].startsWith(sha) || (specPath && specPath !== m[2])) throw new Error(`View spec ${ticket}: the dashboard links ${url}, expected commit ${sha}${specPath ? ` and ${specPath}` : ''}`)
  const file = m[2]
  const text = md ?? fixture(`spec-${ticket}-${sha}.md`, `spec-${sha}.md`)
  const html = await ev((a) => S.ghBlobPage(a), { path: file, sha, md: text, lines: text.split('\n').length - 1, size: Buffer.byteLength(text), tree: [...tree, file] })
  const name = file.split('/').at(-1).replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '')
  await openGh({ id: `spec-${sha}`, title: `${name} (${sha}) · dbeallor/album-ranker`, kind: 'gh', url, favicon: 'github' }, html)
  if (stay) return
  await look(depth, { scrollTo, ms })
  await toDash()
}

/**
 * Clicks the dashboard's View spec on `ticket`'s card and shows the spec as of commit `sha` (short) in a new GitHub tab, expanded; the address bar shows the full blob url the button links to.
 * `md` is the spec's text (default: `fixtures/<date>/spec-<ticket>-<sha>.md`, else `spec-<sha>.md`), `path` the repo path (checked against the link).
 * `depth` `skim` is a quick look (open, one scroll, back; 3 to 4 s), `read` (default) a slower one that brings the heading `scrollTo` into view; `ms` sets the time spent reading.
 * The way back clicks the Agent team tab. `stay: true` leaves the page open for your own scrolls and `backToDash`. The old form `viewSpec('ALBUM-2', '5c249ca')` stays open.
 */
export const viewSpec = act('viewSpec', (a, b) => openSpec(typeof a === 'string' ? { ticket: a, sha: b, stay: true } : a))

const mergedAt = (pr) => (pr.mergedAt ? Date.parse(pr.mergedAt) : Infinity)

async function openPr({ ticket, pr, diff, depth = 'read', tabs, scrollTo, ms, stay = false }) {
  const url = await clickAction('pr', ticket)
  if (url !== `${repoUrl}/pull/${pr.number}`) throw new Error(`View PR ${ticket}: the dashboard links ${url}, expected ${repoUrl}/pull/${pr.number}`)
  const seen = (t) => Date.parse(t) <= ui.clock
  const comments = pr.comments.filter((c) => seen(c.createdAt))
  const commits = Math.max(1, (pr.commits ?? []).filter((c) => seen(c.committedDate)).length)
  const files = layout(parseDiff(diff))
  const state = ui.clock >= mergedAt(pr) ? 'MERGED' : 'OPEN'
  const html = await ev((a) => S.ghPrPage(a), { pr: { title: pr.title, number: pr.number, headRefName: pr.headRefName }, state, bodyMd: pr.body, comments, commits, files, checks: [], mergeable: state === 'OPEN' })
  await openGh({ id: `pr-${pr.number}`, title: `${pr.title} by dbeallor · Pull Request #${pr.number} · dbeallor/album-ranker`, kind: 'gh', url, favicon: 'github' }, html)
  if (stay) return
  const visit = tabs ?? (depth === 'read' ? ['conversation', 'files'] : ['conversation'])
  await look(depth, { scrollTo, ms })
  if (visit.includes('files')) {
    await showFiles()
    await rec.hold(depth === 'read' ? 1400 : 500)
    await scrollScreens(depth === 'read' ? 0.85 : 0.5, depth === 'read' ? 1600 : 900)
    await rec.hold(depth === 'read' ? 1500 : 400)
  }
  await toDash()
}

const syntheticDiff = (file, text) => {
  const lines = text.replace(/\n$/, '').split('\n')
  return `diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n${lines.map((l) => `+${l}`).join('\n')}\n`
}

/**
 * Clicks the dashboard's View PR on `ticket`'s card and shows the pull request in a new GitHub tab, expanded: `pr` is the parsed `pr-N.json`, `diff` the text of `pr-N.diff`.
 * The page is drawn as of the clock: only the comments and commits that existed then, and the badge Open until the merge time has passed. Conversation has the description, the reviews with their verdicts and the merge box; Files changed has the file list and a few expanded diffs.
 * `depth` is `skim` (conversation only, about 4 s) or `read` (default: conversation, then Files changed, with `scrollTo` a heading to bring into view), `tabs` (`['conversation', 'files']`) overrides which tabs to visit, `ms` sets the reading time.
 * The way back clicks the Agent team tab. `stay: true` leaves the page open. The old form `viewPr('ALBUM-2')` shows the 2026-11-20 pull request and stays open.
 */
export const viewPr = act('viewPr', (a) => {
  if (typeof a !== 'string') return openPr(a)
  const specPath = timeline.tickets[a].specPath
  return openPr({ ticket: a, pr: JSON.parse(fixture('pr13.json')), diff: syntheticDiff(specPath, fixture('spec-42e9abb.md')), stay: true })
})

/**
 * Clicks the issue's link on the dashboard (it must be visible on the current tab) and shows the issue (`issue` is the parsed `issue-N.json`) in a new GitHub tab, as of the clock: open until its `closedAt`, with the comments posted by then.
 * `depth`, `scrollTo`, `ms` and `stay` as for `viewSpec`.
 */
export const viewIssue = act('viewIssue', async ({ issue, depth = 'read', scrollTo, ms, stay = false }) => {
  const url = await clickLink(`a[href$="/issues/${issue.number}"]`)
  if (url !== `${repoUrl}/issues/${issue.number}`) throw new Error(`the dashboard links ${url} for issue ${issue.number}`)
  const closed = issue.closedAt && Date.parse(issue.closedAt) <= ui.clock
  const comments = issue.comments.filter((c) => Date.parse(c.createdAt) <= ui.clock)
  const html = await ev((a) => S.ghIssuePage(a), { number: issue.number, title: issue.title, state: closed ? 'CLOSED' : 'OPEN', author: issue.author.login, bodyMd: issue.body, labels: issue.labels, comments })
  await openGh({ id: `issue-${issue.number}`, title: `${issue.title} · Issue #${issue.number} · dbeallor/album-ranker`, kind: 'gh', url, favicon: 'github' }, html)
  if (stay) return
  await look(depth, { scrollTo, ms })
  await toDash()
})

/** Opens the Agent team tab (the dashboard) in the browser pane, as `start the team` does. */
export const openDashTab = act('openDashTab', async () => {
  await ev(([d]) => S.browserTabs([d]), [{ ...DASH_TAB, url: ui.dashUrl }])
  await refresh()
})
