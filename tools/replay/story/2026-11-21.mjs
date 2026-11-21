// The whole "ALBUM - Chief of Staff" session (2026-11-20 6:01 p.m. to 2026-11-21 1:05 a.m. in New York): narration and what happens on the stage, beat by beat.
// Times are the real ones (UTC); the dashboard is drawn as it was at the clock's time. Chat replies are the real messages, condensed.
import fs from 'fs'
import { clock, ff, later, type, sent, reply, worked, card, patchCard, waitOn, thinking, intro, openDashTab, dashTab, openPanel, scrollDash, scrollToHeading, scrollGhBy, filesChanged, backToDash, closeOldTabs, approve, changes, startShipping, viewSpec, viewPr } from '../lib/director.mjs'
import { hold, until, pauseVoice, resumeVoice } from '../lib/recorder.mjs'

const FX = new URL('../fixtures/2026-11-21/', import.meta.url).pathname

export const meta = {
  date: '2026-11-20',
  timeline: 'timeline/2026-11-21.json',
  fixtures: 'fixtures/2026-11-21',
  dashUrl: 'http://127.0.0.1:47332/',
  tree: ['.gitignore', 'README.md', 'docs/agents/project.md'],
  setup: { project: 'Album Ranker', projectAvatar: 'AR', thread: 'ALBUM - Chief of Staff', branch: 'main', model: 'Sonnet 5.5', effort: 'Medium' },
  sidebarThreads: JSON.parse(fs.readFileSync(`${FX}threads.json`, 'utf8')),
}

const prOf = (n) => ({ pr: JSON.parse(fs.readFileSync(`${FX}pr-${n}.json`, 'utf8')), diff: fs.readFileSync(`${FX}pr-${n}.diff`, 'utf8') })

