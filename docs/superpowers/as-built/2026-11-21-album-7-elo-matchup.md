# As-built: Elo rating engine and matchup screen

**Shipped:** in PR #21
**Ticket:** ALBUM-7
**Spec:** [2026-11-21-album-7-elo-matchup.md](../specs/2026-11-21-album-7-elo-matchup.md)

## Differs from the spec

- The spec says the last-answer line shows the ratings going back after an undo. Shipped: it reads "Undone: <title> 1500 → 1484, ...", or just "Undone." when an album no longer has a card or rating.
- The spec says undo serves the undone pair again. Shipped: it does so only while both albums are still rated and in different years; otherwise it serves a fresh pair.
- The spec says a skip serves the next pair. Shipped: the previous answer's line stays on screen after a skip.
- The spec calls `lib/ratings.ts` a "server-only loader". Shipped: it does not import `server-only`, so tests can import it. The database is only reached through `getDb()` in `app/matchups/actions.ts` and the page.
