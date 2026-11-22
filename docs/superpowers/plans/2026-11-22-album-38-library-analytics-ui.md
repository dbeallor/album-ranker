# ALBUM-38 plan: the UI pass for the library and analytics flow

Spec: [2026-11-22-album-38-library-analytics-ui.md](../specs/2026-11-22-album-38-library-analytics-ui.md). Tests use in-memory or throwaway databases only; never touch `data/album-ranker.db`. Each task ends with `npm test`, `npm run lint` and `npm run typecheck` green, then commit and push on `feat/album-38-library-analytics-ui`. Run `npm install` first (the worktree has no `node_modules`) and read the Next docs in `node_modules/next/dist/docs/` before touching a page. Only `components/ui` parts, design tokens and page-local CSS Modules; no raw colors, no inline styles (`lib/design-system.test.ts`).

## Task 1: home page and the link test

- `components/ui/site-header.tsx`: export the nav list (`NAV_ITEMS`) so a test can read it.
- `app/page.tsx`: read `listLibrary(db).length` and `countMatchups(db)`. Description: "Build a library, play matchups, read the rankings." plus " N album(s) in your library · N matchup(s) played" (singular for 1); with an empty library the description is "Your library is empty. Search for an album to start." Card copy per the spec § 1 (Search albums, Library, Matchups, Analytics). Import card unchanged.
- `app/page.test.tsx`: zero albums, one album and one matchup, many; the new card copy.
- `components/ui/links.test.ts` (node environment): table-driven. For every `NAV_ITEMS` href and every `href` literal in `app/page.tsx`, a route exists under `app/` (`<href>/page.tsx`, or `/` is `app/page.tsx`). Query strings are stripped first.

## Task 2: no dead ends

- `app/library/page.tsx`: empty library `EmptyState` gets `action` "Search albums" (`ButtonLink` to `/search`); no-match state gets "Clear filters" (`/library`); `PageHeader` `actions`: "Add albums" (`/search`) and "Matchups" (`/matchups`).
- `app/analytics/page.tsx`: empty library `EmptyState` gets "Search albums"; an empty scope on Albums or Artists gets "Show lifetime" (`href(view)`); the summary views' empty state gets "Search albums".
- `app/search/page.tsx`: the added message keeps its text and gains two links, "View library" (`/library?sort=year`) and "Play matchups" (`/matchups`), in the same `Message`.
- Update `app/library/page.test.tsx`, `app/analytics/page.test.tsx`, `app/search/page.test.tsx` for the new links and actions.

## Task 3: analytics labels and library filters

- `app/analytics/page.tsx` and `page.module.css`: a muted label ("Show" above the view tabs, "Period" above the scope tabs and pickers), page-local class using tokens. The scope row still shows only on Albums and Artists. Extend the page test: the labels, and none for "Period" on a summary view.
- `app/library/page.tsx` and `page.module.css`: inside the same GET form, Sort by and Direction (flex basis so two fit side by side at 375px) and the Apply button always visible; the search box, Scope and Matchups inside a native `<details>` with summary "Filters", `open` when `q` is set, scope is not lifetime, or played is not `all`. Field names and server filtering unchanged. Test: the details is closed with no filters, open with each of the three set; the form still submits by GET with all six fields present.

## Task 4: e2e and docs

- `e2e/layout.spec.ts`: add `/analytics` to `ROUTES`.
- `e2e/flow.spec.ts`: home, Search for the stub query, add two albums with a year each, "View library" shows a year heading, Matchups (choose one), then each analytics view (Albums, Artists, Years, Decades, Eras): no 404 and every page has its h1. Fresh state is not guaranteed on the shared e2e database, so assert on what the test added and on page headings, not on exact counts.
- Run `npm run test:e2e`.
- README: update the home, library filters and search "after adding" text where they describe these pages. `docs/superpowers/as-built/` entry after the build, listing differences from the spec.

## Proof (for the PR, not the repo)

`npm run preview -- 38` over a throwaway database filled through the app. Screenshots at 375px and 1280px, light and dark: home (empty and with data), library (default, by year, filters open, empty), search after adding, each analytics view and an empty state.
