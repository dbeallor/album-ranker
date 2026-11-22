# ALBUM-48 album art fallback: plan

Spec: [2026-11-22-album-48-album-art-fallback.md](../specs/2026-11-22-album-48-album-art-fallback.md). Test command: `npm test && npm run lint && npm run typecheck`.

1. `lib/catalog/cover-art.ts` + `cover-art.test.ts`: `normalizeForMatch`, `createResolveCover({ fetch, userAgent?, log? })` per spec (CAA HEAD, Deezer search, close match, CDN host check). Write the tests first. Keep it importable from `scripts/import.ts` (relative `.ts` imports, no `server-only`, as `lib/import/*` does).
2. `lib/library-service.ts`: replace the prefix check with a `URL`-parsed host allow-list (`coverartarchive.org`, `cdn-images.dzcdn.net`, `e-cdns-images.dzcdn.net`, https only); extend `lib/library-service.test.ts`.
3. `app/search/actions.ts` and `app/import/actions.ts`: resolve the cover server-side (skip when the album already exists by catalog id) and pass it on; ignore the browser's `coverUrl`.
4. `lib/import/run.ts` + `scripts/import.ts`: optional `RunDeps.resolveCover`, applied to accepted rows whose album isn't stored; extend `run.test.ts`.
5. Update the `components/cover.tsx` comment. Run the full test, lint and typecheck commands.
