# ALBUM-19 browser event log: plan

Spec: [2026-11-21-album-19-browser-event-log.md](../specs/2026-11-21-album-19-browser-event-log.md) (approved). Work in this worktree on `feat/album-19-frontend-event-tracking`. Read `node_modules/next/dist/docs/` before touching Next-specific code (this plan changes none).

Install first: `npm ci`.

## Task 1: `MUSICBRAINZ_URL` setting

- `lib/config.ts`: add `musicbrainzUrl` (env `MUSICBRAINZ_URL`, default `https://musicbrainz.org`, empty or whitespace throws, same pattern as the others). Trailing slash stripped.
- `lib/catalog/musicbrainz.ts`: the search URL is `${musicbrainzUrl}/ws/2/release-group`. Pass the base URL through the existing deps pattern in `lib/catalog/search.ts` (`deps.baseUrl ?? (() => getConfig().musicbrainzUrl)`), so existing tests with mocked fetch keep working.
- `lib/config.test.ts`: add the three `MUSICBRAINZ_URL` cases to the existing table (and stub the variable to undefined in the loop).
- `.env.example`: document `MUSICBRAINZ_URL`.
- Verify: `npm test`, `npm run typecheck`, `npm run lint`.

## Task 2: the recorder and its format

- `e2e/recorder/recorder.ts`: plain browser code, no imports from the app. Exports types `EventLog`, `RecordedEvent`, `ElementInfo` (format in the spec) and `installRecorder(send: (event) => void, now?: () => number): () => void` which adds capturing listeners on `document` for `click`, `input`, `submit`, listeners on `window` for `popstate`, wraps `history.pushState` / `replaceState`, and sends a `navigation` `load` event for the current URL on install. Returns an uninstall function (used by unit tests).
- `e2e/recorder/inject.ts`: a self-contained script string/bundle for `addInitScript`. Simplest: build `recorder.ts` to an IIFE with `esbuild` (comes with Vitest's vite) or write the injected script as a `.js` file in `e2e/recorder/` that Playwright reads with `addInitScript({ path })`. Pick whichever needs no new dependency; the injected code calls `window.__albumRecorderSend`.
- Element description: `tag`, `selector` (id, then name, then child path from `main` or `body`), optional `id`, `name`, `role`, `label` (`aria-label` or `<label>` text), `text` (trimmed, 80 chars). Password input values are `"***"`.
- `t` is ms since the first event's page start offset supplied by the fixture (the fixture converts; the recorder sends `Date.now()` as `ts`, and the fixture computes `t = ts - startedAtMs`).
- Unit test `e2e/recorder/recorder.test.ts` (Vitest, jsdom): one table of DOM actions (link click, input in a named field, input in a labelled field, password input, form submit, `pushState`, `replaceState`, `popstate`) and the event each sends. Vitest must pick up this file (it is a unit test) while ignoring `*.spec.ts`.
- `docs/event-log-format.md`: the format, copied from the spec, written for the renderer's author.

## Task 3: Playwright setup and the search test

- `npm i -D @playwright/test`; scripts: `"test:e2e": "playwright test"`. `playwright.config.ts`: Chromium only, `testDir: "e2e"`, `testMatch: "**/*.spec.ts"`, `webServer` starting the app on its own port (3100) with `MUSICBRAINZ_URL` pointing at the stub and `DATABASE_PATH` set to a temp path under `test-results/` (never `data/`). Use `next dev` or `next build && next start`; pick what works and is stable.
- `vitest.config.mts`: exclude `e2e/**/*.spec.ts`.
- `.gitignore`: `test-results/`, `playwright-report/`.
- `e2e/fixtures.ts`: extends `test` with an auto fixture that `exposeBinding`s `__albumRecorderSend`, `addInitScript`s the recorder, collects events with `seq`, writes `events.json` (format version 1, `test`, `startedAt`, `viewport`, `events`) to `testInfo.outputPath("events.json")` after the test (also on failure) and attaches it. It also routes `https://coverartarchive.org/**` to a 404.
- `e2e/catalog-stub.ts`: a `node:http` server that answers `/ws/2/release-group` with `lib/catalog/fixtures/getz-gilberto.json`. Started from `playwright.config.ts` as a second `webServer` entry or from global setup; either is fine.
- `e2e/search.spec.ts`: as in the spec (open `/`, click "Search albums", click the box, type "getz gilberto", Enter, wait for results, click the first title). Assert the log: navigations `load /`, `push /search`, `load /search?q=getz+gilberto` in order; one `input` per typed character ending in "getz gilberto"; a `submit` between the last `input` and the second `load`; `seq` ascending, `t` non-decreasing.
- README: one-time `npx playwright install chromium` and `npm run test:e2e`.
- Verify: `npm run test:e2e` passes and writes `events.json`; `npm test`, `npm run lint`, `npm run typecheck` still pass.

## Task 4: proof for the PR

- Run `npm run build`, then search `.next/static` for `__albumRecorderSend`: nothing found.
- Save a sample `events.json` from the run to `docs/superpowers/as-built/` only if the as-built is needed; otherwise paste a trimmed copy in the PR proof.

Tests are sized to the spec's Tests section: one table-driven test per rule, none for styling.
