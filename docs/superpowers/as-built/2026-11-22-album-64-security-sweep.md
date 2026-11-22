# As-built: Security sweep of the whole app, with follow-up tickets

**Shipped:** in PR #71
**Ticket:** ALBUM-64
**Spec:** [2026-11-22-album-64-security-sweep.md](../specs/2026-11-22-album-64-security-sweep.md)

## Differs from the spec

- The spec says findings that matter only on the internet are "blocked by #14". #14 merged (PR #63) while the sweep was running, so #65 and #69 were filed blocked and then unblocked. No ticket is blocked by #14.
- The spec has the sweep list what the gate must cover. The sweep reviewed `c66e880`, before the gate existed, so #65 became "Check the shipped password gate against the sweep's coverage list". The gate, `proxy.ts`, `lib/auth/`, the S3 sync and the Terraform were not reviewed.
- The spec says the app runs on 127.0.0.1 only today. The sweep found that `npm run dev` and `npm start` listen on every interface (S2, #66).
- The test suite was not run (no `node_modules` in the worktree).
