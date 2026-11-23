# ALBUM-85 plan: front-end event capture

Spec: `docs/superpowers/specs/2026-11-23-album-85-front-end-event-capture.md`. Follow it; this plan only orders the work. Read `node_modules/next/dist/docs/` for Next 16 specifics (AGENTS.md) before writing Next code.

## Task 1: browser side

Files: `lib/client-events/clean.ts`, `lib/client-events/clean.test.ts`, `components/client-events.tsx`, `components/client-events.test.tsx`, `app/layout.tsx`, `data-event` attributes in `components/matchup-screen.tsx`, `components/import-review-card.tsx`, `app/search/page.tsx`, `app/search/search-box.tsx`, and `scripts/build-lambda/index.ts` (+ a small env test).

- `clean.ts`: pure (no Node or browser APIs), shared by the browser and the handler. Exports the event types, `cleanEvent(raw: unknown): ClientEvent | null` and `cleanBatch`. Applies every field rule in the spec: pathname only (`"external"` for other hosts), clip, origin removal, whole-number `vw`, int statuses, unknown types and fields dropped.
- `client-events.tsx`: renders nothing unless `NEXT_PUBLIC_CLIENT_EVENTS === "1"`, nothing on `/login`. Per-tab session id, page/click/submit/error/rejection/request-failed events, buffer of 100, `sendBeacon` to `/events` every 15 s while non-empty, on `visibilitychange` hidden and on `pagehide`; events kept if `sendBeacon` returns false; capture errors swallowed. Rendered once in `app/layout.tsx`.
- `data-event` on the main actions that have no name, aria-label or id. No behavior or styling change.
- `build-lambda/index.ts`: `next build` gets `NEXT_PUBLIC_CLIENT_EVENTS=1`, rest of env kept.
- Acceptance: one table-driven test per cleaning rule; component test: nothing without the flag, nothing on `/login`, with the flag a click and typed text give one `click` event and no event with the typed text.
- Verify: `npm test`, `npm run lint`, `npm run typecheck`.

## Task 2: events Lambda

Files: `lambda/events.ts`, `lambda/events.test.ts`, `scripts/build-lambda/index.ts`.

- Handler answers in the spec's order (404 off, 403 secret, 405 method, 403 cross-site, 401 cookie, 413/400 body, 204) and logs `[client-event] {json}` per valid event via `cleanBatch`, plus `[client-event-refused]` on failures. Never logs cookie, headers, IP or user agent.
- `build:lambda` transpiles the handler with `lib/auth/session.ts` and `lib/auth/compare.ts` into `dist/events/`.
- Acceptance: one test row per answer; a good batch logs one line per valid event with no request data; the build writes `dist/events/`.
- Verify: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build:lambda`.

## Task 3: Terraform, README, CSP test

Files: `infra/modules/app/*`, `infra/envs/*/*`, `README.md`, `lib/security-headers.test.ts`.

- Events function, function URL, log group (`client_events_retention_days`, default 30), role, CloudFront origin and `/events` behavior, `client_events` variable (default true), as in the spec.
- README "Front-end events" part (tail, Logs Insights queries, what is and is not captured, how to switch off).
- `security-headers.test.ts`: a row asserting `connect-src` is exactly `'self'`.
- Acceptance: `terraform fmt -check` and `terraform validate` for both environments; no `terraform apply` (the user does that).
- Verify: `npm test`, `npm run lint`, `npm run typecheck`, terraform commands above.
