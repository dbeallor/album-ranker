# ALBUM-47 plan: modernize the design and trim the pages

Spec: [2026-11-22-album-47-modernize-design.md](../specs/2026-11-22-album-47-modernize-design.md). The spec decides what to build; this plan only orders the work.

Rules for every task: this is not the Next.js you know, so read the relevant guide in `node_modules/next/dist/docs/` before using `next/font` or any Next API. Raw colors only in `app/globals.css`. No inline styles beyond the existing allowlist. Run `npm test`, `npm run lint`, `npm run typecheck` before each commit. Tests follow the spec's § Checks: no tests for styling.

## Task 1: tokens, fonts, shared parts, menu

- Open <https://www.ledboise.com/> and <https://wearedirect.co/> in a browser (preview tools) to see type, color, spacing and motion, then set the final token values in `app/globals.css` (spec § 1). Light and dark themes.
- Load Archivo (display) and Inter (body) with `next/font/google` in `app/layout.tsx`; wire `--font-display` and `--font-sans`.
- Restyle `components/ui/*.module.css` through the tokens. Add the optional `label` to `PageHeader` and a `SectionLabel` part. Delete `LinkCard` (files and the home page's use comes out in Task 2).
- Rebuild `SiteHeader`: Menu button plus native `<dialog>` overlay with four numbered links; `NAV_ITEMS` becomes Add albums `/search`, Library `/library`, Play `/matchups`, Rankings `/analytics`.
- Tests: table-driven contrast test over the token pairs in both themes (parsed from `globals.css`), and a component test of the menu (opens, four links, current marked, closes).
- Commit and push.

## Task 2: home page and page layouts

- Rebuild `app/page.tsx` per spec § 3 using existing loaders (`listLibrary`, `countMatchups`, `loadAnalytics` or the lifetime album ranking, `listImportReviewItems`, `RankingProgress`). Keep at least four internal `href="/..."` links so `links.test.ts` still guards it.
- Apply spec § 4 to Add albums, Library, Play (matchup screen layout), Rankings, artist, import and not-found: new titles, numbered labels, display type, cover-led layouts. Behavior, form names, labels and keyboard handling of the matchup screen stay as they are.
- Update the page and component tests for the new titles and home sections (empty library, one album, many albums, open import items).
- Commit and push.

## Task 3: e2e, preview and cleanup

- Update `e2e/layout.spec.ts` (open the menu, four entries) and `e2e/flow.spec.ts` (new titles, go through the menu). Run `npm run test:e2e`.
- Run a ticket preview (`npm run preview -- 47`, throwaway database only), take screenshots at 375px and 1280px in light and dark for the spec's Proof list, save them under the scratchpad (not the repo), and check contrast and focus by eye. Fix what looks wrong.
- Remove any dead CSS or code from cut parts. Confirm `npm test`, `npm run lint`, `npm run typecheck`, `npm run test:e2e` pass.
- Commit and push.
