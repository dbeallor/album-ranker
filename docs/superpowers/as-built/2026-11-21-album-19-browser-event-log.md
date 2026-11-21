# As-built: Browser test event log for replay

**Shipped:** in PR #25
**Ticket:** ALBUM-19
**Spec:** [2026-11-21-album-19-browser-event-log.md](../specs/2026-11-21-album-19-browser-event-log.md)

## Differs from the spec

- The spec's example log has no same-URL `replace` events. Next.js calls `history.replaceState` itself after each hydration, so the log has a `navigation` `replace` to the same URL after each `load`. They are recorded, and `docs/event-log-format.md` tells the renderer it can skip them.
- Pressing Enter in the search box makes Chrome click the Search button, so the log has a `click` at x 0, y 0 on the button just before the `submit`. The format doc says so.
- Selectors are the full path from `main` or `body` (with `:nth-of-type(n)` only where needed to be unique), longer than the spec's example selectors.
- The recorder runs only on top-level http(s) pages, so Playwright's initial `about:blank` page gives no event.
- `startedAt` is the time of the first event, so `t` starts at 0.
- The browser test runs against a production build (`next build` then `next start`) on port 3100, with the catalog stub on port 3101.
