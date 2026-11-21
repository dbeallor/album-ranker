# Per-year ranking screen

**Status:** Draft
**Date:** 2026-11-21
**Ticket:** [ALBUM-6](https://github.com/dbeallor/album-ranker/issues/6), epic [#11](https://github.com/dbeallor/album-ranker/issues/11)
**Follows:** [MVP requirements](2026-11-20-album-ranker-mvp.md) § Year ranking screen, [data model and storage](2026-11-21-album-4-data-model-storage.md), [catalog search](2026-11-21-album-5-catalog-search.md), [Elo engine and matchups](2026-11-21-album-7-elo-matchup.md)

## Goal

One page per year where the user builds that year's ranking by dragging album covers: a top 10, honorable mentions, and a list of albums heard that year but not placed. It replaces the spreadsheet's "Ranked" sheet. Every change saves straight away, and each rated album shows its current Elo rating.

## Routes

- **`/years`**, linked from the home page: a list of every year that has entries, each with its count of ranked, honorable mention and listed albums, linking to its page. Above it, a "Go to year" number field (1900 to 2100) opens any year, including an empty one.
- **`/years/[year]`**: the year page. A year outside 1900 to 2100, or not a whole number, is a 404. The page has links to the previous and next year.

Both pages read the database per request (`connection()`), as `/matchups` does.

## Year page layout

Three areas, top to bottom, plus an add panel.

1. **Ranked:** ten numbered slots, 1 to 10. A filled slot shows the cover, title, artist and rating. An empty slot shows its number and "Empty". A year with 3 ranked albums shows 7 empty slots.
2. **Honorable mentions:** an unordered area of cards with cover, title, artist and rating. Shown sorted by artist, then title, since it stores no order.
3. **Listed:** an unordered area of cards with cover, title and artist, no rating. Same sort.
4. **Add an album:** catalog search and the manual album form (below).

Each empty area says so ("No honorable mentions yet", "No listed albums yet"). A year with no albums at all shows a line above the ranked slots: "No albums for <year> yet. Search below to add one."

Covers use the existing `Cover` component, given a new `size` prop (default stays 125) so cards on this page can be smaller (80). Albums with no cover URL, including manual ones, show the placeholder.

Ratings are the replay's values rounded to whole numbers, computed on every load and after every change. A ranked or honorable mention album always has one.

On a narrow screen the areas stack in one column and the ranked slots run as a vertical list.

## Moving albums

### Drag and drop

[`@dnd-kit`](https://dndkit.com/) (`@dnd-kit/core`, `@dnd-kit/sortable`), which supports mouse, touch and keyboard sensors in one model. New dependencies; nothing else in the repo does drag and drop yet.

- **Within ranked:** drag a card to another slot. The ranked list is an ordered list: dropping rank 4 on slot 1 makes it rank 1 and shifts the old 1 to 3 down by one.
- **Between areas:** drag a card from any area to any other. Dropping into ranked inserts it at the slot it was dropped on. Dropping onto honorable mentions or listed adds it there.
- **Ranked is full:** inserting an eleventh album into ranked pushes the album at rank 10 into honorable mentions, and the page says so ("<title> moved to honorable mentions").
- **Touch:** press and hold (200 ms) to pick a card up, so a normal swipe still scrolls the page.
- **Keyboard:** focus a card, Space to pick it up, arrow keys to move, Space to drop, Escape to cancel, with dnd-kit's screen reader announcements.

### Card controls

Every card also has small buttons, so nothing depends on dragging:

- Ranked cards: "Move up", "Move down" (disabled at the ends of the list).
- Every card: a "Move to" menu with the two other areas, and "Remove".

Moving a card to ranked with the buttons puts it at the end of the ranked list (or, when full, behaves as the full-list rule above).

### Ranks are saved without gaps

Saving writes the ranked list as ranks 1, 2, 3, … in order. A year whose stored ranks have a gap (for example 1, 2 and 4 from a hand-edited database) shows the albums in their stored slots, with the gap empty, and the first change to that year closes the gap.

### Remove

Remove deletes the album's year entry and keeps the album (and its matchups), as the data model says. Its rating disappears; it can be added again later from search.

## Saving

- Every change (drop, button, add, remove) saves at once. No save button.
- The client sends the whole year's new placements (ranked album ids in order, honorable mention ids, listed ids) to one server action, which calls the existing `setYearPlacements` in one transaction and returns the year's new view (albums, ratings).
- The page updates optimistically. If the save fails, it goes back to the last saved state and shows the error.
- Changes are sent one at a time: a change made while a save is in flight waits for it.
- When a save removes albums from a decade list (data model rule 7), the page names them ("Removed from the 1990s list: <title>").
- The server action checks its input: the year is a whole number in range, every id is a positive whole number, there are at most ten ranked ids, and no id appears twice. It refuses anything else with a message and stores nothing.

## Adding albums

### From the catalog

The add panel has a search field and a Search button. Results come from a server action that calls the existing `searchAlbums` (so its cache and rate limiting apply) and show cover, title, artist and release year. Each result has three buttons: "Add to ranked", "Add to honorable mentions", "Add to listed".

- "Add to ranked" puts the album at the end of the ranked list. When ranked is full the button is disabled, with the hint "Ranked is full: add to honorable mentions or move one out first."
- The server action finds the album by catalog id, or creates it from the result (title, artist, release year, cover URL). It then places it in this year.
- The server checks the result it is given: catalog id, title and artist are non-empty strings of reasonable length, the year is null or a whole number, and the cover URL is null or an `https://coverartarchive.org/` URL. Anything else is refused.
- The new album's artist is stored by name only (no artist catalog id), because the catalog search result doesn't carry one.

### Already on a year page

- **Another year:** the action stores nothing and returns the other year and placement. The page asks: "<title> is on 1987 (rank 3). Move it to 1990?" with "Move" and "Cancel". Move adds it here and removes it from 1987, in one transaction (`setYearPlacements` with `moveFromOtherYears`). The 1987 page then no longer shows it.
- **This year:** the page says "<title> is already on this page" and changes nothing.

### Manual album

A small form below the search, opened with "Can't find it? Add it by hand": title, artist, release year (optional, whole number), and the area to add it to. It creates an album with no catalog id and no cover (so it shows the placeholder) and places it in this year. Title and artist are required. Linking a manual album to the catalog later is not part of this ticket.

## Server side

- `app/years/actions.ts`: server actions for save, search, add from catalog and add manual album. Each is a thin wrapper over a function in `lib/year-service.ts` that takes the database, so tests run against an in-memory database (the same split as `app/matchups/actions.ts` and `lib/matchups-service.ts`).
- `lib/year-service.ts` builds the year view: each entry joined to its album (title, artist, cover) and its rounded rating from `loadRatings`.
- No migration. The existing tables and `setYearPlacements` cover every change.

## Tests

Sized to the repo's habit: one test per rule, none for styling.

- **Service (in-memory database):**
  - reorder: saving rank 4 as rank 1 stores ranks 1 to 4 shifted and a fresh load returns the new order (the reload acceptance);
  - a year with 3 ranked albums saves and loads with 3 ranks;
  - a gap in stored ranks closes on save;
  - move between the three areas, and remove keeps the album;
  - add from catalog creates the album once and reuses it by catalog id;
  - add an album on another year returns the conflict and stores nothing, and with move it ends up only on the new year;
  - add an album already on this year changes nothing;
  - manual album gets no catalog id and no cover;
  - bad input (eleven ranked, a duplicate id, a year out of range, a cover URL on another host) is refused and nothing changes;
  - ratings in the view come from the replay, and listed albums have none.
- **Component (React Testing Library, server actions mocked):** add from search into each area, reorder with the move buttons, move between all three areas with the "Move to" menu, remove, the move-from-another-year prompt (Move and Cancel), the full-ranked rule, the empty states, and the revert after a failed save. Dragging itself isn't driven in jsdom; the buttons and the drop handler share one function that computes the new placements, and that function has its own table test (drop within ranked, between areas, into a full ranked list).

## Acceptance

From the ticket:

- Dragging an album from rank 4 to rank 1 shifts the others down by one and the order survives a page reload.
- Adding an album already on another year asks to move it, and moving it removes it from the first year.
- A year with 3 ranked albums renders with 7 empty slots and saves.
- Component tests cover add, reorder, move between the three areas and remove.
- Reordering works by keyboard and by touch, not only with a mouse.

## Out of scope

- Computing ratings (done in #7).
- Artist and decade views (#8, #9).
- Importing the spreadsheet (#10).
- Linking a manual album to a catalog album, and editing or deleting albums.
- End-to-end browser tests (the repo has no browser test setup).
- Undo for year edits.

## Calls I made

Surprising first.

- **Ranks always save without gaps.** Moving rank 4 to rank 1 renumbers the list 1 to N. A year with stored gaps keeps them on screen until its first edit, which closes them. The ticket's "shifts the others down by one" implies an ordered list; it doesn't mention gaps.
- **A full ranked list pushes rank 10 to honorable mentions** when an eleventh album is dropped in, and says so. The alternative was refusing the drop. Adding from search into a full ranked list is disabled instead, since there is no drop position to honour.
- **Move up/down and "Move to" buttons on every card,** on top of drag and drop with keyboard and touch. They give a way that doesn't depend on drag gestures and let jsdom tests cover every move.
- **`@dnd-kit` is a new dependency** for drag and drop. Native HTML drag and drop has no touch or keyboard support.
- **Save on every change, whole year at once,** through the existing `setYearPlacements`, with an optimistic update that reverts on failure. No save button.
- **Honorable mentions and listed albums are shown sorted by artist, then title,** because they store no order. Dragging within those areas doesn't reorder them.
- **Adding from search puts a ranked album at the end of the list;** the user then drags it into place.
- **The server re-checks catalog results** it receives from the browser, and only accepts Cover Art Archive cover URLs.
- **Catalog albums are stored with the artist by name only,** since search results carry no artist catalog id. Two catalog albums by the same artist share one artist row through the existing name match for artists with no catalog id.
- **A `/years` index page** lists years with entries and has a "Go to year" field. The ticket only says "pick any year".
- **Previous and next year links** on each year page.
- **A year outside 1900 to 2100 is a 404,** matching the data model's year range.
- **The manual album form asks for an optional release year;** the year page's year is where it's placed. The ticket lists "title, artist, year".
- **`Cover` gets a `size` prop,** 80 px on this page.
- **Remove keeps the album and its matchups,** per the data model; only the year entry goes.
- **No undo for year edits.**
