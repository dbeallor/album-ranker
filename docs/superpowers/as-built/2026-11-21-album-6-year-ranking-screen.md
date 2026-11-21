# As-built: per-year ranking screen

**Shipped:** in PR #27
**Ticket:** ALBUM-6
**Spec:** [2026-11-21-album-6-year-ranking-screen.md](../specs/2026-11-21-album-6-year-ranking-screen.md)

## Differs from the spec

- The spec says changes are sent one at a time. Shipped: a change made while a save is in flight is sent, once the first save returns, as the latest placements, so two quick changes can be one request. If a save fails, everything made after it is reverted too.
- The spec says "Move to ranked" puts the album at the end. Shipped: when ranked is full, the album takes rank 10 and the old rank 10 goes to honorable mentions (the spec's "pushes rank 10 out" rule), rather than being pushed out itself.
- The spec says dropping on a slot inserts there. Shipped: each ranked card is itself a drop target (dnd-kit's keyboard movement needs it) and dropping on a card takes that card's position; dropping on an empty slot appends to the end, since ranks never keep gaps.
- The spec says narrow screens stack the areas. Shipped: ranked is a single column at every width (a wrapping grid made arrow-key movement jump); honorable mentions and listed are a multi-column grid.
- Not in the spec: card controls are disabled while an add is running, and the add buttons are disabled while a save is pending. Dropping a card on itself saves nothing.
- A whole-year save from a stale tab (another tab added an album since the page loaded) removes the albums the stale page does not know about. Accepted for a single user on localhost.
