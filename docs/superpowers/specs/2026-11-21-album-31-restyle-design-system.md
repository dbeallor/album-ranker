# Restyle the whole app with one shared design system

**Status:** Shipped
**Date:** 2026-11-21
**Shipped:** in PR #33, with differences: [as-built](../as-built/2026-11-21-album-31-restyle-design-system.md)
**Ticket:** [ALBUM-31](https://github.com/dbeallor/album-ranker/issues/31)
**Follows:** [stack and scaffold](2026-11-20-album-3-stack-scaffold.md), [year ranking screen](2026-11-21-album-6-year-ranking-screen.md), [decade top 25](2026-11-21-album-9-decade-top-25.md)

## Goal

Every screen today is browser-default HTML with ad-hoc inline layout styles and no way to move between pages. Give the app one clean, minimal look: design tokens in one file, a small set of shared components in `components/ui/`, a page shell with a header and nav on every route, and every route and component restyled with them. Light and dark themes, working at 375px and 1280px. No behavior changes.

## Styling approach

Plain CSS, no library. Per the Next.js CSS guide (`node_modules/next/dist/docs/01-app/01-getting-started/11-css.md`):

- **`app/globals.css`**, imported once in `app/layout.tsx`: the design tokens as CSS custom properties on `:root`, the dark theme, a small reset and base element styles (body, headings, links, tables, `:focus-visible`).
- **CSS Modules** (`*.module.css`) next to each component for its own layout. Class names are scoped, so components can't collide. Vitest returns a stand-in object for CSS modules, so component tests keep working unchanged.

Tailwind was considered and turned down: it adds a build plugin and a second vocabulary for a dozen screens, and the ticket asks for a library only if it clearly pays for itself. `docs/stack.md` gets a `Styling` row and a line under `Turned down`.

## Design tokens

All in `app/globals.css`. Nothing in `app/` or `components/` uses a raw color, font, spacing or radius value; they use `var(--…)`.

| Group | Tokens |
|---|---|
| Color | `--color-bg`, `--color-surface`, `--color-surface-sunken`, `--color-text`, `--color-text-muted`, `--color-border` (dividers), `--color-border-strong` (control outlines, at least 3:1 against the surface), `--color-accent`, `--color-accent-hover`, `--color-accent-text` (text on accent), `--color-accent-soft` (selected and drop-target backgrounds), `--color-danger`, `--color-danger-soft`, `--color-success`, `--color-focus` |
| Type | `--font-sans` (system stack: `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`), sizes `--text-sm` 0.875rem, `--text-base` 1rem, `--text-lg` 1.125rem, `--text-xl` 1.375rem, `--text-2xl` 1.75rem; weights `--weight-regular` 400, `--weight-medium` 500, `--weight-bold` 650; `--leading` 1.5 |
| Space | `--space-1` 4px, `--space-2` 8px, `--space-3` 12px, `--space-4` 16px, `--space-5` 24px, `--space-6` 32px, `--space-7` 48px |
| Radius | `--radius-sm` 6px, `--radius-md` 10px, `--radius-lg` 14px, `--radius-full` 999px |
| Other | `--shadow-sm`, `--shadow-md` (lifted drag card), `--focus-ring` (2px solid `--color-focus` with 2px offset), `--content-width` 1040px, `--control-height` 44px, `--header-height` |

Palette: neutral greys with one indigo accent. Light starts from `--color-bg` #f7f7f8, surface #ffffff, text #17181c, muted #5b6070, accent #4f46e5, danger #b42318. Dark (under `@media (prefers-color-scheme: dark)`, with `color-scheme: light dark` on `:root` so native controls follow): bg #0f1115, surface #181b21, text #ececf1, muted #a0a6b4, accent #a5b4fc with dark text on it, danger #f97066. The build checks every text and control pair against WCAG AA (4.5:1 for text, 3:1 for control borders and the focus ring) and adjusts these starting values if any pair falls short; the PR lists the measured ratios.

## Shared components (`components/ui/`)

Each is a small server-safe component (no `"use client"` unless it needs state) with its own module CSS. They pass through `aria-*`, `role`, `id` and event props, so the roles and labels tests query today stay exactly as they are.

| Component | What it is |
|---|---|
| `SiteHeader` | Sticky header: app name "Album ranker" linking to `/`, and a nav with Search, Years, Decades, Artists, Matchups, Import. The current section's link gets `aria-current="page"` and an accent underline (a client component using `usePathname`, the only client part of the shell). On narrow screens the nav wraps onto its own row under the app name. |
| `PageShell` | Used once, in `app/layout.tsx`: the header, then a centered `main` content area at `--content-width` with page gutters (16px on phones, 24px from 640px up). Pages stop rendering their own `<main>`. |
| `PageHeader` | The page `h1`, an optional one-line description and an optional actions slot, with consistent spacing below. |
| `Button` | `variant`: `primary`, `secondary`, `danger`, `ghost`; `size`: `md` (default) and `icon` (square, for the drag handle). Always at least 44px tall and wide. Disabled state is visibly muted. `ButtonLink` gives a `next/link` the same look. |
| `TextField`, `Select` | A visible label (or `aria-label` when the design has no room, as today), the control at 44px, optional hint and error text wired with `aria-describedby`. `Select` keeps the native element. |
| `Card` | A surface with border and radius. `ListRow` is the album row layout: cover, then title, artist and meta, then an actions area that wraps under the text on narrow screens. |
| `EmptyState` | Muted, centered message with an optional action, for every "nothing here yet" case. |
| `Message` | `tone`: `error`, `success`, `info`. A tinted, bordered block. The caller passes the existing `role` (`alert`, `status`, `alertdialog`) and `aria-live`, so nothing about how screen readers announce messages changes. |
| `Stack`, `Cluster` | Two layout helpers (vertical spacing; wrapping horizontal row) with a `gap` prop limited to the space tokens, so pages don't need their own CSS for simple layout. |
| `Table` | The artists ranking table: full width, zebra-free, muted header, right-aligned numbers, inside a container that scrolls on its own if a narrow screen can't fit it (the page itself never scrolls sideways). |
| `Tabs` | The decade choices on `/artists` and the decade switcher on `/decades/[decade]`: a row of pill links with `aria-current="page"` on the active one. |

`Cover` moves its placeholder colors to tokens and its size to a `--cover-size` custom property set from the `size` prop, the one inline style it keeps. Covers get `--radius-sm` and a hairline border.

## Routes

Every route renders inside `PageShell` and starts with `PageHeader`.

- **`/`**: the title and a grid of section cards (Search albums, Year rankings, Matchups, Artists, Decade lists), each a link with a one-line description; the import review card shows only while items are open, as now. Link names stay the same ("Search albums", "Import review: 2 to check" and so on).
- **`/search`**: search field and button in one row (stacked on phones), results as `ListRow`s, empty and error states through `EmptyState` and `Message`.
- **`/years`**: "Go to year" field and button, years as a list of rows (year, then the counts in muted text). The "Back to home" link goes; the header covers it.
- **`/years/[year]`**: see the year screen below. The previous and next year links become secondary `ButtonLink`s.
- **`/decades`**, **`/decades/[decade]`**: decade rows like `/years`; the decade switcher uses `Tabs`.
- **`/artists`**, **`/artists/[id]`**: `Tabs` for the decade filter, `Table` for the ranking; the artist page lists albums as `ListRow`s, "All artists" stays as a link.
- **`/matchups`**: see the matchup screen below.
- **`/import`**: see the import review below, including the "nothing to import" state as an `EmptyState`.
- The not-found page Next.js shows for a bad decade or artist id gets a matching `app/not-found.tsx` (title, one line, link home), so it isn't the only unstyled page.

## Components

- **Year screen** (`components/year-screen.tsx`): ranked slots as a numbered column of cards (rank number in muted text, then the card or a dashed "Empty" slot); honorable mentions and listed as card grids. Album cards are `Card`s showing cover, title, artist and rating, with Move up, Move down, the Move to select and Remove in a wrapping row. Drop targets (`isOver`) switch from an inline outline to a `data-over` attribute styled with `--color-accent-soft` and a dashed accent border. The drag transform, z-index and opacity stay inline (they change every frame). On desktop the ranked column sits at a readable width; on phones everything is one column.
- **Year add panel**: a `Card` with the search field, result rows with their add buttons, and the manual add form as `TextField`s.
- **Decade list** (`components/decade-list.tsx`): rows as `ListRow`s with the position number, the drag handle as an `icon` `Button` (⠿, keeps `touch-action: none` and `cursor: grab` in its CSS), then Move up, Move down and Remove. The sortable transform and transition stay inline. The suggestion and the eligible-album panel get section headings and `EmptyState`s.
- **Matchup screen**: two album cards side by side on desktop and stacked on phones, each with a large cover and a primary "I like this more" button; Tie and Skip as secondary buttons centered under them; Undo as a ghost button; the matchup count in muted text. The empty state keeps its "Back to home" link (a test checks it).
- **Import review**: each open item as a `Card` with the spreadsheet row (title, artist, year) at the top, candidates as `ListRow`s with their choose buttons, the search form, and Keep manual and Skip as secondary buttons. The counts line, notices and errors use `Message`.

## Phone and desktop

- Tested at 375px and 1280px. No horizontal page scroll at either width, no overlapping text, every control at least 44px.
- Long titles wrap (`overflow-wrap: anywhere` on title text) instead of pushing the layout wider.
- Hover styles only under `@media (hover: hover)`, so taps don't leave a stuck hover.
- Motion: only color and shadow transitions of 120ms on hover, focus and drag, turned off under `prefers-reduced-motion`.

## Tests

Per the repo's testing rule, no tests for styling itself. The existing unit tests and `e2e/search.spec.ts` must pass unchanged except where a page no longer renders its own `<main>` (none query it today). Two new checks guard the acceptance rules:

- **`lib/design-system.test.ts`** (one table-driven test): scans `app/` and `components/` `.tsx` and `.module.css` files and fails on a hex, `rgb(`, `hsl(` or named color outside `app/globals.css`, and on a `style={{` prop outside an allowlist of the dynamic cases (drag transform in `decade-list.tsx` and `year-screen.tsx`, `--cover-size` in `cover.tsx`).
- **`e2e/layout.spec.ts`**: visits `/`, `/search`, `/years`, `/years/2001`, `/decades`, `/decades/1990`, `/artists`, `/matchups` and `/import` at 375px and 1280px wide and checks that the page doesn't scroll sideways and that the header nav is present. These render with the empty e2e database; `/artists/[id]` needs data and is covered by the screenshot review instead.

## Review pass and screenshots

1. Before restyling, take "before" screenshots of every route at 375px and 1280px from a ticket preview (`npm run preview -- 31`, <http://localhost:4031>).
2. After, take "after" screenshots at both widths in light and dark, open each route, and fix what looks unfinished or inconsistent.
3. The preview database is seeded with made-up albums and artists (a throwaway seed script in the scratchpad, not committed), never a copy of the real data, because the repo is public and the screenshots go on the PR.
4. The screenshots go on an orphan branch, `feat/album-31-restyle-design-system-screenshots`, and the PR body links them by raw URL, so no images land in `main`'s history.
5. Screenshots are taken with Playwright from a script in the scratchpad (Chromium, the same one the e2e tests use).

## Leaves out

- New features, routes, or any change to data, ranking or Elo logic.
- A brand, logo or name change. The header shows the existing "Album ranker" text.
- A theme switch in the interface; the theme follows the system setting.
- Web fonts. The system font stack keeps the app offline-friendly and adds no download.
- Animations beyond hover, focus and drag feedback.
- Deploy (#14).

## Calls I made

- **The years page loses its "Back to home" link.** The new header links home on every page, so it was a duplicate. The matchup empty state keeps its own, since a test checks it and it reads as part of the message.
- **Screenshots live on a separate orphan branch** (`feat/album-31-restyle-design-system-screenshots`), linked from the PR, not committed to the feature branch. About 60 images (10 routes × 2 widths × before, after light, after dark) would otherwise land in `main` forever.
- **Screenshots use made-up data, not your real rankings.** The repo is public.
- **One PR for the whole ticket**, not one per step: a half-restyled app would look worse than either end.
- **Plain CSS with CSS Modules**, no Tailwind or other library.
- **Dark theme ships**, following the system setting, with no toggle.
- **System fonts**, no web font.
- **Indigo as the one accent color** on neutral greys. Starting values are in the tokens section; the build adjusts any that miss AA contrast.
- **All controls are 44px tall everywhere**, including the four buttons on each year-page album card, rather than a smaller desktop size. It makes the year cards a little taller on desktop.
- **Nav wraps onto a second row on phones** rather than collapsing into a menu button or scrolling sideways. Six short links fit in two rows at 375px and stay visible.
- **Content width 1040px**, wide enough for two or three year-page card columns.
- **A styled not-found page** (`app/not-found.tsx`) is added, since a bad decade or artist id shows it today and it would otherwise be the one unstyled page. It is a restyle, not a new route.
- **Two new guard tests** (the color and inline style scan, and the no-sideways-scroll e2e check) so the acceptance rules stay true after this ticket.
- **The home page becomes a grid of section cards** with the same link names, instead of a plain list of links.
