# As-built: Capture front-end events in staging and production

**Shipped:** in PR #89
**Ticket:** ALBUM-85
**Spec:** [2026-11-23-album-85-front-end-event-capture.md](../specs/2026-11-23-album-85-front-end-event-capture.md)

## Differs from the spec

- The events function runtime is nodejs24.x (matches the app), not 22.
- The events handler ships as transpiled ESM JavaScript in `dist/events` (handler `lambda/events.handler`), not run from TypeScript.
- `next.config.ts` sets `NEXT_PUBLIC_CLIENT_EVENTS` to "0" when unset, so non-flagged builds drop the capture code.
- No log out control exists, so `data-event` tags went on pick-a, pick-b, tie, skip, undo, the import review buttons, add-album and search instead.
- Aborted fetches are not reported as failed requests.
- The capture code is split into `components/client-events-capture.tsx` so builds without the flag drop it.
- Reserved concurrency of the events function follows the app's -1 low-quota fallback.
- The per-tab event counter (`seq`) is kept in sessionStorage.
- `lib/auth/session.ts` imports now use `.ts` extensions so the events package can follow them.
- A batch is cut to 30 KB of body, and on hide or pagehide the buffer goes out in up to 5 batches, not one.
- Error message and stack text also lose query strings and hashes, and `data:` URLs are reduced to `data:`, not just the origin.
- `client_events_retention_days` is validated against CloudWatch's allowed values.
- After ALBUM-84 landed (a CI deploy role scoped to the staging app's exact names), the events function's IAM role carries the same permissions boundary as the app's role, and `infra/ci` (deploy role policy and the boundary's log write) now also covers the `album-ranker-staging-events` function, role and log group, each by exact name. `infra/ci` has to be applied again by hand, from this branch's checkout (`main`'s `infra/ci` lacks the events names until the merge), before the first merge that contains the events function; if the merge goes first, the staging deploy fails with `AccessDenied` until `infra/ci` is applied from `main` and the workflow re-run.
