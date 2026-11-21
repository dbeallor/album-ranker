# ALBUM-31 restyle: implementation plan

Spec: [../specs/2026-11-21-album-31-restyle-design-system.md](../specs/2026-11-21-album-31-restyle-design-system.md). Verification after every task: `npm test && npm run lint && npm run typecheck`. Commit and push after each task. Read the Next.js CSS guide in `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md` first (the worktree has no node_modules; run `npm ci` first).

## Task 1: tokens, shell and shared components
- `app/globals.css` (tokens, dark theme, reset, base elements, focus ring), imported in `app/layout.tsx`.
- `components/ui/`: `SiteHeader`, `PageShell`, `PageHeader`, `Button`/`ButtonLink`, `TextField`, `Select`, `Card`, `ListRow`, `EmptyState`, `Message`, `Stack`, `Cluster`, `Table`, `Tabs`, each with a module CSS.
- `PageShell` used in `app/layout.tsx`; `app/not-found.tsx`.
- `lib/design-system.test.ts` guard (colors and inline styles), with the allowlist from the spec. It may be added in Task 3 once the scan can pass.
- Verify contrast ratios of the token pairs with a throwaway script; adjust tokens to meet AA.

## Task 2: routes
Restyle `/`, `/search`, `/years`, `/years/[year]`, `/decades`, `/decades/[decade]`, `/artists`, `/artists/[id]`, `/matchups`, `/import`. Remove each page's own `<main>` and inline layout styles. Keep link names and roles that tests query.

## Task 3: components
Restyle `cover`, `decade-list`, `import-review`, `matchup-screen`, `year-add-panel`, `year-screen`. Keep drag transforms inline only. Add the guard test and `e2e/layout.spec.ts`. Update `docs/stack.md` (Styling row, Turned down).

## Task 4: review pass
Preview with a throwaway made-up seed (not committed), screenshots before/after at 375 and 1280 in light and dark, fix anything inconsistent, run `npm run test:e2e`.
