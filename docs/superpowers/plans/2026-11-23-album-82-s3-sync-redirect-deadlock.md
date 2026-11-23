# ALBUM-82 plan: S3 sync redirect deadlock

Spec: `docs/superpowers/specs/2026-11-23-album-82-s3-sync-redirect-deadlock.md`. Follow it; this plan only orders the work.

## Task 1: tests first (`lib/db/s3-sync.test.ts`, `describe("serveWithSync")`)

- Add the four tests from the spec's Tests section (nested request, nested write saved before the outer response with one HEAD, forged and stale token still queue as a table, token absent from the response). Set a 2 s timeout on the nested-request test.
- Run `npx vitest run lib/db/s3-sync.test.ts`: the nested-request and write tests must fail on the current code (timeout). Record that.

## Task 2: the fix (`lib/db/s3-sync.ts`, `serveWithSync` only)

- Constant header name `x-album-ranker-sync-turn`; `let live: string | undefined`.
- In the listener: if the header equals `live` (both present, equal length, `timingSafeEqual`), run `listener(req, res)` at once and return its promise, no queue, no `beforeRequest`/`afterRequest`, no holding. Otherwise `delete req.headers[name]` and queue as today.
- In the turn: after the queue gives the turn, set `live = randomBytes(32).toString("hex")` and `req.headers[name] = live` before `beforeRequest()`; clear `live` in a `finally` that covers every exit (load failure, `runHeld` finishing, save failure). Never set the token on the response.
- Update the doc comment on `serveWithSync`.
- Verify: `npx vitest run lib/db/s3-sync.test.ts` all green.

## Finish

`npm test`, `npm run lint`, `npm run typecheck`. Commit (`fix: ALBUM-82 ...`), push the branch.
