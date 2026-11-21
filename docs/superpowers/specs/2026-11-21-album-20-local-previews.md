# Local preview environments

**Status:** Shipped
**Date:** 2026-11-21
**Shipped:** in PR #23, as specified
**Ticket:** [ALBUM-20](https://github.com/dbeallor/album-ranker/issues/20)
**Follows:** [stack and scaffold](2026-11-20-album-3-stack-scaffold.md), [data model and storage](2026-11-21-album-4-data-model-storage.md) § Storage

## Goal

One command runs the app from `main`, and one command per ticket runs the app from that ticket's worktree on its own port, side by side. Each preview has its own SQLite file, so a branch's migrations or test data never reach the main preview.

## Commands

One script, `scripts/preview.ts`, run with Node 24 the way `scripts/migrate.ts` is, behind one npm script:

| Command | What it does |
|---|---|
| `npm run preview -- main` | Builds and starts the root checkout (on `main`) on port 4000 |
| `npm run preview -- 20` | Starts the worktree of ticket 20 on port 4020 |
| `npm run preview -- feat/album-20-local-previews` | Same, found by branch name |
| `npm run preview -- list` | Shows each running preview: target, port, URL, pid, commit |
| `npm run preview -- stop 20` | Stops one preview (`stop main`, `stop all` too) |

Any checkout can run any of these: the script finds the root checkout and the worktrees through `git worktree list --porcelain`.

Previews run in the background. Each writes its process id, port and log under `.preview/` in the checkout it serves (gitignored). `start` waits until the page answers, then prints the URL and the log path. If the app doesn't answer within the time limit (3 minutes for main, which builds first; 1 minute for a ticket), it prints the last lines of the log and exits non-zero.

## Main preview

- Runs from the root checkout, which is the first entry in `git worktree list`. Refuses to start if that checkout is not on `main`.
- Runs `next build` then `next start --port 4000`: a production build of what is merged, without the dev overlay.
- Uses the root checkout's own data file, `data/album-ranker.db`, the same one `npm run dev` there uses. That is the user's real data.
- **Refresh after a merge:** run `npm run preview -- main` again. It stops the running main preview, rebuilds and starts again. `merge_pr.py` already fast-forwards the root checkout, so no pull is needed. The script runs `git fetch` and, if the root checkout is behind `origin/main` (for example after a merge in the GitHub web page), warns with the `git -C <root> pull --ff-only` command to run. It does not pull by itself.

## Ticket preview

- `<N>` matches the worktree whose branch contains `album-<N>-` (any head, case-insensitive). A branch name matches exactly. No match, or more than one, is an error that lists the worktrees.
- Runs `next dev --port <port>` in that worktree, so edits from the agent working there show up without a restart.
- Port rule: `4000 + N`, so ticket 20 is 4020. A branch with no ticket number needs `--port <p>`. Ticket numbers 1 to 999 fit in 4001 to 4999; a number of 1000 or more needs `--port`.
- Data file: `data/preview.db` in that worktree, set through `DATABASE_PATH`. It is a different file in a different folder from the main preview's.
  - Default: reuse the file if it exists, otherwise start empty (migrations create it on first open).
  - `--copy-main-data`: replace it with a copy of the root checkout's `data/album-ranker.db`, made with SQLite's backup API so a running main preview doesn't give a torn copy. Fails clearly if the main file doesn't exist.
  - `--empty`: delete it (and its `-wal` and `-shm` files) before starting.

## Setup per checkout

Before starting, in the checkout being previewed:

- Run `npm install` when `node_modules` is missing or `package-lock.json` is newer than `node_modules/.package-lock.json`.
- Copy `.env.example` to `.env` when `.env` is missing. The script passes `DATABASE_PATH` and `PORT` in the environment, which Next.js does not override from `.env`, so a `.env` copied from the example can't point a preview at the wrong file.

## Ports and errors

- Before starting, the script checks the port by binding to it. A taken port fails with `Port 4020 is in use.` and, when the port belongs to a preview the script started, names it and the `stop` command. Otherwise it suggests `lsof -i :4020`.
- Starting a target that is already running stops it first (this is how refresh works).
- A pid file whose process is gone counts as stopped and is cleaned up.
- `stop` kills the preview's whole process group (`next` starts child processes), waits for it to exit, and removes the pid file.
- Plain `npm run dev` keeps port 3000, outside the preview range.

## Docs

- README: a "Preview branches" section after "Run the app" with the commands, port rule, data files and how to stop and refresh.
- `docs/agents/project.md` § Environments and deploy: the main preview port, the ticket port rule and the command, so agents can point the user at a preview URL.
- `.gitignore`: add `.preview/`. `data/` is already ignored.

## Tests

Table-driven unit tests (`AGENTS.md` § Testing sizing) for the parts with rules:

- argument parsing (targets, flags, bad input),
- the port rule (ticket number, `--port`, out of range),
- finding a worktree from `git worktree list --porcelain` output (ticket number, branch name, no match, two matches, root not on `main`).

Starting and stopping real servers is checked by hand and recorded in the PR's Proof: main preview and a ticket preview running at once, a write in the ticket preview not showing in main, stop, and refresh.

## Out of scope

- Deploying anywhere (#14), browser test runs and event capture (#19), shared or hosted preview URLs, CI preview builds.
- Creating worktrees. The script previews worktrees that exist; it does not make one for a ticket that has none.
- Windows. The script uses process groups and `lsof` hints; the user is on macOS.

## Calls I made

Surprising first.

- **The main preview uses the root checkout's real data file**, `data/album-ranker.db`, shared with `npm run dev` there, not a separate preview file. Main is merged code, so it's safe to run against real data, and the preview then shows what the user actually has. Ticket previews never touch that file except to read it for `--copy-main-data`.
- **The main preview is a production build** (`next build` + `next start`) and ticket previews run `next dev`. Main should look like what ships; a ticket preview should pick up edits while an agent works.
- **The script doesn't pull `main`.** It warns when the root checkout is behind `origin/main` and prints the pull command. Pulling would write to the root checkout from a preview command.
- **Previews run in the background** with a pid file and log, and stop through `npm run preview -- stop`, rather than in the foreground with Ctrl-C. Several previews at once in one terminal needs that.
- **Port 4000 for main, 4000 + N for tickets.** Simple to work out in your head; 3000 stays for plain `npm run dev`.
- **A ticket preview keeps its data between runs** unless `--empty` or `--copy-main-data` is passed.
- **One Node TypeScript script** rather than a shell script, to match `scripts/migrate.ts` and to unit test the rules.
- **The ticket match is on `album-<N>-` in the branch name**, the repo's branch pattern, not on the worktree folder name, since T3's folders are random ids.
