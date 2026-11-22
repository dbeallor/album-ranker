# ALBUM-61 recorder follows window resizes: plan

Spec: [2026-11-22-album-61-recorder-resize.md](../specs/2026-11-22-album-61-recorder-resize.md)

Test command: `npm test`; also `npm run lint` and `npm run typecheck`. The worktree may need `npm install` first.

1. `e2e/recorder/recorder.ts`, `e2e/recorder/log.ts`: add `Resize = { t, width, height }` and a `resizes: Resize[]` field on `EventLog`. `buildLog` takes an optional `resizes` (default `[]`) and writes it after `viewport`. `e2e/fixtures.ts` needs no change beyond the default. Extend the `log.test.ts` table with resizes cases (none, one, one before the first event clamped to `t: 0`; the clamp happens in the function from step 2, so the log test only checks the field is written through).
2. `scripts/record/rules.ts`: add `sizeTimeline({ reports, startedAtMs, requested, headless })` returning `{ viewport, resizes }` (reports are `{ ts, width, height }` in arrival order; drop a report equal to the previous size; first is `viewport`; none gives `requested` when headless and `null` when headed; `t = max(0, ts - startedAtMs)`). One table-driven test in `rules.test.ts`. Usage text calls `--viewport` the starting size.
3. `scripts/record/session.ts`: headed uses `newContext({ viewport: null })`; headless keeps `{ viewport }`. Add a second init script (top-level http(s) pages only) that reports `{ ts, width, height }` via `__albumRecorderViewport` at start and after `resize` events (250 ms trailing debounce). Collect reports, build the log with `sizeTimeline`. Keep `--window-size` for headed. Add a headless `runSession` test (local `http.createServer` page, `drive` calls `page.setViewportSize`); skip it when Chromium is not installed so `npm test` passes.
4. Docs: `README.md` § Record a session and `docs/event-log-format.md` (the `viewport` line, new `resizes` field and example, a note under version 2, § How to record).
