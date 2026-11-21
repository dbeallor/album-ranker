# album-ranker
Personal Favorite Album Ranker

## Run the app

1. Install Node 24 or newer (`nvm use` reads `.nvmrc`).
2. `npm install`
3. Optional: `cp .env.example .env` to change `DATABASE_PATH` or `MUSICBRAINZ_USER_AGENT`.
4. `npm run db:migrate` creates the SQLite file and applies migrations. Optional: the app also migrates on first use.
5. `npm run dev`
6. Open <http://localhost:3000>.

## Back up and restore your data

Your rankings live in one SQLite file: `data/album-ranker.db` in the checkout (or `DATABASE_PATH`). While the app runs, recent answers can sit in its `-wal` and `-shm` files next to it, so copying the `.db` alone can miss them. Deleting the checkout or worktree, or running `git clean -fdx`, deletes its `data/` folder.

Backups go to `~/.album-ranker/backups/`, outside every checkout, so they survive removing a worktree or re-cloning. Set `BACKUP_DIR` to move them. Each database file gets its own subfolder (its name plus a short hash of its path, with a `source.txt` saying which file), so another worktree's test data never pushes your real backups out. Files are named like `20261121T143005Z-manual.db`, and the newest 10 per database are kept. Backups are your personal data: they stay on this machine, are readable only by you, and never go in git.

| Command | What it does |
|---|---|
| `npm run db:backup` | Backs up the database now. Safe while the app runs |
| `npm run db:backup -- list` | Lists the backups, newest first, with size and album, year entry and matchup counts |
| `npm run db:restore -- latest` | Restores the newest backup |
| `npm run db:restore -- <file>` | Restores a backup, given as a path or as a file name in this database's backup folder |

- **Restore:** stop the app first (`npm run dev`, and any preview using that file). If a database already exists, it shows what would be replaced and asks you to type `yes`. `--yes` skips the question; with no terminal and no `--yes` it refuses and changes nothing.
- **Undo a restore:** the replaced data is saved as a `pre-restore` backup, and restore prints its path. Run `npm run db:restore -- <that file>` to go back.
- **Migrations:** when `npm run db:migrate` or the app finds a pending migration in an existing database, it takes a `pre-migrate` backup first. If that backup fails, no migration runs.

## Preview branches

Run `main` and any ticket's worktree side by side, each on its own port and its own SQLite file.

| Command | What it does |
|---|---|
| `npm run preview -- main` | Builds the root checkout (on `main`) and serves it on <http://localhost:4000> |
| `npm run preview -- 20` | Runs the worktree whose branch contains `album-20-` on <http://localhost:4020> |
| `npm run preview -- feat/album-20-local-previews` | Same, found by branch name |
| `npm run preview -- list` | Shows each running preview: target, port, URL, pid, commit |
| `npm run preview -- stop 20` | Stops one preview (`stop main` and `stop all` work too) |

Any checkout can run these. A ticket preview needs a worktree for its branch, for example `git worktree add ../album-ranker-20 -b feat/album-20-short-title origin/main`. Previews are bound to 127.0.0.1 only, so other machines on the network can't reach them. Previews run in the background; the pid file and log are in `.preview/` in the checkout being served (gitignored).

- **Ports:** main is 4000, a ticket is `4000 + N` (1 to 999). A branch without a ticket number, or a number of 1000 or more, needs `--port <p>` (1024 to 65535). Plain `npm run dev` stays on 3000. A taken port fails with the preview that holds it, or an `lsof` hint.
- **Data:** main uses the root checkout's `data/album-ranker.db`, the same file `npm run dev` there uses. A ticket preview uses `data/preview.db` in its own worktree, so migrations and test data never reach main. It keeps that file between runs. `--empty` deletes it first; `--copy-main-data` replaces it with a copy of main's file.
- **Setup:** the script runs `npm install` in the checkout when `node_modules` is missing or `package-lock.json` is newer, and copies `.env.example` to `.env` when `.env` is missing.
- **Refresh after a merge:** run `npm run preview -- main` again. It stops the running main preview, rebuilds and starts it. If the root checkout is behind `origin/main`, it warns and prints the `git pull --ff-only` command; it never pulls.
- **Stop:** `npm run preview -- stop <main|N|branch|all>`.

## Search albums

Open <http://localhost:3000/search> and type an album or artist. Results come from MusicBrainz, one per album, with cover art from the Cover Art Archive.

MusicBrainz asks API users to put contact details in the User-Agent. Set `MUSICBRAINZ_USER_AGENT` (for example `album-ranker/0.1 (you@example.com)`) in `.env`; the default is `album-ranker/0.1`. MusicBrainz allows about one request per second, so a busy message means to wait a moment and try again.

## Matchups

Open <http://localhost:3000/matchups> to answer "which of these two do you like more?" for two albums from different years. Pick one, call it a tie, skip the pair, or undo the last answer (undo works repeatedly and serves the undone pair again).

Ratings are never stored. Every request replays the year placements (ranked over lower ranked and over honorable mentions, year by year) and then your matchup answers, oldest first, as Elo with K = 32 from 1500. Only ranked and honorable mention albums are rated and served. Details are in [the ALBUM-7 spec](docs/superpowers/specs/2026-11-21-album-7-elo-matchup.md).

## Browser tests

Playwright drives Chromium against a production build of the app on port 3100, with its own SQLite file under `test-results/` and a local stand-in for MusicBrainz (`MUSICBRAINZ_URL`), so no test calls the live service.

1. One time: `npx playwright install chromium`
2. `npm run test:e2e`

Each test also records what it does in the page (clicks, typing, form submits, route changes) and writes it as `events.json` in that test's folder under `test-results/e2e/`, for the replay renderer. The format is in [docs/event-log-format.md](docs/event-log-format.md). The recorder is injected by the test; the app's own code never contains it.

Checks:

- `npm test`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run test:e2e` (needs the one-time Chromium install above)

The stack and the reasons for it are in [docs/stack.md](docs/stack.md).