const M = {
  setup: `The setup PR is open: https://github.com/dbeallor/album-ranker/pull/1

It adds \`docs/agents/project.md\` and a \`.agent-team/\` line in \`.gitignore\`. I haven't merged it.

The answers I used:
- **Tracker:** \`github\`, using \`dbeallor/album-ranker\`.
- **Issue prefix:** \`ALBUM\`.
- **Test command:** none yet.
- **Approver and login:** \`dbeallor\`.

To finish, merge the PR, pull \`main\` in this checkout, then say \`start the team\`.`,
  start: `The team is running, but it has nothing to work on: the repo has no tickets yet.

- **Setup:** I created the 12 labels the team uses and started the state file.
- **Dashboard:** it's at http://127.0.0.1:47332/ and open in a preview tab.
- **Slots:** the team can run 2 spec and 2 build children at once, with 1 merge at a time.

To give the team work, say "new ticket" with a description. Say \`status\` any time to see the board.`,
  tickets1: `On it: ticket helper. It will write the MVP spec ticket and a wave of follow-up tickets in the Backlog, each linking back to the spec ticket.`,
  tickets2: `**Tickets**

The helper wrote nine tickets, all in the Backlog.

| Ticket | Title | Blocked by |
|---|---|---|
| ALBUM-2 | MVP requirements spec | none |
| ALBUM-3 | Stack and scaffold | 2 |
| ALBUM-4 | Data model and storage | 2, 3 |
| ALBUM-5 | Catalog search with covers | 2, 3 |
| ALBUM-6 | Per-year ranking screen | 2, 4, 5 |
| ALBUM-7 | Scoring engine | 2, 4 |
| ALBUM-8 | Artist views | 2, 7 |
| ALBUM-9 | Decade top 25 lists | 2, 7 |
| ALBUM-10 | Spreadsheet import | 2, 4, 5 |

**Needs you**
- **Scoring:** you haven't said what you dislike about the current scoring. ALBUM-2 will need that.
- **Starting work:** nothing runs until a ticket moves to Todo. Only ALBUM-2 can start now. The rest are blocked on it.`,
  critique: `On it: ticket helper. It will create "Epic: Album ranker MVP" and put ALBUM-2 to 10 under it.

## Critique of the current scoring

I read all 754 rows, covering 1955–2024.

1. **The weight measures how much you logged, not how good the year was.** 2019 and 2021 have 41 albums and weigh 1.0. Years with one album weigh 0.395.
2. **The 0.25 exponent is a hand-tuned knob.** A different exponent would reorder your lists.
3. **Some #1s count for far less than others.** A #1 in a one-album year scores 3.95, a #1 in a big year scores 10.
4. **Nothing can calibrate one year against another.** Your ranks only compare albums within the same year.

**My lean:** pairwise head-to-head matchups with Elo for albums, and an average-based score for artists.`,
  epic: `**Tickets**

- **Epic:** ALBUM-11 "Epic: Album ranker MVP" is created. ALBUM-2 to ALBUM-10 are now sub-issues of it.
- **ALBUM-2:** it now has a "Scoring: open question" section with the critique and the alternatives.

When you're ready for the team to start, move ALBUM-2 to Todo. It's the only unblocked ticket.`,
  start2: `ALBUM-2 is now In Progress, with a spec child writing the MVP requirements. I'm waiting for it to finish.

- **ALBUM-2:** it moved from Todo to In Progress. A spec child on Opus 5.5 is working on the branch \`feat/album-2-mvp-requirements-spec\`.
- **Approval:** when the spec is ready I'll ask for your \`approve 2\` or \`changes 2: …\`.
- **Other tickets:** ALBUM-3 to ALBUM-10 stay blocked until ALBUM-2 is done.`,
  spec1: `ALBUM-2's spec is written and waiting for your approval.

**ALBUM-2 build ready: Album ranker MVP requirements. Risk: High (touches data, and one call needs your decision)**

**Builds**
- A one-person web app with a small server and a SQLite file, run on localhost.
- Catalog search with album covers.
- A year page with ten ranked slots, an honorable mention area and a "listed" area.
- Two scoring options you can switch between: today's spreadsheet rule, and a new medal table with no weights.

**Calls the child made**
- ⚠ **Medal table:** it proposes this as the new scoring instead of the weighted points. Your spreadsheet rule stays the default until you switch.
- **Spreadsheet formulas:** the child read the actual formulas. The year weight is \`(N/41)^(1/4)\`, and there are 752 rows, not 674.

Reply "approve 2" to start the build, or "changes 2: …" to send it back.`,
  changes: `I sent your changes to the ALBUM-2 spec child, and it is revising the spec now.

- **What I relayed:** your words as written: "changes 2: ditch multiple algorithm support. go with head to head elo algorithm".
- **What to expect:** head-to-head matchups with Elo as the only ranking method. That also affects ALBUM-7, ALBUM-6 and ALBUM-10.`,
  spec2: `**ALBUM-2 build ready (revised): Album ranker MVP requirements. Risk: High (touches data, new ratings model)**

**Builds**
- A matchup screen with two covers where you pick one, call a tie, skip or undo. Every answer updates one Elo rating per album across all years.
- A year page with ten ranked slots, each showing its rating.
- Artist lists overall and one decade at a time, plus hand-ranked decade top 25 lists.

**Leaves out**
- More than one scoring method, a scoring settings screen, and the spreadsheet's points and year weight.

**Calls the child made**
- ⚠ **Seeding:** your yearly ranks are replayed as wins before any matchups, so the app has a usable order from day one.
- **Elo numbers:** fixed at a start of 1500 and K of 32, with no settings screen.

Reply "approve 2" to start the build, or "changes 2: …" to send it back.`,
  approved: `ALBUM-2 is approved and moved to the build stage. I'm waiting for the spec PR.

- **Relayed:** your "approve 2" went to the spec child, which will open the PR and run its reviews. It's now on Sonnet 5.5, the model for the build stage.
- **Ticket helper:** it is applying the spec's edits to ALBUM-3 to 10, rewriting ALBUM-7 as the Elo engine plus the matchup screen.`,
  helper: `**Tickets**

The helper finished the follow-up edits:

- **ALBUM-3 to 10:** all are edited to match the approved Elo spec.
- **ALBUM-7:** it is retitled "Build the Elo rating engine and matchup screen".
- **ALBUM-14:** this is new, "Deploy the app with a password gate". It is blocked by ALBUM-2.

**Needs you**
- **ALBUM-6 and ALBUM-7:** say "link 6 behind 7" if ALBUM-6 should wait for the engine.`,
  mergeready: `**ALBUM-2 merge ready: docs: ALBUM-2 MVP requirements spec. Risk: Low (docs only, 1 file)**
PR: https://github.com/dbeallor/album-ranker/pull/13, head 42e9abb
Reviews: code review PASS (pass 4), security review PASS
CI: the repo has no CI, so there are no checks.
Cost: $3.97 API-equivalent, 6.1M tokens

**Changes**
- Adds the MVP spec: one-person web app with SQLite, catalog search with covers, one head-to-head Elo rating seeded from your yearly ranks, artist and decade views, and a one-off spreadsheet import with a review step.

Reply "approve 2" to approve and merge, or "changes 2: …" to send it back.`,
  merging: `Your merge approval for PR #13 is sent to the ALBUM-2 child, and it is merging now.

- **Checks:** the PR head still matches the reviewed one (42e9abb).
- **After the merge:** I'll pull \`main\` in this checkout so ALBUM-3 becomes startable.`,
  merged: `ALBUM-2 is merged, and the Backlog is waiting for you to say what starts next.

- **ALBUM-2:** PR #13 is merged at \`815973c\` and the ticket is closed.
- **What's unblocked:** with ALBUM-2 done, ALBUM-3 (stack and scaffold) can start.
- **To start the next ticket:** say "mark 3 todo", or say \`backlog\` to let the project manager pick.`,
  house: `I've started ALBUM-3 and sent the 6-and-7 link to a ticket helper.

- **ALBUM-11:** it now has the \`agent-skip\` label, so the team won't try to build the epic.
- **ALBUM-3:** moved to In Progress. A spec child on Opus 5.5 is working on \`feat/album-3-stack-scaffold\`.
- **Link 6 and 7:** ALBUM-6 is now blocked by ALBUM-7.`,
  spec3: `**ALBUM-3 build ready: Choose the tech stack and scaffold the app. Risk: Medium (app scaffold, edits \`docs/agents/project.md\`)**

**Builds**
- A TypeScript Next.js app (App Router, React) on Node 24 or newer, using npm. The one page shows only the heading "Album ranker".
- Commands: \`npm run dev\`, \`npm test\` (Vitest), \`npm run lint\` (ESLint), \`npm run typecheck\` and \`npm run build\`.
- Real Test, Lint and Typecheck values in \`docs/agents/project.md\`.

**Leaves out**
- Any album, ranking or rating feature, and the SQLite driver (left to ALBUM-4).

Reply "approve 3" to start the build, or "changes 3: …" to send it back.`,
  built3: `Your approval for ALBUM-3 went to its child, and the scaffold build has started. I'm waiting for the PR.

- **Relayed:** your "approve 3" was sent as written, and the child is now on Sonnet 5.5 for the build.
- **Next:** I'll bring the PR back for your merge approval. When ALBUM-3 is done, ALBUM-4 and ALBUM-5 can start.`,
  mergeready3: `**ALBUM-3 merge ready: feat: ALBUM-3 choose the stack and scaffold the app. Risk: Medium (21 files, edits \`docs/agents/project.md\`)**
PR: https://github.com/dbeallor/album-ranker/pull/16, head 1a0aaf2
Reviews: code review PASS, security review PASS
CI: the repo has no CI. The child ran tests, lint, typecheck and build locally and in a fresh clone, and all pass.

**Changes**
- A TypeScript Next.js scaffold with npm, Vitest, ESLint and \`tsc\`. The page \`/\` shows only the heading "Album ranker".
- Real Test, Lint and Typecheck commands in \`docs/agents/project.md\`.

**Not proven:** it hasn't run on any machine other than this one.

Reply "approve 3" to approve and merge, or "changes 3: …" to send it back.`,
  merged3: `ALBUM-3 is merged. PR #16 landed on \`main\` at \`27a4211\` and the ticket is closed.

**What's unblocked**
- ALBUM-4 (data model and storage) and ALBUM-5 (catalog search with covers) can both start now.
- They don't depend on each other, so the team can run them side by side.`,
  started45: `ALBUM-4 and ALBUM-5 are both started, with a spec child on each.

- **ALBUM-4:** it moved to In Progress. Its child is working on the branch \`feat/album-4-data-model-storage\`.
- **ALBUM-5:** it moved to In Progress. Its child is working on \`feat/album-5-catalog-search\`.

Both spec slots are now in use. ALBUM-6, 7, 8, 9 and 10 stay blocked until ALBUM-4 and ALBUM-5 are done.`,
  spec4: `**ALBUM-4 build ready: Define the data model and storage for albums, years and rankings. Risk: High (touches data and migrations)**

**Builds**
- A database schema with six tables: artists, albums, year entries, matchups, decade lists and import review items. Ratings are never stored.
- Numbered SQL migration files with a small runner, and code for reading and writing each table under \`lib/db/\`.

**Calls the child made**
- ⚠ **SQLite driver:** it uses Node's built-in \`node:sqlite\` with plain SQL and no ORM.

Reply "approve 4" to start the build, or "changes 4: …" to send it back.`,
  spec5: `**ALBUM-5 build ready: Add album catalog search with cover art. Risk: High (⚠ a default you might not expect)**

**Builds**
- A \`/search\` page. Each result shows the cover, title, credited artist and original release year.
- A server-only \`searchAlbums(query)\` that calls the MusicBrainz release-group search. Each album appears once, not once per edition.
- Covers come from Cover Art Archive, with a placeholder when one is missing.

**Calls the child made**
- ⚠ **Catalog choice:** it picked MusicBrainz plus Cover Art Archive over iTunes, Discogs, Spotify and Last.fm. It is the only free option that groups editions into one album.

Reply "approve 5" to start the build, or "changes 5: …" to send it back.`,
  both45: `Both approvals went through, and both builds have started.

- **ALBUM-4 (data model and storage):** the child is now on Sonnet 5.5 and building the data layer.
- **ALBUM-5 (catalog search with covers):** the child is now on Sonnet 5.5 and building search.

Both are in the build stage, which fills the two build slots.`,
  mergeready5: `**ALBUM-5 merge ready: feat: ALBUM-5 album catalog search with cover art. Risk: High (⚠ no contact details sent to MusicBrainz by default)**
PR: https://github.com/dbeallor/album-ranker/pull/17, head b558694
Reviews: code review PASS, security review PASS
CI: the repo has no CI. The child ran 41 tests, lint, typecheck and build locally, and all pass.

**Changes**
- A new \`/search\` page, and a server-only \`searchAlbums\` over MusicBrainz release groups. Covers come from Cover Art Archive.
- A missing cover shows a placeholder.

**Not proven:** cover display in a browser.

Reply "approve 5" to approve and merge, or "changes 5: …" to send it back.

ALBUM-4 is still building.`,
  merging5: `Your approval for PR #17 is sent to the ALBUM-5 child, and it is merging now.

- **ALBUM-4:** its build is still running. I'll bring its PR back for your merge approval when it's ready.`,
  reset1: `Resetting my context (size 220k, over the 220k cap). The notes file and state carry everything over.

ALBUM-4 is still building and ALBUM-5's merge is in progress. I'll pick both up in the take-over pass.`,
  takeover1: `Take-over done. 1 ticket in flight.

- **ALBUM-5:** merged as PR #17.
- **ALBUM-4:** still building, with code review running on PR #18. Its PR now conflicts with \`main\` because ALBUM-5 merged. The child is running, so I left it to find the conflict in its own CI wait.`,
  mergeready4: `**Needs you: ALBUM-4 merge approval.**

ALBUM-4 is ready to merge. The repo's approval setting is \`strict\`, so I can't auto-approve it.

\`\`\`
ALBUM-4 merge ready: feat: ALBUM-4 data model and storage. Risk: High (new SQLite schema and migration, data layer, 27 files)
PR: https://github.com/dbeallor/album-ranker/pull/18, head 50b1573
Reviews: code review PASS, security PASS
Changes:
- SQLite database on Node's built-in node:sqlite, with six tables, numbered SQL migrations and npm run db:migrate.
- Data layer in lib/db/ enforcing the spec's rules.
Risks:
- A main merge after ALBUM-5 landed conflicted in README.md and docs/stack.md. The child kept both sides and reran both reviews, which still PASS.
Reply "approve 4" to approve and merge, or "changes 4: …" to send it back.
\`\`\``,
  merged4: `ALBUM-4 is merged as PR #18, so no tickets are in flight now.

- **State:** merged in the last 24h: ALBUM-2, ALBUM-3, ALBUM-5 and ALBUM-4.
- **Next:** say \`backlog\` and I'll run the project manager's pick, or move a ticket to Todo yourself.`,
  todo3: `Tickets 7, 10 and 14 are in Todo. Specs have started for ALBUM-7 and ALBUM-10, and both children are running.

- **Unblocked:** 7 (Elo engine and matchup screen), 10 (spreadsheet import) and 14 (deploy with password gate) had no open blockers.
- **Still blocked:** 6, 8 and 9 wait on #7.
- **Queued:** ALBUM-14 stays in Todo because both spec slots are full. It starts when a slot frees.`,
  spec7: `**Needs you: ALBUM-7 spec approval.**

The spec is ready. The repo's approval setting is \`strict\`, so I can't auto-approve it.

\`\`\`
ALBUM-7 build ready: Elo rating engine and matchup screen. Risk: High (writes and deletes matchup data)
Builds:
- Rating engine: one Elo rating per album (start 1500, K = 32), replayed on every request and never stored.
- A new /matchups screen: two covers side by side with "I like this more", Tie, Skip, Undo and a counter.
Calls the child made:
- ⚠ Undo deletes the newest stored answer, even one from an earlier session.
Reply "approve 7" to start the build, or "changes 7: …" to send it back.
\`\`\``,
  built7: `ALBUM-7's spec is approved and its build has started on Sonnet 5.5. ALBUM-14's spec has started in the freed slot.

- **ALBUM-7:** building.
- **ALBUM-10:** spec still being written.
- **ALBUM-14:** spec being written (hosting choice, password gate, deploy and backup steps).`,
  spec10: `**Needs you: ALBUM-10 spec approval.**

The spec is ready. The repo's approval setting is \`strict\`, so I can't auto-approve it.

\`\`\`
ALBUM-10 build ready: Import the existing spreadsheet. Risk: High (touches data, migration 002, new dependency)
Builds:
- npm run import -- "<path>" reads the Albums sheet, matches each row to MusicBrainz and writes year entries and decade list entries. Your 752 rows take about 15 minutes.
- A review page at /import for the rows that can't be matched.
Reply "approve 10" to start the build, or "changes 10: …" to send it back.
\`\`\``,
  helper19: `On it: ticket helper. It is writing the frontend event tracking ticket for the replay renderer.`,
  built10: `ALBUM-10's spec is approved and its build has started on Sonnet 5.5.

- **Building:** ALBUM-7 (Elo engine and matchup screen) and ALBUM-10 (spreadsheet import).
- **Spec stage:** ALBUM-14 (deploy with a password gate), still being written.`,
  ticket19: `Ticket written: ALBUM-19, "Add frontend event tracking for replaying browser tests". It is in Backlog.

- **Assumed:** capture covers clicks, typing and route changes, and tracking is off unless a test run turns it on.
- **Event format:** the renderer thread should settle it. The ticket doesn't fix one.`,
  helper20: `On it: ticket helper. It is writing the local preview environments ticket.`,
  spec14: `**Needs you: ALBUM-14 spec approval.**

The spec is ready. The repo's approval setting is \`strict\`, so I can't auto-approve it.

\`\`\`
ALBUM-14 build ready: Deploy the app with a password gate. Risk: High (touches auth, data, money)
Builds:
- A login page with one password, and a check on every request that sends you to it until you sign in.
- A Docker image and a fly.toml for Fly.io: one machine, HTTPS forced, the SQLite file on a disk that survives restarts.
Calls the child made:
- ⚠ Fly.io is the host, about $2–5 a month, chosen over Railway, Render or a VPS.
Reply "approve 14" to start the build, or "changes 14: …" to send it back.
\`\`\``,
  ticket20: `Ticket written: ALBUM-20, "Add local preview environments for main and per-ticket branches". It is in Backlog.

- **Assumed:** the main preview runs from the root checkout, which stays on \`main\`. A ticket's port comes from a rule.`,
  hold14: `ALBUM-14 is back in Backlog and out of the team's state, so it no longer has an approval waiting.

- **Label:** I added \`agent-skip\` so the Backlog pick won't restart it on its own. Removing \`agent-skip\` lets it start again.
- **Spec:** it stays on \`feat/album-14-deploy-password-gate\` (commit b0e86b7).`,
  four: `ALBUM-19 and ALBUM-20 are the unblocked tickets. Both are in Todo, and their specs are now being written, so four children are active.

- **Spec stage:** ALBUM-19 (frontend event tracking) and ALBUM-20 (local preview environments), both on Opus 5.5.
- **Build stage:** ALBUM-7 (Elo engine) and ALBUM-10 (spreadsheet import).
- **Skipped:** ALBUM-14, because you put it on hold with \`agent-skip\`.
- **At the cap:** all four active slots are full.`,
  spec20: `**Needs you: ALBUM-20 spec approval.**

\`\`\`
ALBUM-20 build ready: Add local preview environments for main and per-ticket branches. Risk: High (touches data files, edits docs/agents/project.md)
Builds:
- npm run preview -- main builds the root checkout on main and runs it on port 4000.
- npm run preview -- 20 finds that ticket's worktree and runs it on port 4000 + N (4020 here).
Reply "approve 20" to start the build, or "changes 20: …" to send it back.
\`\`\``,
  spec19: `**Needs you: ALBUM-19 spec approval.**

Decide this before approving: the event log format is the child's own proposal, not agreed with the replay renderer.

\`\`\`
ALBUM-19 build ready: Add frontend event tracking for replaying browser tests. Risk: Medium (new test tooling and a dev dependency)
Builds:
- Playwright browser tests, and a small recorder script that records clicks, typing, form submits and route changes.
- One JSON event log per test, with timestamps and element details.
Reply "approve 19" to start the build, or "changes 19: …" to send it back.
\`\`\``,
  queued: `Both specs are approved, but both builds are queued. The two build slots are full (ALBUM-7 and ALBUM-10), so ALBUM-20 and ALBUM-19 start when a slot frees.

- **Queue order:** ALBUM-20 first, then ALBUM-19.
- **Next:** ALBUM-7 and ALBUM-10 are building. Nothing else is waiting on you.`,
  aws1: `On it: ticket helper. ALBUM-14 was already out of the team's state because of your hold, so there was no spec to send back.

The helper is rewriting the ticket for AWS with separate staging and production environments in your new account. The old Fly.io spec on its branch is superseded. The ticket stays in Backlog with \`agent-skip\`.`,
  aws2: `ALBUM-14 is rewritten as "Deploy the app to AWS with staging and production behind a password gate". It is still in Backlog with \`agent-skip\`.

- **Environments:** staging and production each get their own SQLite file and their own password.
- **Your account:** creating the AWS account and any credentials are your job, and nothing goes in the repo.

Tell me when you want ALBUM-14 started.`,
  aws3: `On it: ticket helper. It is adding your pay-for-what-you-use constraint to ALBUM-14 as a scope item and an acceptance check.

The spec will have to list each AWS component with how it's billed and its estimated idle cost for staging and production.`,
  aws4: `**ALBUM-14:** the helper edited the ticket. It added a scope item for the pay-per-use cost constraint and one for the scale-to-zero versus SQLite tradeoff, plus two acceptance checks. It is still in Backlog with \`agent-skip\`.`,
  merged7: `ALBUM-7 is merged as PR #21 and out of state.

- **Merge block:** you approved before I'd posted its merge block. The check confirmed \`approve 7\` as yours, and the PR was the one I had staged: both reviews PASS. Its changes were:
  - the Elo engine in \`lib/elo/\`;
  - a \`/matchups\` screen linked from the home page;
  - 60 new tests, with the full suite at 131 passing and lint, typecheck and build clean.
- **Security note:** the security review found that undo has no auth, so a repeated request deletes one more row. The password gate ticket (ALBUM-14) covers that.
- **Now unblocked:** ALBUM-6, ALBUM-8 and ALBUM-9 were waiting only on ALBUM-7.`,
  unblocked: `Yes, four tickets have no open blockers. Three are ready to start and one is held.

**Ready to start (all in Backlog):**
- **ALBUM-6:** per-year ranking screen with drag and drop and covers.
- **ALBUM-8:** artist views by decade and overall.
- **ALBUM-9:** decade top 25 album lists.

**Held:** ALBUM-14 (AWS deploy) has no blockers either, but you put it on hold.

All four active slots are full. If I mark 6, 8 and 9 Todo now, two of them take the free spec slots and the third waits.`,
  all3: `ALBUM-9 is in Todo and waiting for a slot. ALBUM-6 and ALBUM-8 are marked Todo and their specs are being written.

- **Spec stage:** ALBUM-6 (per-year ranking screen) and ALBUM-8 (artist views), on Opus 5.5.
- **Build stage:** ALBUM-10 (spreadsheet import) and ALBUM-20 (local previews).
- **Queued:** ALBUM-19 (event tracking) for a build slot.
- **Waiting:** ALBUM-9 (decade top 25 lists).`,
  spec8: `**Needs you: ALBUM-8 spec approval.**

\`\`\`
ALBUM-8 build ready: Add artist views by decade and overall. Risk: Medium (two new read-only pages)
Builds:
- An /artists page listing artists by score, with links to switch between Overall and each decade from the 1950s to the 2020s.
- An /artists/[id] page with the artist's score and their placed albums.
Reply "approve 8" to start the build, or "changes 8: …" to send it back.
\`\`\`

ALBUM-6's spec is still being written. If you approve 8 now, it queues for a build slot, since two builds are running and ALBUM-19 is already waiting.`,
  reset2: `Resetting my context (size 220k, the cap).`,
  takeover2: `Taking over the Chief of Staff thread: the reset message checks out, so I'm clearing the reset marker, then checking each in-flight ticket and the sweep.`,
  queued68: `Both approvals are queued behind the two running builds.`,
  takeover2done: `Take-over is done. State shows 6 tickets in flight, and both approvals are queued behind the two running builds.

**Moving**
- ALBUM-6 (year ranking screen): the build was approved. It's queued for a build slot.
- ALBUM-8 (artist views): the build was approved. It's queued for a build slot.
- ALBUM-9 (decade top 25 lists): spec running.

**Build queue:** ALBUM-19, then ALBUM-8, then ALBUM-6, behind ALBUM-10 and ALBUM-20, which are building.`,
}

