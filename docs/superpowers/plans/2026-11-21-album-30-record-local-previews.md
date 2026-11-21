# ALBUM-30 plan: record browser events on local apps and previews

Spec: [../specs/2026-11-21-album-30-record-local-previews.md](../specs/2026-11-21-album-30-record-local-previews.md). Follow it; this plan only orders the work.

Constraints: nothing under `app/`, `components/`, `lib/` changes. Scripts run with `node scripts/x.ts` (type stripping: `.ts` import extensions, no enums). Never touch `data/` or commit SQLite files. Tests: Vitest, one table-driven test per rule.

## Task 1: log v2 and shared builders
- `e2e/recorder/recorder.ts`: `EventLog` becomes version 2 with `source: LogSource` (`host` required; `kind`, `preview`, `branch`, `worktree`, `commit` optional) and optional `test`.
- `e2e/recorder/log.ts`: `toEvents(sent, startedAtMs)` and `buildLog({sent, startedAtMs, source, viewport, test?})`; omit undefined fields.
- `e2e/recorder/source.ts`: Node-only `gitInfo(folder)` returning `{branch?, worktree?, commit?}` via `git` (omit on failure, detached HEAD has no branch).
- `e2e/recorder/inject.ts`: must work from both Playwright (CJS) and `node scripts/record.ts` (ESM); pick a path resolution that works in both.
- `e2e/fixtures.ts`: use the builders; `source = {kind:"playwright", host:"127.0.0.1:3100", ...gitInfo(process.cwd())}` (host from the test's baseURL).
- `e2e/search.spec.ts`: also assert `source.kind` / `source.host` (expose the log via the fixture or read the written file).
- Tests: log builder with/without `test`, fields omitted.

## Task 2: preview record gets the commit
- `scripts/preview/index.ts`: `PreviewRecord` gains `commit` (full HEAD SHA of the checkout at start, from `git rev-parse HEAD`; for main this is after setup, before build).

## Task 3: record rules (pure, table-tested)
`scripts/record/rules.ts` + `rules.test.ts`:
- `parseArgs`: target `main` | number | branch | port (1024-65535 -> `http://localhost:<port>`) | loopback URL (`localhost`, `127.0.0.1`, `[::1]`; others refused); `--out <dir>`, `--viewport WxH` (default 1280x720; reject bad values).
- Match a host:port to a live preview record (live, stale pid, none).
- `buildSource({url, previewRecord?, listener?, git})` per the spec's metadata table; omit unknown fields; `kind: "dev"` only when the listener's command line contains `next dev` and no preview matched.
- Recording folder name `<YYYYMMDD-HHMMSS>-<port>`.

## Task 4: session and command
- `scripts/record/session.ts`: `runSession({browser, url, viewport, outFile, source, now})` launches a context with the recorder init script and `__albumRecorderSend` binding, opens the URL, collects events, rewrites the log at most once a second, writes final log on page/context close or abort signal. Takes the Playwright browser type so a script can drive it headless.
- `scripts/record/lookup.ts`: preview-record scan across `git worktree list` `.preview/*.json`; `lsof -nP -iTCP:<port> -sTCP:LISTEN -Fp` then `lsof -a -p <pid> -d cwd -Fn` and `ps -o command= -p <pid>`; every failure yields no fields.
- `scripts/record.ts` + `"record": "node scripts/record.ts"` in package.json. If a preview target isn't running, print `npm run preview -- <target>` and exit 1. Ctrl-C closes cleanly and writes the log; print the path.
- `.gitignore`: `recordings/`.

## Task 5: docs
- `docs/event-log-format.md`: version 2, `source` table, "changes from version 1", how to record.
- README: "Record a session" section next to the previews and e2e sections; update the e2e paragraph (recorder no longer test-only).
- `docs/agents/project.md` Environments: one line pointing to `npm run record`.

## Task 6: proof (scripted, headless) and verification
- Run `npm test`, `npm run lint`, `npm run typecheck`, `npm run test:e2e`.
- `npm run build`, then `grep -r __albumRecorderSend .next/static` finds nothing.
- Start `npm run dev` (port 3000, with `MUSICBRAINZ_URL` pointing at `node e2e/catalog-stub.ts` so the search works offline, and a throwaway `DATABASE_PATH` under the scratchpad, never `data/`), run the session function headless through: open `/`, Search, type `getz gilberto`, submit. Save the log.
- Same session against a preview of this ticket (`npm run preview -- 30`, uses `data/preview.db` in this worktree, gitignored). Main preview (4000) only if the root checkout can build it without touching its data; otherwise say it was not proven.
- Record the logs' `source` objects side by side in the PR `## Proof`.
