# As-built: Show progress toward a settled overall ranking

**Shipped:** in PR #46
**Ticket:** ALBUM-42
**Spec:** [2026-11-22-album-42-ranking-progress.md](../specs/2026-11-22-album-42-ranking-progress.md)

## Differs from the spec

- The spec says the empty state on `/analytics` (fewer than two albums) links to `/search`. The panel's empty state is text only. With an empty library the page's own empty state already shows a "Search albums" link, and a second one made two links with the same name.
- At target the matchup page line reads "100% there · Target reached", and the panel reads "Target reached" in place of "About 0 more to go". The spec left the wording open.
