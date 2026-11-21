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

- **Restore:** stop the app first (`npm run dev`, and any preview using that file). If a database already exists, it shows what would be replaced and asks you to type `yes`. `--yes` skips the question; with no terminal and no `--yes` it refuses and changes nothing. If the file is still open in another process (the app is running), the restore stops without replacing it. A damaged file that can't be opened is replaced after you confirm, and its raw files are kept in the backup folder as `*-pre-restore-unreadable.db.bak`.
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

## Record a session

`npm run record -- <target>` opens a Chromium window on a local app and records what you click, type and submit there, for the replay renderer. One time: `npx playwright install chromium`.

| Command | Records |
|---|---|
| `npm run record -- main` | The running main preview (<http://localhost:4000>) |
| `npm run record -- 30` | The running preview of ticket 30; a branch name works too |
| `npm run record -- 3000` | `http://localhost:3000`, for example `npm run dev` |
| `npm run record -- http://localhost:3000/search` | A URL on `localhost`, `127.0.0.1` or `[::1]`; any other host is refused |

If the preview isn't running, the command prints the `npm run preview -- <target>` line that starts it. Click through the app in the window. Close the window or press Ctrl-C to stop; the command prints where it saved the log.

- **Where:** `recordings/<YYYYMMDD-HHMMSS>-<port>/events.json` in the checkout you ran it from (gitignored), or `<dir>/events.json` with `--out <dir>`. While you work the file is rewritten at most once a second, so a crash loses at most the last second.
- **Viewport:** 1280x720 unless `--viewport <W>x<H>` says otherwise, so click positions match the `viewport` in the log.
- **Which app:** each log's `source` says where it came from: host and port, and, where the code can tell, the kind of run, preview name, branch, worktree and commit. The fields are in [docs/event-log-format.md](docs/event-log-format.md).
- **Nothing runs in the app:** the recorder is injected by this command's browser. The app has no recorder code and no endpoint, and a build contains none.

## Search albums

Open <http://localhost:3000/search> and type an album or artist. Results come from MusicBrainz, one per album, with cover art from the Cover Art Archive.

MusicBrainz asks API users to put contact details in the User-Agent. Set `MUSICBRAINZ_USER_AGENT` (for example `album-ranker/0.1 (you@example.com)`) in `.env`; the default is `album-ranker/0.1`. MusicBrainz allows about one request per second, so a busy message means to wait a moment and try again.

## Year pages

Open <http://localhost:3000/years> for the years that have albums, or type any year (1900 to 2100) into "Go to year". Each year page (`/years/1987`) has a top 10 with ten numbered slots, honorable mentions, and a list of albums heard that year but not placed. Drag a cover to reorder or move it between areas (mouse, touch with a press and hold, or keyboard: Space to pick up, arrow keys, Space to drop), or use the buttons on each card: Move up, Move down, Move to, Remove. Every change saves at once. Ranked albums and honorable mentions show their current Elo rating.

Add albums from catalog search or by hand ("Can't find it? Add it by hand"). An album that is already on another year asks before moving. Remove only takes the album off the year; the album and its matchups stay. Details are in [the ALBUM-6 spec](docs/superpowers/specs/2026-11-21-album-6-year-ranking-screen.md).

## Matchups

Open <http://localhost:3000/matchups> to answer "which of these two do you like more?" for two albums from different years. Pick one, call it a tie, skip the pair, or undo the last answer (undo works repeatedly and serves the undone pair again).

Ratings are never stored. Every request replays the year placements (ranked over lower ranked and over honorable mentions, year by year) and then your matchup answers, oldest first, as Elo with K = 32 from 1500. Only ranked and honorable mention albums are rated and served. Details are in [the ALBUM-7 spec](docs/superpowers/specs/2026-11-21-album-7-elo-matchup.md).

## Artists

Open <http://localhost:3000/artists> to see artists ranked by score, overall or one decade at a time (1950s to 2020s). Open an artist to see their placed albums with year, placement and rating. Scores come from the replayed ratings on every request. Details are in [the ALBUM-8 spec](docs/superpowers/specs/2026-11-21-album-8-artist-views.md).

## Decade lists

Open <http://localhost:3000/decades> to pick a decade, then <http://localhost:3000/decades/1990> (for example) for its top 25. A decade with no list shows a suggestion built from your ratings; press Accept suggestion to save it, then reorder by drag and drop (or Move up and Move down), remove albums, or add ranked and honorable mention albums from the panel under the list. Every change saves at once, and the server refuses a 26th album. Details are in [the ALBUM-9 spec](docs/superpowers/specs/2026-11-21-album-9-decade-top-25.md).

## Import the spreadsheet

`npm run import -- "/path/to/Best Albums.xlsx"` loads the Albums sheet into the database at `DATABASE_PATH`. It matches each row to a MusicBrainz album, then writes year entries and the decade lists. Rows it can't match with confidence go to the review page.

- It takes about 15 minutes for 750 rows. It makes one MusicBrainz request per row and at most one per second (1.1 s apart), and prints progress every 25 rows. Set `MUSICBRAINZ_USER_AGENT` in `.env` first.
- It is safe to re-run or stop. Each row is written in its own transaction. A second run skips rows it already imported, sent to review or that you skipped there, and tries the rows it could not reach again.
- Review the rest at <http://localhost:3000/import> (linked from the home page while items are open). For each item, pick a candidate or search the catalog, keep it as a manual album, or skip it.
- The spreadsheet is never committed; keep it outside the repo.

Reading the summary the script prints at the end:

- `Imported` rows were matched automatically. `Sent to review` splits into no match, ambiguous, duplicate album match and rank taken; the rows themselves are on `/import`.
- `Merged duplicates`, `Conflicting placement` (a rank and an honorable mention on one row; imported as an honorable mention), `Decade rank dropped` (a decade rank on a listed album, or one that is not a whole number from 1 to 25; the row is still imported) and `Decade list full` name the rows that need a look.
- `Invalid, skipped` rows are left out, each with its reason; fix the sheet and run again.
- `Not reached` rows hit a MusicBrainz error; run the command again to retry them. Ten failures in a row stop the run.
- `Decade lists` shows how many entries each decade list now has. The summary describes this run only.

## Browser tests

Playwright drives Chromium against a production build of the app on port 3100, with its own SQLite file under `test-results/` and a local stand-in for MusicBrainz (`MUSICBRAINZ_URL`), so no test calls the live service.

1. One time: `npx playwright install chromium`
2. `npm run test:e2e`

Each test also records what it does in the page (clicks, typing, form submits, route changes) and writes it as `events.json` in that test's folder under `test-results/e2e/`, for the replay renderer. The format is in [docs/event-log-format.md](docs/event-log-format.md). The same recorder runs in `npm run record` ([Record a session](#record-a-session)). The browser injects it; the app's own code never contains it.

Checks:

- `npm test`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run test:e2e` (needs the one-time Chromium install above)

The stack and the reasons for it are in [docs/stack.md](docs/stack.md).
