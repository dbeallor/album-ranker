# Security sweep of the whole app, with follow-up tickets

**Status:** Approved
**Date:** 2026-11-22
**Ticket:** [ALBUM-64](https://github.com/dbeallor/album-ranker/issues/64)
**Related:** [ALBUM-14 deploy behind a password gate](https://github.com/dbeallor/album-ranker/issues/14), epic [#11](https://github.com/dbeallor/album-ranker/issues/11)

## Goal

Review the whole app for security problems once, write down what was found, and file a ticket for each thing worth fixing so each fix ships on its own. Reviews so far looked at one PR at a time. This one looks at everything that takes outside input or talks to an outside service, before #14 puts the app on the internet.

This ticket changes no app code. Its PR adds two markdown files: this spec and the report.

## What gets built

### The sweep

- One review subagent on Fable (`claude-fable-5-2`) at high effort runs the sweep, following the `owasp-security` skill (OWASP Top 10:2025 and ASVS 5.0). The parent (the builder) does not review; it checks each finding against the code and files the tickets.
- It reads the code at the branch's base commit on `main` and records that SHA in the report.
- Areas it must cover, each one named in the report as reviewed:
  1. **Server actions** (`app/search/actions.ts`, `app/matchups/actions.ts`, `app/import/actions.ts`, `app/library/remove/[albumId]/actions.ts`): input validation on every `FormData` field, type and length checks, IDs that point at rows the request should not touch, CSRF and origin checks as Next.js does them.
  2. **Spreadsheet import** (`app/import/`, `lib/import/`, `read-excel-file`): upload size and type limits, zip bombs and huge sheets, malformed files, row counts, what happens to cell text after import.
  3. **Catalog requests** (`lib/catalog/musicbrainz.ts`, `cover-art.ts`, `server-cover.ts`, `backfill-covers.ts`): SSRF (who controls the URL or host), redirects, timeouts, response size limits, unchecked JSON shapes, rate limits and the User-Agent.
  4. **Rendering catalog text and cover URLs**: raw HTML, `dangerouslySetInnerHTML`, `javascript:` or other non-`https` URLs reaching `href` or `src`, `next/image` remote patterns.
  5. **SQLite** (`lib/db/`, `node:sqlite`): SQL built from strings, migrations, file permissions of the database and backups.
  6. **Scripts** (`scripts/backup.ts`, `restore.ts`, `preview.ts`, `record.ts`): shell commands built from arguments, path handling, the 127.0.0.1 binding, what restore trusts.
  7. **`next.config.ts` and headers**: redirects, open redirects, missing response security headers (CSP, `X-Frame-Options` or `frame-ancestors`, `Referrer-Policy`, `X-Content-Type-Options`), the `X-Powered-By` header.
  8. **Secrets**: the tree and the full git history (`git log -p`, plus a scan for key shapes), `.gitignore` coverage of `.env` and `data/`.
  9. **Dependencies**: `npm audit` on `package-lock.json`, with each advisory marked as reachable or not from this app's code.
  10. **Exposure once deployed (#14)**: what anyone on the internet could do with the app as it is today, with no gate: which pages and actions are open, which ones change or delete data, error pages and stack traces, and what the gate in #14 must cover.

### The report

`docs/superpowers/specs/2026-11-22-album-64-security-sweep-report.md`. It holds:

- The model, the effort level, the skill used and the commit SHA reviewed.
- A summary table: ID (`S1`, `S2`, ...), severity, area, one-line title, follow-up ticket.
- One section per finding: severity, file and function, how to trigger it, the fix, and the follow-up ticket link (or "report only").
- One section per area from the list above, saying what was checked and "no findings" where that holds.
- An informational list: real but low value, no practical attack. These get no ticket.

Severity uses four levels: Critical, High, Medium, Low, plus Informational for report-only items.

### The follow-up tickets

Filed with the `write-ticket` skill's shape, one per finding or per group of findings in the same code:

- Title says what to fix in plain words. Body has `Related: #64`, then Today, Scope and Acceptance.
- Label `type:bug` for a flaw that can be triggered, `type:improvement` for hardening (headers, limits, defence in depth).
- Priority label from severity: Critical → `priority:urgent`, High → `priority:high`, Medium → `priority:medium`, Low → `priority:low`.
- Each one is a sub-issue of #11 (sub-issue endpoint, `Parent: #11` line as fallback).
- A finding that only matters once the app is on the internet says so in Today and is blocked by #14 (dependency endpoint, `Blocked by: #14` line as fallback).
- The report's table and finding sections link each ticket by number once filed.
- No status or `agent` label: the project manager and the approver decide when they start.

## What is left out

- Fixing any finding. Each fix is its own ticket.
- The password gate and deployment (#14).
- Testing against a running or deployed app. The sweep reads code, runs `npm audit` and scans git history; it may run the test suite but sends no attack traffic.
- Reviewing the agent-team files (`.claude/`, `docs/agents/`, collective-wisdom scripts). They are workflow, not the app.

## Calls I made

- **Report-only findings at Low too, not only Informational?** No. The ticket says only informational, no-practical-attack items stay out of tickets, so every Low finding gets a ticket (grouped with others in the same code where it fits) at `priority:low`.
- **The report lives in `docs/superpowers/specs/`** as the ticket asks, as its own file beside this spec, not inside it. The docs index will list it as a spec.
- **One Fable subagent runs the whole sweep**, not one per area. The areas share code (catalog text flows into rendering, the import writes to SQLite), and one reader sees those paths end to end. If it runs out of room it splits into two Fable passes by area, and the report says so.
- **The builder checks every finding before filing.** A finding the builder cannot confirm in the code goes in the report marked "not confirmed" with the reason, and gets no ticket.
- **Grouping rule:** findings in the same file or the same fix share a ticket; findings with different severities in one group take the highest severity's priority.
- **Missing security headers count as hardening (`type:improvement`)**, and are blocked by #14 since they matter once the app is reachable from other machines.
- **No plan file.** The PR changes only markdown, so the build runs from this spec (`kickoff-feature` step 6).
- **Severity is judged for the app as it will be once #14 ships** (on the internet behind a password gate), and each finding says if it is lower today, while the app only runs on 127.0.0.1.

## Acceptance

- The report exists and names all ten areas as reviewed, with "no findings" where that holds.
- Every finding above Informational has a follow-up ticket linked from the report, under #11, with `Related: #64`.
- The PR changes only the spec and the report.
- The report states the model (`claude-fable-5-2`), the effort (high) and the commit reviewed.
