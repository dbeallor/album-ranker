// The first session of the ALBUM Chief of Staff thread (2026-11-20): narration and what happens on the stage, beat by beat.
// Times are the real ones (UTC); the dashboard is drawn as it was at the clock's time.
import { clock, ff, type, press, pressChanges, reply, worked, card, patchCard, waitOn, thinking, intro, openDashTab, dashTab, openPanel, scrollDash, viewSpec, viewPr, scrollToHeading, scrollGhBy, filesChanged, backToDash } from '../lib/director.mjs'
import { hold, until } from '../lib/recorder.mjs'

export const meta = {
  date: '2026-11-20',
  timeline: 'timeline/2026-11-20.json',
  fixtures: 'fixtures/2026-11-20',
  dashUrl: 'http://127.0.0.1:47332/',
  tree: ['.gitignore', 'README.md', 'docs/agents/project.md'],
  setup: { project: 'Album Ranker', projectAvatar: 'AR', thread: 'ALBUM - Chief of Staff', branch: 'main', model: 'Sonnet 5.5', effort: 'Medium' },
}

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

Nothing starts building until you move tickets to Todo. Specs and merges then wait for your \`approve N\`.`,
  critique: `On it: ticket helper. It will create "Epic: Album ranker MVP" and put ALBUM-2 to 10 under it.

## Critique of the current scoring

I read all your rows, covering 1955–2024.

1. **The weight measures how much you logged, not how good the year was.** 2019 and 2021 have 41 albums and weigh 1.0. Years with one album weigh 0.395.
2. **The 0.25 exponent is a hand-tuned knob.** A different exponent would reorder your lists.
3. **Some #1s count for far less than others.** A #1 in a one-album year scores 3.95, a #1 in a big year scores 10.
4. **Nothing can calibrate one year against another.** Your ranks only compare albums within the same year.

Alternatives: head-to-head matchups with Elo, a medal table, or tier ratings.`,
  epic: `**Tickets**

- **Epic:** ALBUM-11 "Epic: Album ranker MVP" is created. ALBUM-2 to ALBUM-10 are now sub-issues of it.
- **ALBUM-2:** it now has a "Scoring: open question" section with the critique and the alternatives.

When you're ready for the team to start, move ALBUM-2 to Todo. It's the only unblocked ticket.`,
  start2: `ALBUM-2 is now In Progress, with a spec child writing the MVP requirements.

- **ALBUM-2:** moved from Todo to In Progress. A spec child on Opus 5.5 is working on the branch \`feat/album-2-mvp-requirements-spec\`.
- **Approval:** when the spec is ready I'll ask for your \`approve 2\` or \`changes 2: …\`.
- **Other tickets:** ALBUM-3 to ALBUM-10 stay blocked until ALBUM-2 is done.`,
  spec1: `ALBUM-2's spec is written and waiting for your approval.

**ALBUM-2 build ready: Album ranker MVP requirements. Risk: High (touches data, and one call needs your decision)**

**Builds**
- A one-person web app with a small server and a SQLite file, run on localhost.
- Catalog search with album covers.
- A year page with ten ranked slots, an honorable mention area and a "listed" area.
- Two scoring options you can switch between: today's rule, and a new medal table with no weights.

**Calls the child made**
- ⚠ **Medal table:** it proposes this as the new scoring instead of the weighted points.`,
  changes: `I sent your changes to the ALBUM-2 spec child, and it is revising the spec now.

- **What I relayed:** your words as written: "changes 2: ditch multiple algorithm support. go with head to head elo algorithm".
- **What to expect:** head-to-head matchups with Elo as the only ranking method. That also affects ALBUM-7, ALBUM-6 and ALBUM-10.`,
  spec2: `**ALBUM-2 build ready (revised): Album ranker MVP requirements. Risk: High (touches data, new ratings model)**

**Builds**
- A matchup screen with two covers where you pick one, call a tie, skip or undo. Every answer updates one Elo rating per album across all years.
- A year page with ten ranked slots, each showing its rating.
- Artist lists overall and by decade, plus hand-ranked decade top 25 lists.

**Leaves out**
- More than one scoring method, a scoring settings screen, and the spreadsheet's year weight.

**Calls the child made**
- ⚠ **Seeding:** your yearly ranks are replayed as wins before any matchups, so the app has a usable order from day one.`,
  approved: `ALBUM-2 is approved and moved to the build stage. I'm waiting for the spec PR.

- **Relayed:** your "approve 2" went to the spec child, which will open the PR and run its reviews.
- **Ticket helper:** applying the spec's edits to ALBUM-3 to 10. It rewrites ALBUM-7 as the Elo engine plus matchup screen, and adds a deployment ticket if the spec calls for one.`,
  helper: `The helper finished the follow-up edits:

- **ALBUM-3 to 10:** all edited to match the approved Elo spec.
- **ALBUM-7:** retitled "Build the Elo rating engine and matchup screen".
- **ALBUM-14:** new, "Deploy the app with a password gate". Blocked by ALBUM-2.

**Needs you**
- Say "link 6 behind 7" if ALBUM-6 should wait for the engine.
- ALBUM-11 still needs the \`agent-skip\` label.`,
  mergeready: `**ALBUM-2 merge ready: docs: ALBUM-2 MVP requirements spec. Risk: Low (docs only, 1 file)**
PR: https://github.com/dbeallor/album-ranker/pull/13, head 42e9abb
Reviews: code review PASS (pass 4), security review PASS
CI: the repo has no CI, so there are no checks.
Cost: $3.97 API-equivalent, 6.1M tokens

**Changes**
- Adds the MVP spec: one-person web app, SQLite, catalog search with covers, head-to-head Elo, artist and decade views, and a spreadsheet import with a review step.

Reply "approve 2" to approve and merge, or "changes 2: …" to send it back.`,
  merging: `Your merge approval for PR #13 is sent to the ALBUM-2 child, and it is merging now.

- **Checks:** the PR head still matches the reviewed one (42e9abb).
- **After the merge:** I'll pull \`main\` in this checkout so ALBUM-3 becomes startable.`,
  merged: `ALBUM-2 is merged, and the Backlog is waiting for you to say what starts next.

- **ALBUM-2:** PR #13 is merged at \`815973c\` and the ticket is closed.
- **Unblocked:** ALBUM-3 (stack and scaffold) can start.
- **To start the next ticket:** say "mark 3 todo", or say \`backlog\` to let the project manager pick.`,
  house: `I've started ALBUM-3 and sent the 6-and-7 link to a ticket helper.

- **ALBUM-11:** it now has the \`agent-skip\` label, so the team won't try to build the epic.
- **ALBUM-3:** moved to In Progress. A spec child on Opus 5.5 is working on \`feat/album-3-stack-scaffold\`.
- **Link 6 and 7:** ALBUM-6 is now blocked by ALBUM-7.`,
  spec3: `**ALBUM-3 build ready: Choose the tech stack and scaffold the app. Risk: Medium (app scaffold, edits \`docs/agents/project.md\`)**

**Builds**
- A TypeScript Next.js app on Node 24 or newer, using npm. The one page shows only the heading "Album ranker".
- Commands: \`npm run dev\`, \`npm test\`, \`npm run lint\`, \`npm run typecheck\`, \`npm run build\`.
- Real Test, Lint and Typecheck values in \`docs/agents/project.md\`.

**Leaves out**
- Any album, ranking or rating feature, and the SQLite driver (left to ALBUM-4).`,
}

