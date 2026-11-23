# Capture front-end events in staging and production

**Status:** Draft
**Date:** 2026-11-23
**Ticket:** [ALBUM-85](https://github.com/dbeallor/album-ranker/issues/85)

## Goal

When staging or production is used, the browser reports what happened to a store in our own AWS account: which pages were opened, which buttons and links were used, and front-end errors and failed requests. Someone can read a session's events a minute after it happens. Nothing is sent to a third party, nothing typed is captured, and local runs and tests send nothing.

## The open question, settled

The ticket left two things open: what capture is for, and where events go. The full options and the reasons are under [Calls I made](#calls-i-made). In short:

- **Purpose: usage analytics and error tracking. No session replay.** Page views, clicks on links and buttons, form submits, front-end exceptions and failed same-origin requests.
- **Destination: a first-party endpoint, `/events`, served by its own small Lambda function, writing to its own CloudWatch log group (30-day retention).** It is not the app's function and not the SQLite file.
- **No third-party script or host.** The CSP does not change.

## What is there today

- The app is one Lambda function with reserved concurrency 1 behind CloudFront. Only one request runs at a time; a request that lands while another is running gets a 429 (README, Deploy to AWS).
- Every request to it goes through `serveWithSync` (`lib/db/s3-sync.ts`): one S3 `HEAD` before, an upload after if the database changed.
- The CSP allows `script-src 'self' 'unsafe-inline'` and `connect-src 'self'` (`lib/security-headers.ts`).
- The session cookie `album_session` is `HttpOnly`, `SameSite=Lax`, `Secure`, signed with an HMAC of `APP_PASSWORD` and `DEPLOY_ENV` (`lib/auth/session.ts`, no app imports).
- CloudFront sends `x-origin-secret` to the app origin, and the app refuses requests without it.
- The Playwright recorder (`e2e/recorder/`) is injected only by tests and `npm run record`. It is not shipped and this ticket does not change it.

## What changes

### 1. The browser side: `components/client-events.tsx`

A client component rendered once in `app/layout.tsx`. It does nothing unless the build sets `NEXT_PUBLIC_CLIENT_EVENTS=1`.

- **Switched on at build time.** `npm run build:lambda` sets `NEXT_PUBLIC_CLIENT_EVENTS=1` for its `next build`. `npm run dev`, `npm run build`, `npm run preview`, `npm test` and `npm run test:e2e` don't set it, so the component renders nothing and the capture code is dropped from the bundle. Staging and production share one `dist/`, so both have it.
- **Not on the login page.** On `/login` the component does nothing, because there is no session yet. Events start after login.
- **Session id.** A random id per browser tab (`crypto.randomUUID()`, kept in `sessionStorage`), so events from one visit can be grouped. It is not the session cookie and is not derived from it.

What it records. Each event has `type`, `t` (ISO time from the browser clock), `seq` (counter per tab) and `session`:

| `type` | Fields | When |
|---|---|---|
| `page` | `path`, `vw` (viewport width in CSS px) | First load, and each client-side route change (`usePathname`). |
| `click` | `tag`, `href`, `name` | A click on an `a`, `button`, `[role=button]` or `input[type=submit\|button]` (the nearest such ancestor of the clicked node). Clicks elsewhere are ignored. |
| `submit` | `name` | A form submit. |
| `error` | `kind` (`error` or `rejection`), `message`, `source`, `line`, `col`, `stack` | `window` `error` and `unhandledrejection`. |
| `request-failed` | `method`, `path`, `status` | A same-origin `fetch` that ends in status 500 or above, 429, or a network error (`status: 0`). Requests to `/events` are never reported. |

Field rules, applied in the browser and again on the server:

- `path` and `href` are a pathname only: no origin, query string or hash. `/search?q=getz` becomes `/search`. An `href` to another host becomes `"external"`.
- `name` is the element's `data-event` attribute, else `aria-label`, else its `name` attribute, else its `id`, else left out. It is never the element's visible text. The build adds `data-event` to the main actions that have none of these (the two matchup choices, skip, add album, the import steps, log out).
- `message` is clipped to 300 characters, `stack` to 2,000, and the page's origin is removed from both. `source` is a pathname, or `"external"`.
- `vw` is a whole number.

What it never records: any field's value, any typed text, the password, cookies, `document.cookie`, request or response bodies or headers, query strings, hashes, the visible text of the page, scrolling, mouse movement or key presses.

How it sends:

- Events wait in a buffer of at most 100 (the oldest are dropped past that).
- The buffer is sent as one JSON batch with `navigator.sendBeacon("/events", …)` every 15 seconds while it has events, when the page is hidden (`visibilitychange`) and on `pagehide`. If `sendBeacon` refuses the batch, the events are kept for the next try.
- Errors in the capture code itself are swallowed; capture must never break a page.

### 2. The server side: a separate events function

A second Lambda function per environment, `album-ranker-<env>-events`, in `infra/modules/app`. It does one thing: check the request and write each event as one log line.

**Why not the app's own function.** Its reserved concurrency is 1, so a batch sent while a page is loading would make one of the two answer 429. Each batch would also cost an S3 `HEAD` in `serveWithSync`. A separate function has neither problem and leaves the app's single-writer model untouched.

The handler, `lambda/events.ts`, is a plain Node.js Lambda handler (no Next.js, no Web Adapter, no database). `npm run build:lambda` transpiles it with `lib/auth/session.ts` and `lib/auth/compare.ts` into `dist/events/`, and Terraform zips that.

For each request it answers, in this order:

1. `404` if `CLIENT_EVENTS` is `off`. Nothing is logged.
2. `403` if `x-origin-secret` does not match `ORIGIN_SECRET` (the same secret CloudFront sends the app), so the function URL can't be used directly.
3. `405` if the method is not `POST`.
4. `403` if `Sec-Fetch-Site` is present and not `same-origin`.
5. `401` if the `album_session` cookie does not verify with `verifySessionToken` (`APP_PASSWORD`, `DEPLOY_ENV`).
6. `413` if the body is over 32 KB; `400` if it is not a JSON object with an `events` array of at most 100 items.
7. Otherwise `204`. Each item that matches one of the five event types is logged as one line, `[client-event] {json}`, with only the fields listed above, clipped and pathname-only as above. Unknown types and unknown fields are dropped. The server adds `env` (`staging` or `production`) and `received` (ISO time). It never logs the cookie, any header, the IP address or the user agent.

Failures (2 to 6) log one `[client-event-refused] {"status":…,"reason":…}` line, with no request data.

Terraform, all in `infra/modules/app`:

- `aws_lambda_function.events`: Node.js 22, arm64, 128 MB, 5 s timeout, reserved concurrency 2. Environment: `DEPLOY_ENV`, `APP_PASSWORD`, `ORIGIN_SECRET`, `CLIENT_EVENTS`.
- `aws_lambda_function_url.events`, auth `NONE` (the origin secret does the job, as for the app).
- `aws_cloudwatch_log_group.events`: `/aws/lambda/album-ranker-<env>-events`, retention from a new variable `client_events_retention_days` (default 30).
- An IAM role that can only write to that log group.
- A CloudFront origin `events` (the function URL, with the `x-origin-secret` header) and an ordered cache behavior for `/events`: `POST` allowed, no caching, forwards the `Cookie` header and the `Sec-Fetch-Site` header, the same response headers policy as the app.
- A new variable `client_events` (bool, default `true`) that sets `CLIENT_EVENTS` to `on` or `off`.

### 3. Switching it on and off

- **On:** the default. Deploy as today (`npm ci && npm run build:lambda`, then `terraform apply` in each environment).
- **Off:** set `client_events = false` in that environment's `terraform.tfvars` and `apply`. The function answers 404 and logs nothing. Browsers keep sending until the next deploy built without the flag; those requests are cheap and dropped. Logged events stay until retention expires.
- **Local and tests:** never on. The build flag is unset and no events function exists.

### 4. Reading the data

The README's Deploy to AWS section gets a "Front-end events" part:

- Live: `aws logs tail /aws/lambda/album-ranker-staging-events --follow`.
- Logs Insights on that group: `fields @timestamp, @message | filter @message like "[client-event]" | sort @timestamp desc`, and a second query that groups by `session` to show one visit.
- What is captured and what is not (a short copy of the lists above), retention, and how to switch it off.

### CSP and headers

No change. The script is part of the app's own bundle (`script-src 'self'`) and `/events` is the same origin (`connect-src 'self'`). `lib/security-headers.test.ts` gets one row asserting `connect-src` is still exactly `'self'`, so a later change that adds a host has to change a test.

## Tests

One table-driven test per rule, none for styling:

- **Field cleaning** (`lib/client-events/clean.test.ts`, shared by the browser and the handler): path stripping (query, hash, origin, external), `name` precedence and never-visible-text, clipping, `vw` rounding, unknown fields dropped, unknown types dropped.
- **Handler** (`lambda/events.test.ts`): one row per answer in the ordered list (off, wrong secret, wrong method, cross-site, no or bad cookie, too big, bad shape, good batch), and that a good batch logs one line per valid event with no cookie, header, IP or user agent in the output.
- **Component**: renders nothing without the flag, nothing on `/login`; with the flag, a click on a button and a typed character in a field produce one `click` and no event carrying the typed text.
- **Build:** `build:lambda` sets the flag and writes `dist/events/`.
- **Terraform:** `terraform fmt -check` and `terraform validate` for both environments.

### Proof

After the user applies to staging: log in, click through a few pages, run the Logs Insights query, and paste the lines for that session in the PR. Agents don't run `terraform apply`; this step waits for the user.

## Leaves out

- Session replay, and any change to the recorder or `docs/event-log-format.md`.
- Third-party analytics, replay or error-tracking services.
- Dashboards and alarms on the events. Logs Insights is the reader.
- Server-side logging, which already goes to CloudWatch.
- Performance metrics (Web Vitals).
- Events from the login page and from anyone not logged in.

## Calls I made

Surprising first.

1. **A separate Lambda function for `/events`, not a route in the app.** Options: (a) a route handler in the app: least code, but with reserved concurrency 1 a batch that overlaps a page load makes one of them a 429, and each batch costs an S3 `HEAD`; (b) a separate function: about 100 lines of Terraform and a small handler, no effect on the app; (c) CloudFront access logs of a beacon `GET`: no Lambda, but event data in query strings, minutes of delay, a log bucket, and no session check. I chose (b). If the user prefers less infrastructure, (a) works with flushes timed for idle moments, at the cost of occasional 429s.
2. **Destination: CloudWatch Logs, 30-day retention.** Options: (a) the S3-synced SQLite file: rejected, because every batch would be a full-file upload with a conflict risk, and events would grow every backup; (b) separate S3 objects per batch: workable, but harder to read than Logs Insights and needs a lifecycle rule; (c) CloudWatch Logs: already how server logs are read, queryable, retention set in one place, cost near zero at this volume; (d) a hosted service: see call 4. I chose (c). Thirty days because the app's own log group keeps 14 and usage questions look further back; it is a variable.
3. **Purpose: usage analytics and error tracking, no session replay.** Replay needs input values, which is typed text, and the ticket rules typed text out unless needed. The existing event-log format records every `input` value, so reusing it would break that rule. Analytics plus errors answers "what gets used" and "what breaks" without it. Replay can be a later ticket with its own privacy call.
4. **No third-party script or host.** Options were Sentry (errors), PostHog or Plausible (analytics, PostHog also replay). Any of them needs a CSP change, a new host, and sends the user's activity outside their AWS account, for a site used by one person or very few. The first-party design covers the need without that. If the user wants a hosted replay UI later, that is a separate decision.
5. **Switched on at build time, switched off at run time.** `NEXT_PUBLIC_CLIENT_EVENTS=1` only in `build:lambda` guarantees local runs and tests ship no capture code at all. The off switch (`client_events = false`) is in Terraform so it needs no rebuild.
6. **Failed requests are captured by wrapping `window.fetch`.** Only same-origin, only 5xx, 429 and network errors, only method, pathname and status. This catches failed server actions and route loads, which the server log can miss (a 429 never reaches the app).
7. **Clicks report `data-event`, `aria-label`, `name` or `id`, never visible text.** Visible text includes album and artist names that came from searches. The build adds `data-event` to the main actions so the data says which ones were used.
8. **Path only, never query strings.** `/search?q=…` would put typed search text in the log.
9. **No user agent, IP or device id.** A random per-tab id groups a visit. Viewport width is kept as the one device hint (phone or desktop).
10. **Session check in the events function.** It reuses `verifySessionToken`, so only a logged-in browser can write events, and `Sec-Fetch-Site` plus the `SameSite=Lax` cookie keep other sites out.
11. **Delivery by `sendBeacon` every 15 s and on hide.** Events in the last seconds before a tab is killed may be lost. That is fine for analytics.

## Privacy limits (summary)

- Never captured: the password, the session cookie or any cookie, field values or typed text, query strings and hashes, visible page text, headers, bodies, IP address, user agent.
- Captured: pathnames, element tags and their `data-event`/`aria-label`/`name`/`id`, viewport width, error messages and stacks (clipped, origin removed), failed request method, pathname and status, a random per-tab id.
- Kept 30 days in the environment's own AWS account, readable only by someone with access to that account.
