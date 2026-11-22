# As-built: Modernize the design and trim the pages to the core experience

**Shipped:** in PR #51
**Ticket:** ALBUM-47
**Spec:** [2026-11-22-album-47-modernize-design.md](../specs/2026-11-22-album-47-modernize-design.md)

## Differs from the spec

- The spec says the home cover strip is a full-bleed row. It shipped inside the content width, because a negative-margin full-bleed row risked sideways page scroll.
- The spec's home facts line was "Build a library, play matchups, read the rankings." plus the counts. The prefix is gone: the facts line is only the counts (or the empty-library sentence), since the headline carries that role.
- The home page shows a message about open import items above the cover strip.
- The Library header button that said "Matchups" now says "Play".
- The home search box and Add albums search box have the placeholder "Search an album or artist"; their accessible name is unchanged.
- The tab row's accessible name stays "Analytics view" and empty-state buttons still say "Search albums".
- Small shared-part additions not in the spec: `Cover` takes a `fill` prop and `RankingProgress` takes `showPlay`.
- Matchup choices are at most 24rem wide and centred on desktop so the buttons stay above the fold.
- Shadows are removed everywhere, not only on cards.