const SONNET = 'Sonnet 5.5', OPUS = 'Opus 5.5'
const REQUEST = "i use the attach spreadsheet to track my favorite yearly albums, and use those rankings to provide favorite lists of artists by decade, and overall, using a weighted score\n\ni've always been disatisfied with the scoring system, and i'd love to be able to search from a catalog of albums and rank them by year using a proper UI, with album covers and all\n\nwrite the first ticket to spec out MVP requirements for this product and issue a wave of follow up tickets to kick off development"
const EPIC = "1. create the epic\n2. it's hard to describe what i don't like about it - the weights feel kind of arbitrary i guess, take a look at it, critique it, and propose a better option - maybe it doesn't even need to be scoring-based, there could be other algorithms to use"

const helper = (id, title, subtitle, doneSubtitle, start, end) => ({ id, title, subtitle, doneSubtitle, model: SONNET, runs: [[start, end]] })
const H1 = helper('h1', 'Ticket: Album ranker MVP spec and wave', 'TICKET HELPER Writing the MVP spec ticket and the follow-up tickets', 'TICKET HELPER DONE Tickets: ALBUM-2 to ALBUM-10 are in the Backlog', '23:07:28', '23:10:31')
const H2 = helper('h2', 'Ticket: Epic and scoring notes', 'TICKET HELPER Creating the epic and adding the scoring notes', 'TICKET HELPER DONE Tickets: ALBUM-11 epic created, scoring notes added to ALBUM-2', '23:12:26', '23:13:31')
const H3 = helper('h3', 'Ticket: Align follow-ups with Elo spec', 'TICKET HELPER Editing ALBUM-3 to 10 to match the approved spec', 'TICKET HELPER DONE Tickets: ALBUM-3 to ALBUM-10 edited to the approved Elo spec', '23:43:41', '23:45:40')
const H4 = helper('h4', 'Ticket: Link 6 behind 7', 'TICKET HELPER Linking ALBUM-6 as blocked by ALBUM-7', 'TICKET HELPER DONE Tickets: ALBUM-6 is blocked by ALBUM-7', '23:55:38', '23:56:03')
const SPEC2 = { id: 's2', title: 'ALBUM-2 MVP requirements spec', subtitle: 'SPEC CHILD Writing the MVP requirements on feat/album-2-mvp-requirements-spec', doneSubtitle: 'SPEC CHILD Waiting for your reply', model: OPUS, runs: [['23:15:16', '23:20:08'], ['23:24:47', '23:26:47'], ['23:43:31', '23:50:41'], ['23:53:40', '23:54:02']] }
const SPEC3 = { id: 's3', title: 'ALBUM-3 Choose stack and scaffold', subtitle: 'SPEC CHILD Writing the stack and scaffold spec on feat/album-3-stack-scaffold', doneSubtitle: 'SPEC CHILD Waiting for your reply', model: OPUS, runs: [['23:55:38', '23:57:03']] }

