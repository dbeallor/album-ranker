# Show the pages as links in the top bar

**Status:** Shipped
**Shipped:** in PR #56, with differences: [as-built](../as-built/2026-11-22-album-54-top-bar-links.md)
**Date:** 2026-11-22
**Ticket:** [ALBUM-54](https://github.com/dbeallor/album-ranker/issues/54)
**Follows:** [ALBUM-47 modernize the design](2026-11-22-album-47-modernize-design.md)

## Goal

Today the four pages (Add albums, Library, Play, Rankings) are only reachable through the Menu button, which opens a full-screen dialog, so every page change takes two clicks. Put the four links in the top bar so every page is one click away, and remove the Menu button and dialog.

## How it works

`components/ui/site-header.tsx` (`SiteHeader`) renders:

```
<header>
  <div class=inner>
    <Link href="/">Album ranker</Link>
    <nav aria-label="Main">
      <ul> one <li><Link> per NAV_ITEMS entry </ul>
    </nav>
  </div>
</header>
```

- `NAV_ITEMS` stays as it is (same order, labels and hrefs), so `links.test.ts` keeps checking every link has a route.
- The link for the section you are in gets `aria-current="page"`, using the existing `isCurrent` (exact match or a sub-path, so `/matchups/42` marks Play).
- The `<dialog>`, the Menu and Close buttons, the `useRef`/`useEffect` that closed the dialog on route change, and their CSS (`.toggle`, `.dialog`, `.dialogBar`, `.number`, the `menu-in` keyframes and the `html:has(dialog[open])` scroll lock) are deleted. The component stays a client component because `usePathname` needs it.
- The numbered "01 02 03 04" prefixes go with the dialog; the bar shows the labels only.

## Look

Uses only existing tokens in `app/globals.css`; no new colours, type sizes or spacing values.

- **Links:** label type, as the Menu button had it: `--text-label`, `--weight-bold`, `--tracking-label`, upper case, `--color-text`, no underline. Each link is at least `--control-height` tall (44 px tap target) with `--space-3` padding each side.
- **Current page:** `--color-accent` text and a 2 px accent bar along the bottom of the link (`box-shadow: inset 0 -2px 0 var(--color-accent)`), so it is marked by more than colour.
- **Hover** (on `hover: hover` devices only, like the rest of the app): `--color-accent` text.
- **Keyboard:** the links are plain `<a>` elements, so Tab reaches them in order after the brand and they get the global `a:focus-visible` ring unchanged.
- **Desktop (640 px and up):** one row, brand on the left, the four links on the right, same `--header-height` bar as today.
- **Phones (below 640 px):** two rows. The brand on the first row, the four links on a second row spread across the full width (`justify-content: space-between`). If a very narrow screen can't fit them, the row scrolls sideways (`overflow-x: auto`) rather than wrapping or hiding links. `--header-height` is redefined in `globals.css` under `max-width: 639px` to the two-row height, so `scroll-padding-top` still keeps focused controls out from under the sticky header.

## Tests

`components/ui/site-header.test.tsx` is updated (one test, per `AGENTS.md` § Testing; no tests for styling):

- Rendered at `/matchups/42`, the `Main` navigation holds four links with the `NAV_ITEMS` hrefs in order, visible without clicking anything, only `/matchups` has `aria-current="page"`, and there is no `Menu` button.

The jsdom `showModal`/`close` stubs are removed with the dialog.

## Non-goals

- Adding, renaming or reordering pages.
- Changing colours, type or spacing anywhere else in the design system.
- A hamburger or collapsed menu at any screen size.

## Calls I made

- **No Menu button at any width, phones included.** The ticket says to remove the dialog "when the links fit in the bar". Four short labels fit on a second row even on a 320 px screen, so the dialog goes entirely instead of living on as a phone-only menu. A sideways-scrolling row is the fallback if it ever doesn't fit.
- **Phones get a two-row header** (brand, then links), which makes the sticky header taller on phones (about 3.5 rem plus 44 px). Squeezing brand and four links into one 320 px row would mean tiny tap targets.
- **The "01 02…" numbers are dropped.** They were part of the big full-screen menu's look; in a compact bar they add width without helping.
- **Current page marked by accent colour plus a 2 px underline bar**, not colour alone, so it reads for colour-blind users too.
- **The nav list becomes a `<ul>`**, not the dialog's `<ol>`: the bar doesn't show numbers, so order isn't announced as meaningful.
