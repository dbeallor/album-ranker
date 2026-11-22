# Check the shipped password gate against the sweep's list

**Status:** Shipped
**Shipped:** in PR #73, as specified
**Date:** 2026-11-22
**Ticket:** [ALBUM-65](https://github.com/dbeallor/album-ranker/issues/65)
**Follows:** [ALBUM-64 security sweep report](2026-11-22-album-64-security-sweep-report.md) (finding S1), [ALBUM-14 AWS deploy](2026-11-22-album-14-aws-terraform-deploy.md)

## Goal

The security sweep (S1) listed what the password gate had to cover. The gate shipped in #14 after the sweep, so nobody has checked it against that list. This ticket checks each item against `main` at `0f965e1`, fixes the gaps, and adds tests where a check is cheap to keep.

## What the check found

Each item from the ticket, with where it is met in code today.

| # | Item | Today | Action |
|---|---|---|---|
| 1 | Every server action calls `requireSession()`, and a POST with no session is refused | Met. All 8 actions start with `await requireSession()` (`app/search`, `app/matchups` x3, `app/import` x3, `app/library/remove/[albumId]`). `lib/auth/actions-guard.test.ts` fails if an exported action in an `actions.ts` doesn't. A POST with no cookie gets 401 from the proxy (`lib/auth/gate.test.ts`), and `requireSession()` redirects to `/login` if the proxy is bypassed (`require-session.test.ts`). | None |
| 2a | Session cookie is `HttpOnly`, `Secure`, `SameSite=Lax` | Met. `app/login/actions.ts` sets `httpOnly: true`, `sameSite: "lax"`, `secure` whenever `DEPLOY_ENV` is set; `app/login/actions.test.ts` checks all three. | None |
| 2b | `serverActions.allowedOrigins` stays unset | Met: `next.config.ts` has no `serverActions`. No test guards it. | Add a test |
| 2c | CloudFront forwards the public host in `X-Forwarded-Host` | Met. The viewer-request function in `infra/modules/app/main.tf` sets `x-forwarded-host` from `Host`; the proxy builds redirects from it. | None |
| 3 | The password form is rate limited | Met. `lib/auth/login-limiter.ts`: 10 wrong passwords in 15 minutes lock that IP for 15 minutes, plus a 1 second pause on each wrong one. Keyed on `x-viewer-ip`, which CloudFront overwrites. Tested. | None |
| 4 | Deployed command is the production build, never `next dev` | Met. `next.config.ts` sets `output: "standalone"`; `npm run build:lambda` packages `.next/standalone/server.js`, and `run.sh` runs `node lambda/server.ts`, which imports `server.js`. `next dev` is not in the package. No test guards `output`. | Add a test |
| 5 | The app is not reachable around the gate | Met. The function URL has `authorization_type = "NONE"` (CloudFront can't sign POST bodies), but the proxy answers 403 to any deployed request without the 24-character `x-origin-secret` CloudFront adds, compared in constant time (`gate.test.ts`). There is no VPC or security group: the function URL is the only way in. | None |
| 6 | A backup runs on a schedule | Met on AWS, differently: the data bucket is versioned and keeps every replaced copy of `album-ranker.db` for 30 days, so every write is a backup. The function's role has `GetObject` and `PutObject` only, so the app can't delete a version. README § Back up, restore, undo a restore has the commands. | None |
| 7 | Failed gate attempts are logged | **Missing.** Nothing in `proxy.ts`, `lib/auth/` or `app/login/` logs. A wrong password, a lockout and a request without the origin secret leave no trace in CloudWatch. | Fix |

## What changes

### Log failed gate attempts

One line per failed attempt, written with `console.warn` so it lands in the function's CloudWatch log group (14 days, already in Terraform). Each line is `[gate] ` followed by one JSON object, so a value can't break the line:

- **Wrong password** (`app/login/actions.ts`): `{"event":"login-failed","ip":"<x-viewer-ip>"}`. The try that starts a lock adds `"locked":true`.
- **Refused during a lock**: `{"event":"login-locked","ip":"<ip>"}`.
- **Wrong or missing origin secret** (`proxy.ts`, the 403): `{"event":"origin-denied","path":"<pathname>"}`. There is no viewer IP here: these requests skipped CloudFront.
- **Gate misconfigured** (the 503): `console.error` with `{"event":"gate-misconfigured","reason":"<gatePasswordProblem text>"}`, so a broken deploy shows up in the log, not only as a 503 page.

Never logged: the password typed, the session cookie, the origin secret, the `next` value, or query strings.

`loginLimiter.recordFailure` returns whether that failure started a lock, so the action can say so without a second lookup.

A visit with no session (the 307 to `/login`, or 401 for a data request) is not logged. Every first visit and every expired cookie does that, so it is normal traffic, not a failed attempt.

### Guard the two config facts with a test

A small test reads `next.config.ts` and checks `output` is `"standalone"` and `serverActions?.allowedOrigins` is undefined, with a message naming the sweep item each one protects.

## Tests

- `app/login/actions.test.ts`: the existing case table checks which log line each case writes (none for the right password, `login-failed` for a wrong or missing one). The lockout test checks the tenth failure logs `"locked":true` and the refused right password logs `login-locked`. No case logs the password.
- `lib/auth/login-limiter.test.ts`: `recordFailure` returns `true` only on the failure that locks.
- `proxy.test.ts`: the existing table gains the expected log event per row (`origin-denied` for the 403, `gate-misconfigured` for the 503, none for the rest).
- The `next.config.ts` test above.
- `npm test`, `npm run typecheck` and `npm run lint` pass.

## Leaves out

- A CloudWatch metric filter or alarm on the new lines. They are searchable in the log group; an alarm is a separate ticket if wanted.
- Logging every 401 or redirect to `/login` (see Calls I made).
- A scheduled backup job on AWS (EventBridge copy to a second bucket) and scheduled local backups. Versioning already saves every write; local runs are the owner's machine and covered by `npm run db:backup`.
- Locking the function URL down further (`AWS_IAM` auth with Lambda@Edge signing, or a WAF). The origin secret check covers it; see #66 for the local bind address.
- Changes to the limiter's numbers or to keep its count across cold starts.

## Calls I made

- **Only real failures are logged, not every unauthenticated request.** Wrong passwords, lockouts, missing origin secret and a misconfigured gate. Logging each 307 to `/login` would log every first visit and drown the attempts.
- **S3 versioning counts as the scheduled backup.** The sweep asked for a backup on a schedule because the delete actions can't be undone. On AWS every write keeps the previous copy for 30 days and the app can't delete versions, which covers that without a timer. No new backup job.
- **The origin-secret 403 is logged without an IP.** These requests reach the function URL directly, so there is no `x-viewer-ip` to trust, and the Lambda Web Adapter's source address is not exposed to the app.
- **`console.warn` with a `[gate]` prefix and JSON, not a logging library.** The app has no logger; CloudWatch takes stdout and stderr as is, and `filter @message like "[gate]"` in Logs Insights finds them.
- **The function URL stays `authorization_type = "NONE"`.** The origin-secret check already refuses direct calls; `AWS_IAM` would need request signing at the edge for POST bodies, which is more infra than this gap warrants.
- **Two config facts get a test; the rest of the items are already tested.** `output: "standalone"` and the missing `allowedOrigins` had no guard, and a later edit to `next.config.ts` could undo either silently.
