# album-ranker
Personal Favorite Album Ranker

## Run the app

1. Install Node 24 or newer (`nvm use` reads `.nvmrc`).
2. `npm install`
3. Optional: `cp .env.example .env` to change `DATABASE_PATH` or `MUSICBRAINZ_USER_AGENT`.
4. `npm run db:migrate` creates the SQLite file and applies migrations. Optional: the app also migrates on first use.
5. `npm run dev`
6. Open <http://localhost:3000>.

## Search albums

Open <http://localhost:3000/search> and type an album or artist. Results come from MusicBrainz, one per album, with cover art from the Cover Art Archive.

MusicBrainz asks API users to put contact details in the User-Agent. Set `MUSICBRAINZ_USER_AGENT` (for example `album-ranker/0.1 (you@example.com)`) in `.env`; the default is `album-ranker/0.1`. MusicBrainz allows about one request per second, so a busy message means to wait a moment and try again.

## Matchups

Open <http://localhost:3000/matchups> to answer "which of these two do you like more?" for two albums from different years. Pick one, call it a tie, skip the pair, or undo the last answer (undo works repeatedly and serves the undone pair again).

Ratings are never stored. Every request replays the year placements (ranked over lower ranked and over honorable mentions, year by year) and then your matchup answers, oldest first, as Elo with K = 32 from 1500. Only ranked and honorable mention albums are rated and served. Details are in [the ALBUM-7 spec](docs/superpowers/specs/2026-11-21-album-7-elo-matchup.md).

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

Checks:

- `npm test`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

The stack and the reasons for it are in [docs/stack.md](docs/stack.md).