const SONNET = 'Sonnet 5.5', OPUS = 'Opus 5.5'
const REQUEST = "i use the attach spreadsheet to track my favorite yearly albums, and use those rankings to provide favorite lists of artists by decade, and overall, using a weighted score\n\ni've always been disatisfied with the scoring system, and i'd love to be able to search from a catalog of albums and rank them by year using a proper UI, with album covers and all\n\nwrite the first ticket to spec out MVP requirements for this product and issue a wave of follow up tickets to kick off development"
const EPIC = "1. create the epic\n2. it's hard to describe what i don't like about it - the weights feel kind of arbitrary i guess, take a look at it, critique it, and propose a better option - maybe it doesn't even need to be scoring-based, there could be other algorithms to use"

const helper = (id, title, subtitle, doneSubtitle, start, end) => ({ id, title, subtitle, doneSubtitle, model: SONNET, runs: [[start, end]] })
const H1 = helper('h1', 'Ticket: Album ranker MVP spec and wave', 'TICKET HELPER Writing the MVP spec ticket and the follow-up tickets', 'TICKET HELPER DONE Tickets: ALBUM-2 to ALBUM-10 are in the Backlog', '23:07:28', '23:10:31')
const H2 = helper('h2', 'Ticket: Epic and scoring notes', 'TICKET HELPER Creating the epic and adding the scoring notes', 'TICKET HELPER DONE Tickets: ALBUM-11 epic created, scoring notes added to ALBUM-2', '23:12:26', '23:13:31')
const H3 = helper('h3', 'Ticket: Align follow-ups with Elo spec', 'TICKET HELPER Editing ALBUM-3 to 10 to match the approved spec', 'TICKET HELPER DONE Tickets: ALBUM-3 to ALBUM-10 edited to the approved Elo spec', '23:43:41', '23:45:40')
const H4 = helper('h4', 'Ticket: Link 6 behind 7', 'TICKET HELPER Linking ALBUM-6 as blocked by ALBUM-7', 'TICKET HELPER DONE Tickets: ALBUM-6 is blocked by ALBUM-7', '23:55:38', '23:56:03')
const H19 = helper('h19', 'Ticket: Frontend event tracking for replay', 'TICKET HELPER Writing the frontend event tracking ticket', 'TICKET HELPER DONE Tickets: ALBUM-19 is in the Backlog', '05:46:29', '05:46:52')
const H20 = helper('h20', 'Ticket: Local preview environments per ticket', 'TICKET HELPER Writing the local preview environments ticket', 'TICKET HELPER DONE Tickets: ALBUM-20 is in the Backlog', '05:47:33', '05:48:04')
const H14A = helper('h14a', 'Ticket: Edit ALBUM-14 for AWS deploy', 'TICKET HELPER Editing ALBUM-14 to deploy to AWS with staging and production', 'TICKET HELPER DONE Tickets: ALBUM-14 rewritten for AWS', '05:52:49', '05:53:31')
const H14B = helper('h14b', 'Ticket: ALBUM-14 pay-per-use AWS', 'TICKET HELPER Editing ALBUM-14 so the AWS design is pay-per-use', 'TICKET HELPER DONE Tickets: ALBUM-14 is pay-per-use', '05:54:31', '05:55:02')

