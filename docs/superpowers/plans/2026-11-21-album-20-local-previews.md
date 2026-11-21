# ALBUM-20 local previews: plan

**Spec:** [2026-11-21-album-20-local-previews.md](../specs/2026-11-21-album-20-local-previews.md)

Run `npm install` first. Scripts run as Node type-stripped TypeScript like `scripts/migrate.ts` (relative imports end in `.ts`; no enums or parameter properties). Tests are picked up by `**/*.test.ts` in vitest.

## Task 1: pure rules (`scripts/preview/rules.ts` + `rules.test.ts`)
- `parseArgs(argv)`: `main` | `<N>` | `<branch>` start targets; `list`; `stop <target|all>`; flags `--port <p>`, `--empty`, `--copy-main-data`. Returns a typed command or a clear error string. `--empty` with `--copy-main-data` is an error. Flags apply to ticket starts only (error on main).
- `ticketPort(n, override?)`: `4000 + n` for 1..999, else error asking for `--port`; override must be 1024..65535. `MAIN_PORT = 4000`.
- `parseWorktrees(porcelainText)`: `{path, branch|null, head}[]`; first entry is the root checkout.
- `findWorktree(worktrees, target)`: ticket number matches branch containing `album-<N>-` (case-insensitive, `N` exact so 2 does not match 20); branch name exact; zero or many matches return an error listing the worktrees.
- `checkRootOnMain(worktrees)`.
- One table-driven test per function.

## Task 2: runtime (`scripts/preview/index.ts`, `scripts/preview.ts` entry)
- Thin I/O layer over Task 1: `git worktree list --porcelain`, setup (`npm install` when `node_modules` missing or `package-lock.json` newer than `node_modules/.package-lock.json`; copy `.env.example` to `.env` when missing), port check by binding with `node:net`, spawn detached with `DATABASE_PATH` and `PORT` in env, log to `.preview/<name>.log`, pid file `.preview/<name>.json` (`pid`, `port`, `target`, `branch`, `startedAt`) in the served checkout, wait for HTTP 200 on the port (timeouts 3 min main, 1 min ticket; on failure print the last 20 log lines, kill the process, exit 1).
- main: stop running main preview, warn if root behind `origin/main` after `git fetch` (print `git -C <root> pull --ff-only`, never pull), `next build` then `next start --port 4000`; `DATABASE_PATH` is not set (default root data file).
- ticket: `next dev --port <port>` with `DATABASE_PATH=<worktree>/data/preview.db`; `--empty` deletes db, `-wal`, `-shm`; `--copy-main-data` uses `DatabaseSync` backup (`node:sqlite` `backup`) from root `data/album-ranker.db`, error if missing.
- Port in use: `Port <p> is in use.` plus the owning preview and its stop command when a pid file matches, else `lsof -i :<p>` hint.
- `list`: reads pid files from all worktrees, drops stale ones; prints target, port, URL, pid, commit.
- `stop <target|all>`: `process.kill(-pid, 'SIGTERM')`, wait up to 10 s then SIGKILL, remove pid file.
- `package.json`: `"preview": "node scripts/preview.ts"`.

## Task 3: docs and ignore
- `.gitignore`: `.preview/`.
- README "Preview branches" section after "Run the app" (commands, port rule, data files, refresh after merge, stop).
- `docs/agents/project.md` § Environments and deploy: replace `none yet` with main port 4000, ticket port `4000 + N`, the command, data file locations.
- Spec status to `Shipped` and `**Shipped:**` line are closeout docs, done by open-pr.

## Verify
`npm test`, `npm run lint`, `npm run typecheck`, `npm run build`. Then by hand, recording in the PR Proof: start `main` and this ticket (`npm run preview -- 20`) at once, curl both, write in the ticket preview and confirm main's data is unchanged (compare `data/` files), `list`, taken-port failure, `stop 20`, `stop main`, main refresh. Never commit `.env`, `.preview/`, `data/` or SQLite files.