export const beats = [
  {
    say: "Okay, so this is a replay of my first session with an agent team, on a new project, an album ranker. {pause} It's rebuilt from the chat history and the team's own records, so the dashboard shows what it actually looked like at each moment. When the clock jumps ahead, you'll see a fast forward badge up top.",
    run: async () => {
      await clock('23:01:00')
      await intro(true); await until(0.85); await intro(false); await hold(300)
    },
  },
  {
    say: "Alright, I start with one line. Set up this repo. {pause} The chief of staff writes a small config file, opens a pull request for it, and tells me what's left. I merge that one myself, then tell it to start the team.",
    run: async () => {
      await clock('23:01:19')
      await type('set up this repo')
      await clock('23:02:40')
      await reply(M.setup, { reveal: 3600 })
    },
  },
  {
    say: "So, start the team. {pause} It makes the labels it uses to track tickets, and opens its dashboard over here on the right. Nothing to do yet though, the repo has no tickets.",
    run: async () => {
      await clock('23:03:20')
      await type('start the team')
      await thinking(true)
      await ff('23:03:52', { ms: 1500 })
      await openDashTab()
      await ff('23:07:00', { ms: 2500 })
      await reply(M.start, { think: 200, reveal: 3200 })
    },
  },
  {
    say: "Okay, now the real work. I attach my spreadsheet of favorite albums by year, and explain how I use it. I've never liked the scoring, so I say that too. {pause} Then I ask for one ticket that specs out the MVP, plus a wave of follow-up tickets. A ticket helper picks it up, and on the Backlog tab I can watch it write them, minute by minute.",
    run: async () => {
      await clock('23:07:11')
      await type(REQUEST, { attach: 'Best Albums.xlsx 299 KB', ms: 5200 })
      await thinking(true)
      await clock('23:07:36')
      await thinking(false)
      await worked('Worked for 25s')
      await card(H1)
      await reply(M.tickets1, { think: 600, reveal: 1000 })
      await waitOn('h1')
      await dashTab('backlog')
      await ff('23:10:38', { until: 0.97 })
    },
  },
  {
    say: "Nine tickets, all in the Backlog. {pause} It lists which ones block which, and the dashboard shows the same nine. Only the spec ticket has no blockers. Everything else waits on it.",
    run: async () => {
      await reply(M.tickets2, { think: 800, reveal: 3200 })
      await until(0.5)
      await scrollDash(500, 1500)
      await until(0.8)
      await scrollDash(0, 900)
    },
  },
  {
    say: "Hm, I can't quite say what I don't like about the scoring. So I ask for an epic, a critique, and a better idea, maybe not score based at all. {pause} It reads all my rows, and basically says the year weight measures how much I logged, not how good the year was. Fair. A second helper creates the epic, and it shows up in the Backlog.",
    run: async () => {
      await ff('23:11:58', { ms: 1500 })
      await type(EPIC, { ms: 3600 })
      await clock('23:12:30')
      await card(H2)
      await reply(M.critique, { think: 900, reveal: 4200 })
      await waitOn('h2')
      await ff('23:13:38', { until: 0.88 })
      await reply(M.epic, { think: 400, reveal: 1800 })
    },
  },
  {
    say: "Right, time to start. On the Backlog I click Start shipping on ticket two. {pause} A spec child picks it up, running on the bigger Opus model. Then on the Ship loop tab I open its agents panel, and the chart fills in as it works.",
    run: async () => {
      await ff('23:14:34', { ms: 1500 })
      await press('todo', 'ALBUM-2')
      await clock('23:15:20')
      await card(SPEC2)
      await reply(M.start2, { think: 600, reveal: 2200 })
      await waitOn('s2')
      await dashTab('ship')
      await openPanel('agents', 'ALBUM-2')
      await ff('23:20:40', { until: 0.97 })
    },
  },
  {
    say: "Spec's ready. Ticket two moves to Awaiting build approval, flagged high risk. {pause} I click View spec to read it on GitHub. And in the scoring section, the child wants a brand new medal table next to my old scoring. Nope, that's not what I want.",
    run: async () => {
      await clock('23:20:45')
      await reply(M.spec1, { think: 600, reveal: 2600 })
      await until(0.25)
      await viewSpec('ALBUM-2', '5c249ca')
      await scrollToHeading('Choice for the MVP')
      await until(0.7)
      await clock('23:23:10')
      await backToDash()
      await openPanel('details', 'ALBUM-2')
      await until(0.97)
    },
  },
  {
    say: "So I click Changes, and the thread opens with my reply already started. I add two things. No multiple algorithms, and go with head to head Elo, where I just pick which of two albums I like more. {pause} The ticket goes back to being written, and the chart gets a new changes row.",
    run: async () => {
      await clock('23:24:20')
      await pressChanges('ALBUM-2', 'ditch multiple algorithm support\n\ngo with head to head elo algorithm')
      await clock('23:24:48')
      await reply(M.changes, { think: 700, reveal: 2200 })
      await waitOn('s2')
      await openPanel('agents', 'ALBUM-2')
      await ff('23:27:05', { until: 0.97 })
    },
  },
  {
    say: "Okay, the revised spec's back. Before I approve, I click View spec again and read the actual document. {pause} {tag:thoughtful} The scoring section is head to head Elo now. One rating per album, seeded from my yearly rankings, so the app's useful from day one. {pause} That's what I asked for. So I click Approve, and the card switches to the smaller model for the build.",
    run: async () => {
      await clock('23:27:10')
      await reply(M.spec2, { think: 600, reveal: 2200 })
      await ff('23:42:30', { ms: 2800 })
      await viewSpec('ALBUM-2', '3091b45')
      await scrollToHeading('Scoring: head-to-head Elo')
      await until(0.7)
      await clock('23:43:10')
      await backToDash()
      await clock('23:43:18')
      await press('approve', 'ALBUM-2')
      await patchCard('s2', { model: SONNET })
    },
  },
  {
    say: "Now the chief passes my approval to the child, and it opens a pull request and starts the code reviews. {pause} Meanwhile a helper rewrites the follow-up tickets to match the Elo approach, and adds a new one to deploy the app behind a password. On the chart, the review agents show up one by one.",
    run: async () => {
      await clock('23:43:36')
      await reply(M.approved, { think: 700, reveal: 2200 })
      await clock('23:43:46')
      await card(H3)
      await waitOn('h3')
      await openPanel('agents', 'ALBUM-2')
      await ff('23:45:46', { until: 0.45 })
      await reply(M.helper, { think: 500, reveal: 2400 })
      await waitOn('s2')
      await dashTab('backlog')
      await until(0.6)
      await dashTab('ship')
      await ff('23:51:00', { until: 0.97 })
    },
  },
  {
    say: "Okay, ready to merge. I still don't just trust the summary, so I click View PR. {pause} There's the description, and the review comments are right there. Files changed is one new spec file, docs only. Four code review passes and a security check, all clean. Looks right, so I click Approve.",
    run: async () => {
      await clock('23:51:05')
      await reply(M.mergeready, { think: 500, reveal: 2800 })
      await viewPr('ALBUM-2')
      await until(0.2)
      await scrollGhBy(0.3, 1400)
      await clock('23:52:10')
      await until(0.4)
      await scrollGhBy(0.7, 1400)
      await until(0.55)
      await filesChanged()
      await clock('23:52:50')
      await scrollGhBy(0.4, 1600)
      await until(0.82)
      await backToDash()
      await clock('23:53:24')
      await press('approve', 'ALBUM-2')
    },
  },
  {
    say: "And it merges. The ticket closes, and the spec now lives in the repo. {pause} The Done tab shows the finished work and what it cost, and the chart shows every agent that touched it, from the first helper to the merge.",
    run: async () => {
      await clock('23:53:41')
      await reply(M.merging, { think: 500, reveal: 1600 })
      await waitOn('s2')
      await ff('23:54:21', { ms: 2600 })
      await reply(M.merged, { think: 300, reveal: 2200 })
      await dashTab('done')
      await openPanel('agents', 'ALBUM-2', 'merged')
      await until(0.97)
    },
  },
  {
    say: "Then a few housekeeping things, all in one message, since there's no button for them. Mark the epic done so nobody tries to build it. Make the ranking screen wait on the Elo engine. {pause} And start the next ticket, the app scaffold. A new spec child starts on Opus, next to another small helper.",
    run: async () => {
      await ff('23:55:18', { ms: 1400 })
      await type('11 is done\n\nlink 6 and 7\n\nmark 3 todo', { ms: 1800 })
      await clock('23:55:40')
      await card(SPEC3)
      await card(H4)
      await reply(M.house, { think: 500, reveal: 2400 })
      await waitOn('s3')
      await dashTab('ship')
      await openPanel('agents', 'ALBUM-3')
      await ff('23:57:15', { until: 0.97 })
    },
  },
  {
    say: "And the scaffold spec comes back for my approval. A Next.js app, real test, lint and typecheck commands, no album features yet. {pause} So that's the loop. I say what I want, the team writes the spec, I read it and approve. It builds and reviews, and I approve the merge.",
    run: async () => {
      await clock('23:57:21')
      await reply(M.spec3, { think: 500, reveal: 3000 })
      await openPanel('details', 'ALBUM-3')
      await until(0.97)
    },
  },
]
