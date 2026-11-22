# As-built: Show the pages as links in the top bar

**Shipped:** in PR #56
**Ticket:** ALBUM-54
**Spec:** [2026-11-22-album-54-top-bar-links.md](../specs/2026-11-22-album-54-top-bar-links.md)

## Differs from the spec

- The spec says the links keep the global focus ring unchanged. Below 640 px the link row scrolls sideways, which would clip a ring drawn outside the link, so there the links use an inward `outline-offset`. From 640 px up the global ring applies.
- The e2e helper `e2e/menu.ts` (`goViaMenu`) became `e2e/nav.ts` (`goViaNav`), and `README.md` now describes the header links instead of the Menu.
- `--color-backdrop` is removed from `app/globals.css` (light and dark), since the dialog's `::backdrop` was its only use.
