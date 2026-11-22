# Update the app UI for the library and analytics flow

**Status:** Draft
**Date:** 2026-11-22
**Ticket:** [ALBUM-38](https://github.com/dbeallor/album-ranker/issues/38)
**Follows:** [restyle with one design system](2026-11-21-album-31-restyle-design-system.md), [library table and analytics](2026-11-21-album-34-elo-library-table.md), [add albums to the library](2026-11-21-album-35-add-albums-library.md), [artist rating and sorts](2026-11-21-album-36-analytics-sorts.md). Where the ticket text and what shipped differ, what shipped wins.

## Goal

Part 5 of 5 of the "purely Elo" change. The app should read as: search for albums, add them to the library, play matchups, read the analytics. ALBUM-34, 35 and 36 built the pages; this ticket polishes how they fit together. No new pages, no change to Elo or the artist rating.

## What is already done on `main` (not rebuilt)

Checked on `main` at `ebf7273`:

- The years and decades pages are gone; `/artists`, `/years` and `/decades` redirect. ALBUM-37 was closed as already done by ALBUM-34.
- The nav (`components/ui/site-header.tsx`) is Search, Library, Matchups, Analytics, Import. No link points at a removed page.
- The home page has no years or decades copy. Its cards are Search albums, Library, Matchups, Analytics, plus an Import review card when items are open.
- `/analytics` already uses `Tabs` for the ranking (Albums, Artists, Years, Decades, Eras) and for the scope (Lifetime and the four eras), with a decade picker and a year picker. Rows are `Table`s with covers on albums and `EmptyState` for no data.
- `/library` is a card grid of `ListRow`s with a sort picker, filters, year divider headings and a Remove button, all from `components/ui`.
- `lib/design-system.test.ts` already keeps raw colors and inline styles out of `app/` and `components/`.

## What changes

### 1. Home page says what the app is for and shows two facts

- Description: "Build a library, play matchups, read the rankings." followed by the facts, as plain text in the `PageHeader` description: "12 albums in your library · 340 matchups played" (singular for 1). The counts are `listLibrary(db).length` and `countMatchups(db)`.
- With an empty library the description instead says "Your library is empty. Search for an album to start." and the Search card is first (it already is).
- Card copy follows the flow and uses the same words as the nav:
  - Search albums: "Find an album in the catalog and add it to your library."
  - Library: "Browse, sort and filter every album you have added."
  - Matchups: "Pick the better of two albums to refine your ratings."
  - Analytics: "See album and artist rankings by lifetime, era, decade and year."
  - Import review: unchanged.
- No new component. The facts are text, not stat tiles, so the one page that uses them needs no shared part.

### 2. No dead ends

Each place that can end with nothing to click gets one next step, built from `EmptyState`'s `action` slot, `ButtonLink` or the page header's `actions` slot:

| Where | Today | After |
|---|---|---|
| `/library`, library empty | text only | action "Search albums" (`/search`) |
| `/library`, filters match nothing | text only | action "Clear filters" (`/library`) |
| `/library` header | none | actions "Add albums" (`/search`) and "Matchups" (`/matchups`) |
| `/analytics`, library empty | text only | action "Search albums" |
| `/analytics`, a scope with no albums | text only | action "Show lifetime" (same view, lifetime scope) |
| `/search`, after "Added X to your library" | message only | the message links to "View library" (`/library?sort=year`, so the album shows under its year heading) and "Play matchups" |
| `/library` remove success message | message only | unchanged (the page is the library) |

The matchup screen already has "Search albums" in its empty state.

### 3. Analytics: say what each tab row is

The two `Tabs` rows (the ranking, and the scope) are unlabeled to a sighted reader. Add a short muted label above each: "Show" (Albums, Artists, Years, Decades, Eras) and "Period" (Lifetime and the eras, with the decade and year pickers). The scope row and pickers still appear only for the Albums and Artists views, as today. The page header description stays. The labels are page-local text in the page's CSS Module; the tabs themselves are unchanged.

The tables keep scrolling inside their own region on a phone, as ALBUM-31 decided; only the cover, title and rank columns are the first things a reader sees.

### 4. Library controls on a phone

Today the filter form is six fields and a button in one wrapping row, which is a tall stack on a phone. Change it to two tiers inside the same GET form:

- Always visible: Sort by, Direction and Apply. At 375px, Sort by and Direction sit side by side and Apply is full width under them.
- A native `<details>` titled "Filters" holding the search box, Scope and Matchups. It is open when any of them is set (a search text, a scope other than lifetime, or a played filter other than all) and closed otherwise, so the active filters are never hidden.

The `<details>` and its styling live in `app/library/page.module.css` and use existing tokens. It is not a shared component: only this page needs it. The URL parameters and the server-side filtering do not change.

### 5. Checks

- `lib/design-system.test.ts` must keep passing (no raw colors, no inline styles).
- A new table-driven test, `components/ui/links.test.ts`: every `href` in the nav list and every `href` on the home page resolves to an existing route under `app/` (`page.tsx`, or a redirect route). The nav list moves into an exported constant so the test reads it.
- Component tests updated for the new copy and the new empty-state actions: home facts (zero, one, many; empty library), library empty and no-match actions and the filters `<details>` open and closed, analytics labels and empty actions, the search added message links.
- `e2e/layout.spec.ts` adds `/analytics` to its routes (nav present, no sideways scroll at phone and desktop widths).
- One new e2e click-through, `e2e/flow.spec.ts`, against the catalog stub: home, Search, add two albums, Library (`?sort=year` shows a year heading), Matchups (pick one), then Analytics for Albums, Artists, Years, Decades and Eras, with no 404 and no dead end on the way. Uses the existing stub and a fresh test database.

## Proof

- Screenshots at 375px and 1280px, light and dark theme, of home (empty and with data), library (default, sorted by year, with filters open, and empty), search after adding, each analytics view and its empty state. Taken on a ticket preview (`npm run preview -- 38`, <http://localhost:4038>) over a throwaway database filled through the app, never the real one.
- `npm test`, `npm run lint`, `npm run typecheck` and `npm run test:e2e` pass.

## Leaves out

- New pages, features or filters; changes to Elo, the artist rating, the sorts or scopes (ALBUM-34, 35, 36).
- A stat-tile component, charts or a new nav entry.
- Making the analytics tables stack as cards on a phone.
- Changing the design tokens or adding any CSS library.

## Calls I made

- **Most of the ticket was already built by ALBUM-34, 35 and 36.** The home cards, nav and analytics tabs already match what the ticket describes, so this spec lists them as done and changes only the gaps: the home facts, dead ends, tab labels and the phone controls.
- **Facts are text in the page description**, not stat cards. The ticket says add a shared component only when two pages need it, and only the home page shows facts.
- **"Matchups played" is every stored matchup** (`countMatchups`), the same number the library page removes along with an album. Matchups of albums since removed are already deleted with them, so it equals what the ratings use.
- **Import stays in the nav always**, and stays a conditional card on the home page, as shipped. The ticket says "Import review when there is something to check" for the home page only.
- **Artists is not its own page** after ALBUM-36 (it redirects to Analytics, Artists), so it gets no nav entry, as the ticket allows.
- **Analytics keeps its two tab rows** and a mixed first row (the two rankings and the three summaries). The ticket's "period: year, decade, era, lifetime" is the second row plus the pickers; I only label the rows.
- **Filters go in a native `<details>`**, open when any filter is active, instead of a new shared disclosure component, because only the library page needs it.
- **"View library" after adding links to `?sort=year`** because the ticket's click-through is "the library sorted by year".
- **The click-through test uses the existing catalog stub**, which returns several albums for one query, so two albums come from one search.
- **Dark theme and phone are checked by screenshot review** (the way ALBUM-31 did it), plus the sideways-scroll test. No automated dark-theme test.
