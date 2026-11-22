# Modernize the design and trim the pages to the core experience

**Status:** Shipped
**Shipped:** in PR #51, with differences: [as-built](../as-built/2026-11-22-album-47-modernize-design.md)
**Date:** 2026-11-22
**Ticket:** [ALBUM-47](https://github.com/dbeallor/album-ranker/issues/47)
**Follows:** [restyle with one design system](2026-11-21-album-31-restyle-design-system.md), [library and analytics UI pass](2026-11-22-album-38-library-analytics-ui.md), [ranking progress](2026-11-22-album-42-ranking-progress.md). Where the ticket text and what shipped differ, what shipped wins.

## Goal

The app should look bold and artistic and read as one short flow: add albums, play matchups, read the rankings. Every page that stays is laid out around that flow. No new features and no change to ranking, Elo or matchup picking.

Direction comes from two reference sites (<https://www.ledboise.com/>, <https://wearedirect.co/>): very large sentence-case headlines, small uppercase numbered section labels (`01 / Add albums`), a short overlay menu in place of a long nav row, and image-led sections. Neither site's content, imagery or branding is copied.

## Pages: kept, merged, removed

This list goes into the PR description as written (updated if the build changes it).

| Page | Decision | Why |
|---|---|---|
| `/` home | **Kept, rebuilt.** The card menu goes; the page becomes the start of the flow (see § 3). | The cards only repeated the nav. The home page should show where you are in the flow and get you to the next step. |
| `/search` | **Kept**, retitled "Add albums". | It is step 1 of the flow. Merging it into `/library` would put two `q` meanings (catalog search and library filter) on one URL and rework the add action's redirects for little gain. |
| `/library` | **Kept.** | It is where you browse, sort and remove albums, and it is the target of "View library" after adding. |
| `/matchups` | **Kept**, retitled "Play". The route stays. | Step 2 of the flow. |
| `/analytics` | **Kept**, retitled "Rankings". The route stays. | Step 3 of the flow. "Rankings" is the word the ticket and the home page use. |
| `/artists/[id]` | **Kept**, not in the nav. | Library and Rankings link artist names to it; it is the only place an artist's albums are listed together. |
| `/import` | **Kept as a route, removed from the nav.** | It only matters while spreadsheet rows wait for review. The home page shows a link to it only then, as today. Removing the route would strand rows the import script still writes. |
| Library remove confirm (`/library/remove/[albumId]`) | Kept. | Part of the library. |

Routes keep their URLs, so no redirects are added. The nav becomes four entries in flow order: Add albums (`/search`), Library, Play (`/matchups`), Rankings (`/analytics`).

## What changes

### 1. Design tokens (`app/globals.css`)

Replace the neutral, small-type tokens with a bold set. `globals.css` stays the only file with raw colors.

- **Type.** Two families loaded with `next/font/google` in `app/layout.tsx` (self-hosted at build, no request to Google at run time) and exposed as CSS variables: a heavy grotesk for display (Archivo, using its width axis for expanded headlines) and a plain sans for body (Inter). The token names `--font-sans` and a new `--font-display` point at them, with the current system stack as fallback.
- **Scale.** Fluid sizes with `clamp()`: a display size for page titles up to about 6rem on desktop and about 2.75rem at 375px, a section-heading size, and the current body and small sizes. Headlines are sentence case, tight line height (about 1) and tight letter spacing. A new `--text-label` size and style for the small uppercase, letter-spaced section labels.
- **Color.** High contrast: near-black on warm off-white in light, warm off-white on near-black in dark, one vivid accent (a hot orange-red) used for the primary button, the current nav item and the section numbers, with a darker shade for accent text on light. Muted text, borders, danger and success keep their roles. Both themes follow `prefers-color-scheme` as today.
- **Shape and space.** Square-ish corners (small radius), more vertical space between sections, a wider content width for image rows, thin rule lines between sections instead of card shadows.
- **Motion.** Short fades and slides on the overlay menu and on hover only, all under the existing `prefers-reduced-motion` rule.

The implementer opens both reference sites in a browser before setting the final values (fonts, sizes, colors, spacing), since the ticket's fetch could not read their CSS. The choices above are the direction; exact values may move to match it.

### 2. Shared parts (`components/ui/*`)

- **Site header and overlay menu.** `SiteHeader` becomes a slim bar: the app name on the left and a "Menu" button on the right, at every width. The button opens a native `<dialog>` (`showModal()`) that fills the screen and lists the four nav entries as very large numbered links (`01 Add albums`, `02 Library`, `03 Play`, `04 Rankings`), each under a `<nav aria-label="Main">`. The current entry keeps `aria-current="page"`. Native `<dialog>` gives the focus trap and Escape to close; a "Close" button closes it too, choosing a link closes it, and focus returns to the Menu button. `NAV_ITEMS` stays exported with the new labels and order.
- **Page header.** `PageHeader` gains an optional numbered label (`label="01 / Add albums"`) above the title and renders the title in the display size. The description and actions slots stay.
- **Section label.** A small `SectionLabel` part (uppercase, numbered) for section headings inside a page, so the home page and the pages use the same style.
- **Buttons, fields, cards, tabs, tables, messages, empty states, progress.** Restyled through the new tokens: heavier type, square corners, accent primary button, underline-style text fields. Their props and markup stay, so pages and tests that use them keep working.
- **Removed:** `LinkCard` and its CSS module (only the home page used it). `CardGrid` stays (library and artist pages).

### 3. Home page (`app/page.tsx`)

The page is the flow in three numbered sections, each with one clear next step. All data comes from loaders that exist today.

- **Headline.** A very large sentence-case line ("Rank the albums you love." or similar) and the facts line already shipped in ALBUM-38 ("12 albums in your library · 340 matchups played", the empty-library sentence when empty).
- **Image strip.** A full-bleed row of library covers (up to eight, the top of the lifetime album ranking), when the library has any. Each cover keeps its usual alt text ("Cover of <title>").
- **`01 / Add albums`.** The catalog search box (a GET form to `/search?q=`, same field name and label as the search page) and a link to the library.
- **`02 / Play`.** The ranking progress (the existing `RankingProgress` part) and a primary link to `/matchups`. With fewer than two albums it says to add albums first, as the matchup screen does.
- **`03 / Rankings`.** The top five albums of the lifetime ranking with cover, title and artist, and a link to `/analytics`. With no albums this section is left out.
- **Import review.** When open items exist, a message linking to `/import` with the count, as today.

The home page keeps at least four internal `href="/..."` links, so `links.test.ts` keeps checking it.

### 4. Other page layouts

Same content and behavior, new layout:

- **Add albums (`/search`).** Numbered label, display title, the search box large and full width, results as a list of rows with bigger covers.
- **Library.** Display title with the count, the controls as today (sort and direction always shown, filters in `<details>`), albums as a cover-led grid with title, artist link and the rating line below each cover; year headings as section labels.
- **Play (`/matchups`).** The two albums side by side on desktop and stacked on a phone, with large covers and titles, so the choice is the page. Keyboard behavior of the matchup screen does not change.
- **Rankings (`/analytics`).** Display title, the progress, the two labelled tab rows, the tables. Rank numbers in the display face.
- **Artist and Import pages** pick up the new header and tokens; their layout is otherwise unchanged.
- **Not found** gets the display title.

### 5. Removed code and tests

- `components/ui/link-card.tsx`, `link-card.module.css`, and the home page tests that check the old cards.
- The Import entry in `NAV_ITEMS` and in `e2e/layout.spec.ts`'s expected nav links.

### 6. Checks

- `components/ui/links.test.ts` keeps passing: every nav item and every home page link has a route.
- `lib/design-system.test.ts` keeps passing (no raw colors outside `globals.css`, no new inline styles).
- New table-driven test of text contrast: for each text and background token pair (text on bg, muted on bg, text on surface, accent text on accent, accent on bg) in both themes, the WCAG contrast ratio parsed from `globals.css` is at least 4.5:1.
- A component test of the overlay menu: it opens from the Menu button, lists the four links with the current one marked, and closes on Close.
- Page tests updated for the new titles (Add albums, Play, Rankings) and the new home sections (empty library, one album, many albums, open import items).
- `e2e/layout.spec.ts`: the nav check opens the menu first and expects the four new entries; routes still checked for no sideways scroll at phone and desktop widths. `e2e/flow.spec.ts` follows the new titles and goes through the menu.
- `npm test`, `npm run lint`, `npm run typecheck` and `npm run test:e2e` pass.

## Proof

Screenshots at 375px and 1280px in light and dark of home (empty and with data), the open menu, Add albums with results, Library, Play and Rankings, taken on a ticket preview (`npm run preview -- 47`, <http://localhost:4047>) over a throwaway database filled through the app, never the real one. Before-and-after pairs for home and one other page.

## Leaves out

- New features, filters or data on any page beyond rearranging what exists (the home page's top five and cover strip reuse the lifetime ranking already computed for `/analytics`).
- Changes to ranking, Elo, matchup picking, the import script or the add action.
- URL changes or redirects.
- Copying either reference site's content, imagery, logo or branding.
- A theme toggle; themes still follow the system setting.
- Deploy work (#14).

## Calls I made

- **No page is deleted outright.** Search and Library stay separate routes, Import stays as a route but leaves the nav, and the home card menu is the only thing removed. Merging Search into Library would clash on the `q` parameter and touch the add action; dropping `/import` would strand rows the import script writes.
- **Matchups and Analytics are renamed in the UI to "Play" and "Rankings"**, and Search to "Add albums", with routes unchanged. The ticket describes the flow as "add albums, play matchups, read the rankings".
- **The home page becomes the flow's start** with a search box, the progress and a top-five preview, instead of a nav-like card menu. This is new layout on existing data, not a new feature.
- **The overlay menu is used at every width**, not only on phones, matching the references' short menu. It is a native `<dialog>`, for focus trapping and Escape without a library.
- **Fonts are Archivo (display) and Inter (body) via `next/font/google`.** Both are open licensed and self-hosted at build. Final values may move after the implementer views the reference sites in a browser.
- **One vivid orange-red accent on near-black and off-white**, in both themes. The exact shades are set so every text pair passes 4.5:1.
- **A contrast test is added** to back the "text stays readable in both themes" acceptance line, since it is a rule that can break silently when tokens change.
- **The home image strip shows up to eight covers** from the top of the lifetime ranking, each with its normal alt text, while section 03 lists the top five.
- **`LinkCard` is deleted** since nothing else uses it; `CardGrid` stays.
