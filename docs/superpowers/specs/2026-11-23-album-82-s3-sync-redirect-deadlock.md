# Fix the S3 sync deadlock on server action redirects

**Status:** Shipped
**Shipped:** in PR #83, as specified
**Date:** 2026-11-23
**Ticket:** [ALBUM-82](https://github.com/dbeallor/album-ranker/issues/82)

## Goal

On an S3 build, a server action that ends in `redirect()` (Log in, and every other redirecting action) finishes and the browser lands on the target page, instead of hanging for 30 s and getting a 502. Outside requests still run one at a time, with the database loaded before each one and saved before its response goes out.

## Cause

For a fetch-submitted action (JavaScript on), Next renders the redirect target itself before it answers. `createRedirectRenderResult` in `next/dist/server/app-render/action-handler.js` sends a `GET` with `fetch()` to `__NEXT_PRIVATE_ORIGIN` (the same server, `127.0.0.1:8080` on Lambda) and waits for it. `createForwardedActionResponse` in the same file does the same with a `POST` when an action has to be forwarded.

`serveWithSync` (`lib/db/s3-sync.ts`) chains every request onto one `tail` promise. The internal fetch is a new request, so it waits for the action request to finish, and the action request waits for the internal fetch. Lambda kills both at 30 s.

Both internal fetches build their headers with `getForwardedHeaders(req, res)`: every header of the incoming request, plus the response's headers so far, minus a short forbidden list (`content-length`, `set-cookie` and the IPC ones). A custom request header therefore reaches the internal request unchanged.

## What changes

All in `lib/db/s3-sync.ts`, inside `serveWithSync`. `lambda/server.ts` and the app don't change.

### A token for the request that holds the turn

- When an outside request gets its turn (just before `beforeRequest()`), `serveWithSync` makes a fresh random token (`randomBytes(32)`, hex) and sets it on that request as the header `x-album-ranker-sync-turn`. Next copies it into any internal fetch the request makes.
- The token is the current turn's while that request's turn runs. It is cleared when the turn ends: after the response is sent or the connection closes, and on the error paths (load failure, save failure).
- The token is set on the request only, never on the response, so it is never sent to the browser.

### Requests that carry the live token run inside the turn

- A request whose `x-album-ranker-sync-turn` header equals the live token (compared with `timingSafeEqual`) does not queue. It runs the listener straight away, inside the turn that spawned it:
  - no `beforeRequest()`: the database is already loaded for the outer request, and reloading it mid-turn could drop the outer request's unsaved writes;
  - no `afterRequest()` and no holding of its response: the outer request is still held, and its `afterRequest()` saves anything either of them changed before the outer response goes out. That keeps "saved before the response goes out" for the response the browser sees.
- Any other value of the header (a stale token from a finished turn, a guess, a header sent from outside) is ignored: the header is removed and the request queues like any other outside request.

### Outside requests can't skip the queue

- `serveWithSync` deletes any `x-album-ranker-sync-turn` header on a request that doesn't match the live token before it queues it, so a client can't pre-seed a value that a later step would trust.
- A client would have to guess a 256-bit token that lives for one request and is never sent out. On Lambda nothing else runs in the instance, and the Lambda Web Adapter only forwards outside requests.

## Tests

In `lib/db/s3-sync.test.ts`, `describe("serveWithSync")`, using the existing `start`, `store` and `newSync` helpers:

- **Nested request (the deadlock):** a handler that, for `POST /action`, `fetch`es `${url}/target` with the incoming request's headers (as Next does) and ends with that response's body; `GET /target` answers `"target"`. The `POST` gets `"target"` back. On today's code the test times out; the test sets a short timeout (2 s) so the failure is quick.
- **The nested request's write is saved before the outer response:** the nested `GET` adds an album; the outer response arrives only after the fake store's `put` finished, and the stored database holds the album. `beforeRequest` ran once (one HEAD), not twice.
- **A token from outside doesn't skip the queue:** table-driven over a made-up value, and the token seen in a finished turn (captured by the handler): sent while another request is running, the request still waits for it (the existing "one at a time" ordering check).
- **The token never reaches the response:** the response headers of an outside request have no `x-album-ranker-sync-turn`.
- The existing `serveWithSync` tests keep passing unchanged ("runs one request at a time", "sends the response only after the upload has finished" and the rest).

`npm test`, `npm run lint` and `npm run typecheck` pass.

### Proof

- The unit tests above.
- Where it can be run locally: `npm run build:lambda`, then start `lambda/server.ts` from the built app in S3 mode against a local S3 stand-in, and log in with JavaScript on in a browser. If no S3 stand-in can be run on this machine without new dependencies or AWS access, this goes under **Not proven** in the PR, to be checked on staging after the redeploy.

## Not in scope

- Production or staging redeploy. After merge, a human runs `terraform -chdir=infra/envs/staging apply` from a build of the merged commit.
- Changing how Next makes the internal redirect fetch, or turning it off.
- Running outside requests in parallel.

## Calls I made

- **The nested request is recognized by a per-turn secret header, not by its address or by "anything that arrives while a turn runs".** On Lambda every request comes from `127.0.0.1` (the Web Adapter), so the address tells nothing. Letting any request run while a turn is active would break the one-at-a-time rule whenever two outside requests overlap (locally, or if Lambda concurrency per instance ever changes). The header rides on behaviour Next already has (`getForwardedHeaders` copies request headers), so nothing in Next is patched.
- **No second loopback port for internal requests.** It would avoid the header, but Next overwrites `__NEXT_PRIVATE_ORIGIN` in its own `listening` handler, so pointing it elsewhere means racing Next's startup code.
- **The nested request runs with no reload, no save and no hold of its own.** The outer request owns the turn; its save covers both. The nested response goes to Next, not to the browser, so holding it would only add latency.
- **A stale or wrong token is dropped quietly and the request queues.** It is not an error page: a late internal fetch from a turn that already ended (if one ever happens) is then just an ordinary request, which is safe.
- **One random token per turn, compared in constant time.** A fixed per-process token would work too, but a per-turn one also stops a late internal request from running inside a different request's turn.
