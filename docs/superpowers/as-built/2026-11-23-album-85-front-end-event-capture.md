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
