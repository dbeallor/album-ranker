# ALBUM-54 top bar links: plan

Spec: [2026-11-22-album-54-top-bar-links.md](../specs/2026-11-22-album-54-top-bar-links.md). Test, lint and typecheck: `npm test`, `npm run lint`, `npm run typecheck`.

## Task 1: header as a link bar

Files: `components/ui/site-header.tsx`, `components/ui/site-header.module.css`, `app/globals.css` (`--header-height` under `max-width: 639px`), `components/ui/site-header.test.tsx`.

Acceptance: the spec's How it works, Look and Tests. Dialog, Menu/Close buttons, `useRef`/`useEffect` and their CSS are gone; `NAV_ITEMS` and `links.test.ts` untouched.

## Task 2: docs

Grep README and `docs/` for "Menu" mentions of the nav; as-built per open-pr closeout.
