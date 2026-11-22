# ALBUM-65 check the password gate: plan

Spec: [2026-11-22-album-65-check-password-gate.md](../specs/2026-11-22-album-65-check-password-gate.md)

Test command: `npm test`; also `npm run lint` and `npm run typecheck`. The worktree may need `npm install` first.

1. `lib/auth/gate-log.ts` (new): `logGate(event: Record<string, string | boolean>, level: "warn" | "error" = "warn")` writes `[gate] ${JSON.stringify(event)}` with `console.warn`/`console.error`. Callers pass only the fields the spec lists.
2. `lib/auth/login-limiter.ts`: `recordFailure` returns `true` only when that failure starts a lock. Extend the table in `login-limiter.test.ts`.
3. `app/login/actions.ts`: on a locked IP log `login-locked`; on a wrong or missing password log `login-failed` with `ip` (add `locked: true` when `recordFailure` returned true). Nothing on success. Extend the case table in `actions.test.ts` (spy on `console.warn`) to check the line per case, including that the password never appears, and the lockout test for `locked: true` and `login-locked`.
4. `proxy.ts`: when `gateDecision` returns `deny` 403 log `origin-denied` with `path`; for 503 log `gate-misconfigured` at error level with `reason` from `gatePasswordProblem(readGateConfig())` (or "APP_PASSWORD is not set." when it returns null). No log for pass, redirect or 401. Extend the `proxy.test.ts` table with the expected event per row.
5. `next.config.test.ts` (new, root): import the config; check `output === "standalone"` and `serverActions?.allowedOrigins === undefined`, each with a message naming the sweep item (S1 items 5 and 3).
6. Spec closeout happens in open-pr.
