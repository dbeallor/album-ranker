# Decade top 25 lists

**Status:** Shipped
**Shipped:** in PR #28, as specified
**Date:** 2026-11-21
**Ticket:** [ALBUM-9](https://github.com/dbeallor/album-ranker/issues/9), epic [#11](https://github.com/dbeallor/album-ranker/issues/11)
**Follows:** [MVP requirements](2026-11-20-album-ranker-mvp.md) § Decade top 25, [data model and storage](2026-11-21-album-4-data-model-storage.md), [Elo engine and matchups](2026-11-21-album-7-elo-matchup.md). Shares its drag and drop choices with the per-year ranking screen spec (ALBUM-6, on `feat/album-6-year-ranking-screen`).

## Goal

One page per decade with the user's hand-ranked top 25 albums, with covers and ratings. It replaces the spreadsheet's "Decade Top 25" columns and the By Decade sheet. A decade with no list yet shows a suggestion built from the ratings, which the user can accept and then reorder.

## Words

- **Decade:** the year page year rounded down to a multiple of 10 (`decadeOf` in `lib/db/decade-lists.ts`). The catalog release year plays no part.
- **Eligible album:** an album with a `ranked` or `honorable_mention` year entry in the decade. Listed albums are not eligible. Every eligible album has a rating.
- **List:** the decade's stored decade list entries, positions 1 to n, n at most 25.
- **Suggestion:** the decade's eligible albums sorted by rating, highest first, ties to the lower album id, first 25. Computed on every load, never stored.

## Routes

- **`/decades`**, linked from the home page: the decade picker. One row per decade that has at least one year entry or a list, oldest first, for example "1990s: 18 of 25 on the list, 143 eligible" or "1980s: no list yet, 61 eligible". Each row links to the decade page.
- **`/decades/[decade]`**, for example `/decades/1990`: the decade page. A value that is not a whole multiple of 10 from 1900 to 2100 is a 404. The page has links to the previous and next decade.

Both pages read the database per request (`connection()`), as `/matchups` does.

## Decade page

### With a list

A numbered list, position 1 first. Each row shows position, cover, title, artist, year (the year page year) and rating (the replay's value rounded to a whole number). Below the list a line says "18 of 25".

- **Reorder** by drag and drop, or with "Move up" and "Move down" buttons on each row (disabled at the ends).
- **Remove** with a "Remove" button on each row. Positions close up. Removing the last album empties the list, and the page shows the suggestion again.
- **Add:** a panel under the list, "Add from the 1990s", lists the eligible albums not on the list, sorted by rating (highest first), each with cover, title, artist, year, rating and an "Add" button. Add puts the album at the end of the list. With 25 on the list, every Add button is disabled and the panel says "The list is full. Remove one to add another."
- A decade with fewer than 25 eligible albums lists what it has; when every eligible album is on the list the panel says "Every eligible album is on the list."

### With no list

The page says "No list for the 1990s yet. Here is a suggestion from your ratings." and shows the suggestion in the same row layout, read only, with an "Accept suggestion" button. Nothing is stored until the user presses it. Accepting saves the suggestion as the list (positions 1 to n in the order shown) and the page switches to the editable list.

A decade with fewer than 25 eligible albums suggests all of them. A decade with no eligible albums says "No ranked or honorable mention albums in the 1990s yet." and links to `/years` (from ALBUM-6; until that lands the link is a plain line with no link).

There is no "start an empty list" option: an empty list is stored as no rows, which is the same as no list. A user who wants a different list accepts the suggestion and edits it.

### Covers

The existing `Cover` component at 80 px. ALBUM-6 adds a `size` prop to it (default 125). If ALBUM-6 has merged when this is built, use its prop; if not, add the same prop with the same name and default, so whichever lands second merges cleanly.

### Narrow screens

Rows stay one per line; the cover, then the text, then the buttons wrap under the text.

## Drag and drop

`@dnd-kit/core` and `@dnd-kit/sortable`, as in the ALBUM-6 spec: mouse, touch and keyboard in one model. If ALBUM-6 has already added them, reuse its versions.

- Only the list is sortable. Albums are added from the panel with the Add button, not by dragging.
- **Touch:** press and hold (200 ms) to pick up a row, so a swipe still scrolls.
- **Keyboard:** focus a row, Space to pick it up, arrow keys to move, Space to drop, Escape to cancel, with dnd-kit's screen reader announcements.
- A drop and the buttons share one pure function that computes the new order from the old order and the move, so jsdom tests cover every move without driving a drag.

## Saving

- Every change (drop, move button, add, remove, accept) saves at once. No save button.
- The client sends the whole new list (album ids in order) to one server action, which calls the existing `setDecadeList` in one transaction and returns the decade's new view (list, panel, counts, ratings).
- The page updates optimistically. If the save fails, it goes back to the last saved state and shows the error. Changes are sent one at a time: a change made while a save is in flight waits for it.
- **The 25 limit is enforced on the server.** `setDecadeList` already refuses more than 25 albums, a repeated album and an ineligible one, with a `DataError`. The action turns these into a message ("A decade list holds at most 25 albums.") and stores nothing. The disabled Add buttons are a convenience, not the check.
- **Accept** sends the album ids the page showed, and the action saves them only if the decade still has no list. If a list exists by then (saved in another tab), it stores nothing and returns the current list with "This decade already has a list." It saves the ids the user saw, not a fresh suggestion, so the list matches what was on screen.
- The action checks its input before calling the data layer: the decade is a whole multiple of 10 from 1900 to 2100, the ids are an array of positive whole numbers of length at most 25. Anything else is refused with a message.
- Albums that stop being eligible (moved to another decade, made listed, removed from their year) leave the list through the data layer's existing rule; the year page names them. The decade page just shows the list as stored.

## Server side

- `lib/decades.ts` (no database import, no `server-only`): pure functions with fixture tests.
  - `suggestDecadeList(eligible: { albumId, rating }[]): number[]`: the suggestion rule above.
  - `moveInList(ids, move)`: the new order for a drop, move up, move down, add at end or remove.
  - `decadeSummaries(entries, listEntries)`: the picker rows (decade, list count, eligible count).
- `lib/decade-service.ts` (server only): builds the decade view (list rows and panel rows joined to album title, artist, cover, year page year and rounded rating from `loadRatings`), and the save and accept functions. Takes the database, so tests run on an in-memory database, the same split as `lib/matchups-service.ts`.
- `app/decades/actions.ts`: thin server actions over the service, as `app/matchups/actions.ts` does.
- No migration. The existing `decade_list_entries` table and `setDecadeList` cover every change.

## Tests

One test per rule, none for styling.

- **Pure functions (table tests):**
  - suggestion: sorts by rating, ties go to the lower id, stops at 25, returns all of a set smaller than 25, returns nothing for no eligible albums;
  - `moveInList`: drop down, drop up, move up and down at the ends, add at end, remove from the middle;
  - picker summaries: a decade with only listed albums counts 0 eligible; a decade with a list counts its entries.
- **Service (in-memory database):**
  - list building: saving an order and loading it again returns that order (the reload acceptance);
  - a 26th album is refused and the list is unchanged;
  - an album from another decade, or a listed album, is refused;
  - a decade with fewer than 25 eligible albums: the suggestion and the panel hold what it has;
  - a decade with no list returns the suggestion and the database has no decade list entries for it afterwards (nothing saved before accept);
  - accept saves the suggestion in order; accept on a decade that already has a list stores nothing;
  - the year shown is the year page year, not the release year;
  - bad input (a decade not a multiple of 10, a non-integer id, a duplicate id) is refused.
- **Component (React Testing Library, server actions mocked):** the suggestion with Accept, then the editable list; move up and down; remove; add from the panel; Add disabled at 25; revert and message after a failed save.

## Acceptance

From the ticket:

- A decade with fewer than 25 eligible albums renders what it has.
- Reordering persists across reload, and a 26th album is refused.
- An empty decade shows the rating-based suggestion, and nothing is saved until the user accepts it.
- Tests cover list building and the suggestion for a decade.
- The decade picker lists every decade that has albums.

## Out of scope

- Artist views (#8).
- Importing the sheet's 75 decade ranks (#10).
- Reordering the suggestion before accepting it.
- Dragging albums from the panel into a position (Add puts them at the end; the user then drags).
- Undo for list edits.
- End-to-end browser tests (the repo has no browser test setup).

## Calls I made

Surprising first.

- **Removing every album from a list brings the suggestion back.** An empty list is stored as no rows, so the data model can't tell "no list yet" from "emptied on purpose". There is no "start empty" option; the user accepts the suggestion and edits it.
- **The suggestion is read only until accepted.** The ticket says accept, then reorder; reordering first would mean saving anyway.
- **Accept saves what was on screen, and only if the decade still has no list,** so a list made in another tab is never overwritten by a stale suggestion.
- **Albums are added from a panel of eligible albums with an Add button, at the end of the list,** not by catalog search and not by dragging into a position. Only albums already placed in the decade can go on the list, so the panel lists exactly those, best rated first.
- **The picker shows decades with any year entry, including only listed albums,** each with its list count and eligible count. The ticket says "every decade that has albums".
- **Suggestion ties go to the lower album id,** to keep it stable and testable.
- **Same drag and drop library and pattern as ALBUM-6** (`@dnd-kit`, 200 ms touch hold, keyboard, Move up and Move down buttons). Whichever of the two lands second reuses the other's dependency and the `Cover` `size` prop.
- **Covers at 80 px**, so 25 rows fit without endless scrolling.
- **Routes `/decades` and `/decades/1990`**, a decade outside 1900 to 2100 or not a multiple of 10 is a 404, with previous and next decade links.
- **Save on every change, whole list at once,** through the existing `setDecadeList`, optimistic with revert, as ALBUM-6 does for years.
- **No migration.** The data model already has the table and the 25 limit.
- **The decade page doesn't name albums the data layer removed;** that happens on the year page, where the change is made.
