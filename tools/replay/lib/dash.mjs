// The real team dashboard page, loaded from the collective-wisdom checkout and served against a mock /api, with a clock the driver sets.
import fs from 'fs'
import os from 'os'
import path from 'path'

const DASH_SRC = path.join(os.homedir(), '.collective-wisdom/scripts/dashboard/page')

/**
 * `window.__clock` (epoch ms) is what `Date.now()` and `new Date()` return in the page; unset, the real clock runs.
 * A click on a `t3code://` link (Approve, Changes, Start shipping) is cancelled, since headless Chrome stops delivering mouse clicks after one; the link is left in `window.__opened`.
 * The dashboard then does not press Return either, so the driver plays what T3 would do with the link.
 */
const SHIM = `<script>(() => {
  const Real = Date
  const now = () => (typeof window.__clock === 'number' ? window.__clock : Real.now())
  function FakeDate(...args) {
    if (!new.target) return new Real(now()).toString()
    return args.length ? new Real(...args) : new Real(now())
  }
  FakeDate.prototype = Real.prototype
  FakeDate.now = now
  FakeDate.parse = Real.parse
  FakeDate.UTC = Real.UTC
  window.Date = FakeDate
  document.addEventListener('click', (ev) => {
    const a = ev.target instanceof Element ? ev.target.closest('a[href^="t3code://"]') : null
    if (!a) return
    ev.preventDefault()
    window.__opened = a.getAttribute('href')
  }, true)
})()</script>`

export const injectShim = (html) => {
  const out = html.replace('<head>', `<head>${SHIM}`)
  if (out === html) throw new Error('dashboard index.html: <head> not found')
  return out
}

/** The dashboard's html (dark, fake clock) and js (with `window.__poll` to redraw on demand). */
export async function loadDash(fallbackDir) {
  const hi = path.join(DASH_SRC, 'index.html'), ha = path.join(DASH_SRC, 'app.js')
  let html, js
  if (fs.existsSync(hi) && fs.existsSync(ha)) { html = fs.readFileSync(hi, 'utf8'); js = fs.readFileSync(ha, 'utf8') }
  else {
    const { port } = JSON.parse(fs.readFileSync(path.join(fallbackDir, 'dashboard.json'), 'utf8'))
    const get = async (u) => (await fetch(`http://127.0.0.1:${port}${u}`)).text()
    html = await get('/'); js = await get('/app.js')
  }
  const patched = js.replace('const poll = async () => {', 'const poll = window.__poll = async () => {')
  if (patched === js) throw new Error('dashboard app.js: poll patch target not found')
  return { html: injectShim(html.replace('<html lang="en">', '<html lang="en" data-theme="dark">')), js: patched }
}

/** A request handler for the dashboard's routes: answers true when it served the request. `getState()` is the /api payload. */
export const dashRoutes = (dash, getState) => (req, res) => {
  const u = req.url.split('?')[0]
  const send = (type, body) => { res.writeHead(200, { 'content-type': type }); res.end(body) }
  if (u === '/dash.html') send('text/html', dash.html)
  else if (u === '/app.js') send('text/javascript', dash.js)
  else if (u === '/api') send('application/json', JSON.stringify(getState()))
  else return false
  return true
}
