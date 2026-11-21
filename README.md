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

Checks:

- `npm test`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

The stack and the reasons for it are in [docs/stack.md](docs/stack.md).