const spec = (id, title, branch, runs) => ({ id, title, subtitle: `SPEC CHILD Writing the spec on ${branch}`, doneSubtitle: 'SPEC CHILD Waiting for your reply', model: OPUS, runs })
const S2 = spec('s2', 'ALBUM-2 MVP requirements spec', 'feat/album-2-mvp-requirements-spec', [['23:15:16', '23:20:08'], ['23:24:47', '23:26:47'], ['23:43:31', '23:50:41'], ['23:53:40', '23:54:02']])
const S3 = spec('s3', 'ALBUM-3 Choose stack and scaffold', 'feat/album-3-stack-scaffold', [['23:55:38', '23:57:03'], ['05:06:30', '05:13:19'], ['05:16:33', '05:16:50']])
const S4 = spec('s4', 'ALBUM-4 Data model and storage', 'feat/album-4-data-model-storage', [['05:17:46', '05:19:39'], ['05:22:59', '05:38:50'], ['05:39:31', '05:39:52']])
const S5 = spec('s5', 'ALBUM-5 Catalog search with covers', 'feat/album-5-catalog-search', [['05:17:57', '05:20:57'], ['05:23:05', '05:31:24'], ['05:32:55', '05:33:12']])
const S7 = spec('s7', 'ALBUM-7 Elo rating engine and matchup screen', 'feat/album-7-elo-matchup', [['05:42:42', '05:44:14'], ['05:44:44', '05:54:30'], ['05:55:19', '05:55:36']])
const S10 = spec('s10', 'ALBUM-10 Import the existing spreadsheet', 'feat/album-10-spreadsheet-import', [['05:42:46', '05:46:00'], ['05:46:46', '06:05:22']])
const S14 = spec('s14', 'ALBUM-14 Deploy the app with a password gate', 'feat/album-14-deploy-password-gate', [['05:45:00', '05:47:34']])
const S19 = spec('s19', 'ALBUM-19 Frontend event tracking for replay', 'feat/album-19-frontend-event-tracking', [['05:49:24', '05:51:24']])
const S20 = spec('s20', 'ALBUM-20 local preview environments', 'feat/album-20-local-previews', [['05:49:30', '05:50:56'], ['05:55:09', '06:05:22']])
const S6 = spec('s6', 'ALBUM-6 Per-year ranking screen', 'feat/album-6-year-ranking-screen', [['05:56:59', '05:58:46']])
const S8 = spec('s8', 'ALBUM-8 Artist views by decade', 'feat/album-8-artist-views', [['05:57:04', '05:58:24']])
const S9 = spec('s9', 'ALBUM-9 Decade top 25 album lists', 'feat/album-9-decade-top-25', [['06:04:05', '06:05:22']])

