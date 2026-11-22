# As-built: Stop one album appearing in every matchup when only one album is established

**Shipped:** in PR #58
**Ticket:** ALBUM-53
**Spec:** [2026-11-22-album-53-matchup-variety.md](../specs/2026-11-22-album-53-matchup-variety.md)

## Differs from the spec

- The spec says an established album is "recent" if it was in any of the last 3 counted matchups. As built, only the last 3 matchups that involve a new album count, so matchups between two established albums (such as test setup) don't make an album recent.
- The two "opens with the middle of the rating order" fixtures grew from 5 and 6 established albums to 9 and 10, because 5 and 6 are below the minimum of 8. Their expected opponents changed with them.
