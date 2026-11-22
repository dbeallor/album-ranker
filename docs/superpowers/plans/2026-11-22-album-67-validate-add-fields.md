# ALBUM-67 validate add and import form fields: plan

Spec: [2026-11-22-album-67-validate-add-fields.md](../specs/2026-11-22-album-67-validate-add-fields.md)

Test command: `npm test`; also `npm run lint` and `npm run typecheck`. The worktree may need `npm install` first.

1. `lib/library-service.ts`: export `validateCatalogAlbum` (catalog id, artist id, title, artist, release year; returns cleaned values or the first message) and `validateLibraryYear`. `addCatalogAlbumToLibrary` uses them, with the same messages. Table-driven test in `lib/library-service.test.ts`.
2. `lib/import/resolve.ts`: lower-case the catalog id before `findAlbumByCatalogId` and when creating. Test in `resolve.test.ts`.
3. `app/import/actions.ts`: `candidateFrom` validates through `validateCatalogAlbum` and returns the message; `chooseAlbumAction` fails with it, no cover lookup. Tests in `actions.test.ts` (bad fields, no `resolveCover` call, upper-case id reuses the stored row).
4. `app/search/actions.ts`: validate first (year and album), look up the cover only for a valid, not-yet-stored album with the cleaned values. Tests in `actions.test.ts` (failing forms never call `resolveCover`).
5. `lib/catalog/cover-art.ts`, `lib/catalog/server-cover.ts`: pacing queue for `createResolveCover` (1100 ms gap, `now` and `sleep` deps, skip with null when the wait is over 5 s). Tests in `cover-art.test.ts`.