export const beats = [
  {
    say: "Okay. So I've got this spreadsheet where I rank my favorite albums every year, and I've wanted to turn it into a real app for ages. {pause} I'm gonna build it with a team of agents. I talk to the chief of staff in this thread, and the dashboard on the right shows me what everybody's doing.",
    run: async () => {
      await clock('23:01:00')
      await intro(true); await until(0.9); await intro(false); await hold(300)
    },
  },
  {
    say: "First thing, I just tell it to set up the repo. {pause} It writes a little config file, opens a pull request, and tells me what it assumed. That's fine. I merge it, and tell it to start the team.",
    run: async () => {
      await clock('23:01:19')
      await type('set up this repo', { at: 'repo' })
      await thinking(true)
      await ff('23:02:35', { ms: 1200 })
      await until('It writes')
      await reply(M.setup, { think: 200, reveal: 3200 })
      await until('I merge')
      await clock('23:03:20')
      await type('start the team', { at: 'start the team' })
      await thinking(true)
    },
  },
  {
    say: "And there's the dashboard. {pause} Nothing on it yet, because there aren't any tickets. So let's give it something to do.",
    run: async () => {
      await ff('23:03:52', { ms: 500 })
      await until('dashboard')
      await openDashTab()
      await ff('23:04:15', { ms: 700 })
      await until('Nothing on it')
      await reply(M.start, { think: 200, reveal: 2400 })
      await ff('23:07:05', { ms: 1000 })
    },
  },
  {
    say: "I attach the spreadsheet, and explain what I actually want. Search a catalog, rank albums by year, real cover art. {pause} And I mention I've never liked how the scoring works. Then I ask for one ticket to spec the MVP, and a batch of follow ups.",
    run: async () => {
      await clock('23:07:11')
      await type(REQUEST, { attach: 'Best Albums.xlsx 299 KB', ms: 9400, at: 'Then I ask' })
      await thinking(true)
      await clock('23:07:36')
      await thinking(false)
      await worked('Worked for 25s')
      await card(H1)
      await reply(M.tickets1, { think: 400, reveal: 900 })
      await waitOn('h1')
      await dashTab('backlog')
      await ff('23:10:35', { until: 0.97 })
    },
  },
  {
    say: "It hands that off to a helper, and a few minutes later I've got nine tickets in the backlog. {pause} Only the first one can start. Everything else is blocked on the spec, which is what I wanted.",
    delay: 0.8,
    run: async () => {
      await clock('23:10:38')
      await reply(M.tickets2, { think: 500, reveal: 2200 })
      await until('Only the first one')
      await scrollDash(500, 1400)
      await until('which is what')
      await scrollDash(0, 900)
    },
  },
  {
    say: "Now, the scoring. I can't really say what bugs me about it, so I just ask it to look. {pause} And it's kind of brutal. Turns out my year weights mostly measure how much I listened that year, not how good the year was. {pause} Yeah. That's the thing I couldn't put my finger on.",
    run: async () => {
      await clock('23:11:58')
      await type(EPIC, { ms: 3600, at: 'to look' })
      await clock('23:12:30')
      await card(H2)
      await reply(M.critique, { think: 700, reveal: 3600 })
      await waitOn('h2')
      await ff('23:13:36', { until: 'Yeah' })
      await reply(M.epic, { think: 300, reveal: 1600 })
    },
  },
  {
    say: "Alright, let's go. I hit Start shipping on ticket two, and a spec writer picks it up. That one runs on the bigger model, Opus. {pause} And I can watch it work in the agents panel. Time, cost, who's doing what.",
    run: async () => {
      await clock('23:14:36')
      await startShipping('ALBUM-2', { at: 'Start shipping' })
      await ff('23:15:12', { ms: 500 })
      await clock('23:15:16')
      await card(S2)
      await reply(M.start2, { think: 300, reveal: 1400 })
      await waitOn('s2')
      await dashTab('ship', { at: 'And I can' })
      await openPanel('ALBUM-2', 'agents', { at: 'agents panel' })
      await ff('23:20:36', { until: 0.97 })
    },
  },
  {
    say: "Okay, spec's ready, and it's flagged high risk because there's a decision in it for me. So I open it on GitHub and actually read it. {pause} Hm. It wants to keep my old scoring, and add a medal table next to it, and let me switch between them. {pause} I don't want two systems. I want one that's right.",
    run: async () => {
      await clock('23:20:40')
      await reply(M.spec1, { think: 300, reveal: 2400 })
      await viewSpec({ ticket: 'ALBUM-2', sha: '5c249ca', stay: true, at: 'I open it' })
      await scrollToHeading('Choice for the MVP')
      await until("I don't want two")
      await backToDash()
    },
  },
  {
    say: "So I hit Changes, and tell it. Drop the multiple algorithms. Just do head to head Elo. Show me two albums, I pick one, and the ratings sort themselves out.",
    run: async () => {
      await clock('23:24:25')
      await changes('ALBUM-2', 'ditch multiple algorithm support\n\ngo with head to head elo algorithm', { at: 'Changes', ms: 3500, sendAt: 'Show me two albums' })
      await clock('23:24:48')
      await reply(M.changes, { think: 300, reveal: 1200 })
      await waitOn('s2')
      await ff('23:27:05', { ms: 2000 })
      await reply(M.spec2, { think: 300, reveal: 1800 })
    },
  },
  {
    run: async () => {
      await ff('23:42:30', { ms: 1800 })
    },
  },
  {
    say: "Second version. Let me check the scoring section again. {pause} One rating per album, and it seeds everything from my existing yearly rankings, so it's useful on day one. {pause} Yep. That's it. Approve.",
    run: async () => {
      await viewSpec({ ticket: 'ALBUM-2', sha: '3091b45', stay: true, at: 'Let me check' })
      await scrollToHeading('Scoring: head-to-head Elo')
      await backToDash({ at: 'Yep' })
      await clock('23:43:21')
      await approve('ALBUM-2', { at: 'Approve' })
      await patchCard('s2', { model: SONNET })
    },
  },
  {
    say: "Now it builds. Well, it's a spec, so the build is just getting the document into a pull request. {pause} But it still gets reviewed. Four rounds of code review before it comes back to me. And meanwhile a helper rewrites the other tickets to match the Elo plan.",
    run: async () => {
      await clock('23:43:46')
      await reply(M.approved, { think: 300, reveal: 1400 })
      await card(H3)
      await waitOn(['s2', 'h3'])
      await openPanel('ALBUM-2', 'agents', { at: 'the build' })
      await ff('23:45:46', { until: 'But it still' })
      await reply(M.helper, { think: 200, reveal: 1400 })
      await ff('23:51:00', { until: 'And meanwhile' })
      await dashTab('backlog', { at: 'rewrites' })
      await until('Elo plan')
      await dashTab('ship')
    },
  },
  {
    say: "Ready to merge. Same deal, I'm not approving off a summary. I open the pull request. {pause} Description makes sense, reviews passed, and the diff is one new file. Good. Approve.",
    delay: 1.0,
    run: async () => {
      await clock('23:51:03')
      await reply(M.mergeready, { think: 200, reveal: 1200 })
      await viewPr({ ticket: 'ALBUM-2', ...prOf(13), stay: true, at: 'I open the' })
      await until('Description')
      await scrollGhBy(0.35, 1700)
      await filesChanged({ at: 'the diff' })
      await backToDash({ at: 'new file' })
      await clock('23:53:28')
      await approve('ALBUM-2', { at: 'Approve' })
    },
  },
  {
    say: "And that's merged. About four and a half dollars for a reviewed spec. {pause} Quick bit of housekeeping, and I start the next ticket, the app scaffold. Then I step away for a while.",
    delay: 2.8,
    run: async () => {
      await clock('23:53:44')
      await reply(M.merging, { think: 200, reveal: 700 })
      await waitOn('s2')
      await ff('23:54:21', { ms: 600 })
      await reply(M.merged, { think: 200, reveal: 900 })
      await dashTab('done', { at: "that's merged" })
      await openPanel('ALBUM-2', 'agents', 'merged', { at: 'four and a half' })
      await ff('23:55:18', { ms: 500 })
      await type('11 is done\n\nlink 6 and 7\n\nmark 3 todo', { ms: 1800, at: 'the next ticket' })
      await clock('23:55:40')
      await card(S3)
      await card(H4)
      await reply(M.house, { think: 300, reveal: 1200 })
      await waitOn(['s3', 'h4'])
      await dashTab('ship')
      await openPanel('ALBUM-3', 'agents')
      await ff('23:57:15', { ms: 800 })
      await reply(M.spec3, { think: 300, reveal: 1400 })
    },
  },
  {
    say: "Okay, I'm back. It's a little after midnight. {pause} The scaffold spec's been sitting there waiting for me. Next.js, TypeScript, tests, lint, nothing fancy. Quick read, and approve.",
    delay: 2.4,
    run: async () => {
      await later('05:06:00')
      await closeOldTabs()
      await viewSpec({ ticket: 'ALBUM-3', sha: '111a741', stay: true, at: "scaffold spec" })
      await scrollToHeading('The stack')
      await backToDash({ at: 'fancy' })
      await clock('05:06:17')
      await approve('ALBUM-3', { at: 'approve' })
      await patchCard('s3', { model: SONNET })
      await closeOldTabs()
    },
  },
  {
    say: "Seven minutes later it's ready to merge. Twenty one files, which is about right for an empty app. {pause} Reviews passed, and it ran the tests in a fresh clone. Merge it.",
    delay: 1.5,
    run: async () => {
      await clock('05:06:34')
      await reply(M.built3, { think: 200, reveal: 500 })
      await waitOn('s3')
      await ff('05:13:30', { ms: 900 })
      await reply(M.mergeready3, { think: 200, reveal: 1000 })
      await viewPr({ ticket: 'ALBUM-3', ...prOf(16), stay: true, at: 'Twenty one' })
      await filesChanged({ at: 'about right' })
      await backToDash({ at: 'fresh' })
      await clock('05:16:23')
      await approve('ALBUM-3', { at: 'Merge it' })
    },
  },
  {
    say: "Now it gets fun, because two tickets just unblocked, and they don't depend on each other. Data model, and catalog search. {pause} So I start both. Two spec writers, side by side.",
    run: async () => {
      await clock('05:16:58')
      await reply(M.merged3, { think: 200, reveal: 1600 })
      await dashTab('backlog', { at: 'unblocked' })
      await ff('05:17:28', { ms: 500 })
      await startShipping('ALBUM-4', { at: 'Data model' })
      await clock('05:17:41')
      await startShipping('ALBUM-5', { at: 'So I start' })
      await clock('05:17:46')
      await card(S4)
      await clock('05:17:57')
      await card(S5)
      await reply(M.started45, { think: 300, reveal: 1400 })
      await waitOn(['s4', 's5'])
      await dashTab('ship')
      await ff('05:19:52', { ms: 1000 })
    },
  },
  {
    say: "Both specs land within three minutes. The data model's straightforward. Six tables, and ratings are never stored, they're computed. {pause} Search is the interesting one. It went with MusicBrainz, because it's the only free catalog that groups all the editions of an album into one. {pause} That's exactly the problem I was worried about. Approve both.",
    run: async () => {
      await closeOldTabs()
      await ff('05:21:12', { ms: 1000 })
      await reply(M.spec4, { think: 200, reveal: 1000 })
      await viewSpec({ ticket: 'ALBUM-4', sha: '07ea805', stay: true, at: 'Six tables' })
      await reply(M.spec5, { think: 100, reveal: 300 })
      await closeOldTabs()
      await scrollToHeading('Schema', 900)
      await backToDash({ at: 'Search is' })
      await viewSpec({ ticket: 'ALBUM-5', sha: '607a5f3', stay: true, at: 'It went with' })
      await scrollToHeading('Choosing the catalog')
      await backToDash({ at: "That's exactly" })
      await clock('05:22:49')
      await approve('ALBUM-4', { at: 'Approve' })
      await clock('05:22:53')
      await approve('ALBUM-5')
      await patchCard('s4', { model: SONNET })
      await patchCard('s5', { model: SONNET })
      await closeOldTabs()
    },
  },
  {
    say: "Two builds running now, and you can see them both on the board. {pause} Search finishes first. Forty one tests, covers load straight from the archive, and there's a placeholder when one's missing. Looks good to me. Merge.",
    delay: 1.4,
    run: async () => {
      await clock('05:23:08')
      await reply(M.both45, { think: 200, reveal: 1000 })
      await waitOn(['s4', 's5'])
      await openPanel('ALBUM-4', 'agents', { at: 'running' })
      await openPanel('ALBUM-5', 'agents', { at: 'see them' })
      await ff('05:31:42', { until: 'Search finishes' })
      await reply(M.mergeready5, { think: 150, reveal: 500 })
      await viewPr({ ticket: 'ALBUM-5', ...prOf(17), stay: true, at: 'Forty one' })
      await filesChanged({ at: 'from the archive' })
      await backToDash({ at: "when one's missing" })
      await clock('05:32:45')
      await approve('ALBUM-5', { at: 'Merge.' })
    },
  },
  {
    say: "Oh, and this is kind of neat. The chief of staff hit its context limit, so it wrote itself some notes, reset, and picked up right where it left off. {pause} Meanwhile the data model pull request had a conflict with the search one I just merged. Its agent sorted that out on its own, and it's ready. Merge.",
    run: async () => {
      await clock('05:32:57')
      await reply(M.merging5, { think: 200, reveal: 800 })
      await closeOldTabs()
      await clock('05:33:09')
      await until('hit its context')
      await sent('CHIEF OF STAFF RESET a7c3e19d. Run /chief-of-staff take over.', { sender: 'Chief of staff reset' })
      await reply(M.reset1, { think: 200, reveal: 1200 })
      await ff('05:36:03', { until: 'picked up' })
      await reply(M.takeover1, { think: 200, reveal: 1400 })
      await ff('05:38:57', { ms: 400 })
      await until('Meanwhile')
      await reply(M.mergeready4, { think: 200, reveal: 1800 })
      await viewPr({ ticket: 'ALBUM-4', ...prOf(18), stay: true, at: 'conflict' })
      await scrollGhBy(0.3, 1500)
      await backToDash({ at: 'on its own' })
      await clock('05:39:16')
      await approve('ALBUM-4', { at: 'Merge.' })
    },
  },
  {
    say: "At this point I get lazy and just say, mark everything that's unblocked. {pause} That's three tickets. The Elo engine, the spreadsheet import, and deployment. Only two specs can run at a time, so the third one waits its turn.",
    delay: 1.2,
    run: async () => {
      await clock('05:39:53')
      await reply(M.merged4, { think: 200, reveal: 1000 })
      await ff('05:41:35', { ms: 600 })
      await type('mark all unblocked tickets todo', { ms: 1800, at: 'unblocked' })
      await clock('05:42:42')
      await card(S7)
      await card(S10)
      await reply(M.todo3, { think: 300, reveal: 1600 })
      await waitOn(['s7', 's10'])
      await ff('05:43:30', { until: 0.9 })
    },
  },
  {
    say: "Elo spec's back. Ratings start at fifteen hundred, and they're replayed from my answers every time, never stored. Undo just deletes the last answer. {pause} Fine by me. Approve.",
    delay: 2.2,
    run: async () => {
      await closeOldTabs()
      await ff('05:44:20', { ms: 900 })
      await reply(M.spec7, { think: 200, reveal: 1000 })
      await viewSpec({ ticket: 'ALBUM-7', sha: 'd99fe7c', stay: true, at: 'Ratings start' })
      await scrollToHeading('Rating engine')
      await backToDash({ at: 'Fine by me' })
      await clock('05:44:32')
      await approve('ALBUM-7', { at: 'Approve' })
      await patchCard('s7', { model: SONNET })
      await clock('05:44:50')
      await reply(M.built7, { think: 200, reveal: 800 })
      await card(S14)
      await ff('05:46:11', { ms: 900 })
      await reply(M.spec10, { think: 200, reveal: 800 })
    },
  },
  {
    say: "While the import spec finishes, I ask for a new ticket. I want the app to log what I do in the browser, so I can replay my testing later. {pause} And the import spec looks right. About fifteen minutes to pull in all seven hundred and fifty two rows. Approve.",
    run: async () => {
      await clock('05:46:20')
      await type('add a ticket to add frontend event tracking so that i can replay my browser testing in the replay renderer (being worked on in another thread)', { ms: 3000, at: 'the app to log' })
      await clock('05:46:29')
      await card(H19)
      await reply(M.helper19, { think: 200, reveal: 600 })
      await waitOn('h19')
      await closeOldTabs()
      await viewSpec({ ticket: 'ALBUM-10', sha: '9c01385', stay: true, at: 'And the import spec' })
      await scrollToHeading('Running it')
      await backToDash({ at: 'seven hundred' })
      await clock('05:46:35')
      await approve('ALBUM-10', { at: 'Approve' })
      await patchCard('s10', { model: SONNET })
      await clock('05:46:48')
      await reply(M.built10, { think: 200, reveal: 800 })
      await clock('05:46:53')
      await reply(M.ticket19, { think: 200, reveal: 800 })
    },
  },
  {
    say: "One more ticket. I want proper local previews. One for main, and one for any ticket I want to poke at. {pause} And then the deploy spec shows up. Fly dot io, a login page, a few dollars a month. {pause} It's reasonable, but I haven't even run this thing locally yet. So, not now. Back to the backlog.",
    run: async () => {
      await clock('05:47:26')
      await type('add a ticket to formalize how to run local testing environments, with a main preview based off the main branch, and the ability to show previews of any ticket on other local ports', { ms: 3000, at: 'any ticket' })
      await clock('05:47:33')
      await card(H20)
      await reply(M.helper20, { think: 200, reveal: 600 })
      await waitOn('h20')
      await closeOldTabs()
      await ff('05:47:49', { ms: 400 })
      await until('deploy spec')
      await reply(M.spec14, { think: 200, reveal: 1000 })
      await viewSpec({ ticket: 'ALBUM-14', sha: 'b0e86b7', stay: true, at: 'Fly dot' })
      await scrollToHeading('Choosing the host', 1200)
      await backToDash({ at: 'a month' })
      await clock('05:48:05')
      await reply(M.ticket20, { think: 100, reveal: 600 })
      await clock('05:48:20')
      await type('hold off on 14 for now, move it back to the backlog, i want to test things locally before deploying', { ms: 2800, at: 'not now' })
      await clock('05:48:38')
      await dashTab('backlog', { at: 'the backlog' })
      await reply(M.hold14, { think: 200, reveal: 1000 })
    },
  },
  {
    say: "Mark the unblocked ones again, and now there are four agents going at once, which is the cap. {pause} The two new specs come back fast. Previews on port four thousand, plus the ticket number. Nice. Approve both. They'll build as soon as there's a free slot.",
    run: async () => {
      await clock('05:48:55')
      await type('mark any unblocked tickets as todo', { ms: 1800, at: 'four agents' })
      await clock('05:49:24')
      await card(S19)
      await clock('05:49:30')
      await card(S20)
      await reply(M.four, { think: 200, reveal: 1400 })
      await waitOn(['s19', 's20'])
      await dashTab('ship')
      await closeOldTabs()
      await ff('05:51:03', { ms: 400 })
      await until('The two new specs')
      await reply(M.spec20, { think: 150, reveal: 800 })
      await viewSpec({ ticket: 'ALBUM-20', sha: '1296400', stay: true, at: 'Previews' })
      await scrollToHeading('Ticket preview')
      await backToDash({ at: 'Nice' })
      await pauseVoice('Approve both')
      await ff('05:51:35', { ms: 400 })
      await reply(M.spec19, { think: 150, reveal: 700 })
      await closeOldTabs()
      await viewSpec({ ticket: 'ALBUM-19', sha: 'ad4400f', stay: true })
      await scrollGhBy(0.3, 900)
      await backToDash()
      await clock('05:51:39')
      resumeVoice()
      await approve('ALBUM-20', { at: 'Approve' })
      await clock('05:51:44')
      await approve('ALBUM-19')
      await clock('05:51:59')
      await reply(M.queued, { think: 200, reveal: 1000 })
    },
  },
  {
    say: "Actually, I've been thinking about that deploy ticket. {pause} I'd rather it go on AWS. Staging and production, in a fresh account. And I don't want to pay for servers that sit there doing nothing, so, pay for what I use. {pause} A helper rewrites the ticket both times, and it stays parked until I'm ready.",
    delay: 1.5,
    run: async () => {
      await dashTab('backlog')
      await clock('05:52:34')
      await type('changes 14: deploy to aws with separate staging and production environments colocated on a new account i\'ll create', { ms: 3000, at: 'on AWS' })
      await clock('05:52:49')
      await card(H14A)
      await reply(M.aws1, { think: 200, reveal: 800 })
      await waitOn('h14a')
      await ff('05:53:32', { ms: 700 })
      await reply(M.aws2, { think: 200, reveal: 800 })
      await clock('05:54:18')
      await type("changes 14: make sure the aws deployment is architected such that as much as possible is pay for what you use, rather than long living services i'm constantly paying for", { ms: 3200, at: 'what I use' })
      await clock('05:54:31')
      await card(H14B)
      await reply(M.aws3, { think: 200, reveal: 800 })
      await waitOn('h14b')
    },
  },
  {
    say: "And the Elo engine's ready to merge already. {pause} Sixty new tests, and there's a matchup screen in the app now. The security review did flag that undo has no login in front of it. That's what the password gate is for, so I'm okay with it. Merge.",
    delay: 1.2,
    run: async () => {
      await dashTab('ship')
      await closeOldTabs()
      await clock('05:54:55')
      await viewPr({ ticket: 'ALBUM-7', ...prOf(21), stay: true, at: 'Sixty new tests' })
      await filesChanged({ at: 'matchup screen' })
      await backToDash({ at: 'is for' })
      await clock('05:55:04')
      await approve('ALBUM-7', { at: 'Merge.' })
      await clock('05:55:12')
      await patchCard('s20', { model: SONNET })
      await ff('05:55:35', { ms: 1000 })
      await reply(M.merged7, { think: 200, reveal: 1400 })
      await reply(M.aws4, { think: 100, reveal: 600 })
    },
  },
  {
    say: "With that in, the last three screens are unblocked. The year ranking page, artist views, decade lists. {pause} Start all three. {pause} Two of the specs come back, I read them, approve, and they queue up behind the builds that are already running.",
    delay: 2.2,
    run: async () => {
      await clock('05:56:16')
      await type('are there any more tickets with no blockers to start shipping?', { ms: 1800, at: 'With that in' })
      await clock('05:56:25')
      await reply(M.unblocked, { think: 200, reveal: 1400 })
      await clock('05:56:38')
      await type('start all 3', { ms: 900, at: 'Start all' })
      await pauseVoice('Two of the specs')
      await clock('05:56:59')
      await card(S6)
      await clock('05:57:04')
      await card(S8)
      await reply(M.all3, { think: 200, reveal: 1000 })
      await waitOn(['s6', 's8'])
      await ff('05:58:34', { ms: 700 })
      await reply(M.spec8, { think: 150, reveal: 800 })
      await clock('05:58:43')
      await sent('CHIEF OF STAFF RESET b4d8f2a6. Run /chief-of-staff take over.', { sender: 'Chief of staff reset' })
      await reply(M.reset2, { think: 150, reveal: 400 })
      await reply(M.takeover2, { think: 150, reveal: 800 })
      await ff('05:59:20', { ms: 600 })
      await closeOldTabs()
      resumeVoice(0)
      await viewSpec({ ticket: 'ALBUM-8', sha: '00f5d42', stay: true, at: 'I read' })
      await pauseVoice('approve,')
      await scrollGhBy(0.3, 900)
      await backToDash()
      await closeOldTabs()
      await viewSpec({ ticket: 'ALBUM-6', sha: 'a58fba1', stay: true })
      await scrollGhBy(0.3, 900)
      await backToDash()
      await clock('06:01:12')
      resumeVoice()
      await approve('ALBUM-8', { at: 'approve,' })
      await clock('06:01:16')
      await approve('ALBUM-6')
      await reply(M.queued68, { think: 200, reveal: 800 })
    },
  },
  {
    say: "So that's where things are. It's about one in the morning. {pause} Five tickets merged, two building, three more queued, and one last spec being written. The whole night's cost about thirty two dollars. {pause} I describe what I want, I read the specs, I read the pull requests, and I say yes or no. Everything in between, the team handles.",
    run: async () => {
      await ff('06:04:18', { ms: 800 })
      await card(S9)
      await reply(M.takeover2done, { think: 150, reveal: 1000 })
      await ff('06:05:21', { ms: 700 })
      await dashTab('done', { at: 'tickets merged' })
      await dashTab('ship', { at: 'two building' })
      await dashTab('done', { at: "whole night's" })
      await openPanel('ALBUM-7', 'agents', 'merged', { at: 'thirty two' })
    },
  },
]
