# Decade top 25 lists: plan

**Spec:** [2026-11-21-album-9-decade-top-25.md](../specs/2026-11-21-album-9-decade-top-25.md) (approved)
**Ticket:** [ALBUM-9](https://github.com/dbeallor/album-ranker/issues/9)

Verification after every task: `npm test`, `npm run lint`, `npm run typecheck`. Tests run against in-memory databases (`lib/db/test-db.ts`), never `data/`. No migration. Read the Next.js guide in `node_modules/next/dist/docs/` before writing page code (AGENTS.md).

Reuse: `decadeOf`, `getDecadeList`, `setDecadeList`, `MAX_DECADE_LIST` in `lib/db/decade-lists.ts`; `loadRatings` in `lib/ratings.ts`; `listAllYearEntries`, `listAlbums`; the `Cover` component; the `/artists` page and `lib/matchups-service.ts` + `app/matchups/actions.ts` as patterns (service takes the database; thin server actions; `await connection()` in pages).

## Task 1: pure functions (`lib/decades.ts`, `lib/decades.test.ts`)

No database, React or `server-only` import. Table tests, one per rule in the spec § Tests (Pure functions).

- `suggestDecadeList(eligible: { albumId: number; rating: number }[]): number[]`: rating descending, ties to lower id, first 25.
- `moveInList(ids: number[], move)`: `move` is `{ kind: "drop", from, to } | { kind: "up", id } | { kind: "down", id } | { kind: "add", id } | { kind: "remove", id }`; returns the new order (up/down at the ends and a no-op add of an id already present return the list unchanged; add never exceeds 25, it returns the list unchanged).
- `decadeSummaries(...)`: picker rows `{ decade, listCount, eligibleCount }`, oldest first, for each decade with any year entry (any placement) or any list entry.

## Task 2: service (`lib/decade-service.ts`, `lib/decade-service.test.ts`)

`import "server-only"` only if the sibling services do. Takes `db`.

- `loadDecadePicker(db)`.
- `loadDecadeView(db, decade)`: `{ decade, list: Row[], suggestion: Row[] | null, panel: Row[], eligibleCount }`. `Row` = `{ albumId, title, artist, year (year page year), coverUrl, rating (rounded) }`. `suggestion` is non-null only when the list is empty. `panel` = eligible albums not on the list, rating descending, ties lower id. Nothing is written.
- `saveDecadeList(db, decade, albumIds: unknown)`: validates input (decade integer multiple of 10 in 1900 to 2100; array of at most 25 positive integers, no repeats), calls `setDecadeList`, maps `DataError` to `{ error: message }`, returns the new view or `{ error }`.
- `acceptSuggestion(db, decade, albumIds: unknown)`: same validation; stores nothing and returns `{ error: "This decade already has a list." }` plus the current view if the decade already has a list; otherwise saves the ids.
- Tests per spec § Tests (Service). Use `test-db.ts` helpers to seed albums and year entries.

## Task 3: routes and actions

- `app/decades/actions.ts`: `"use server"` wrappers `saveList` and `accept` over the service, using `getDb()`.
- `app/decades/page.tsx` (`/decades`): picker, per spec. Link from `app/page.tsx` ("Decade lists"), and update `app/page.test.tsx` if it asserts the link list.
- `app/decades/[decade]/page.tsx`: validates the param (`/^\d{4}$/`, multiple of 10, 1900 to 2100, else `notFound()`), loads the view, renders the client component with the actions; previous and next decade links; `await connection()`.

## Task 4: client component (`components/decade-list.tsx`, `components/decade-list.test.tsx`)

- Dependencies: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` (latest stable, pinned by `npm install`; keep the lockfile in the commit). `Cover` gets an optional `size` prop (default 125); at 80 px for rows. The placeholder uses the same size.
- Props: initial view, `saveAction`, `acceptAction`. State: last saved view and optimistic view; saves are serialised through a promise queue; on `{ error }` revert to the last saved view and show the error (role `alert`).
- Sortable list with `PointerSensor` (touch: delay 200 ms, tolerance 5), `KeyboardSensor` with `sortableKeyboardCoordinates`, a handle or whole row; every row also has "Move up", "Move down", "Remove" buttons. Drop uses `moveInList` with `{kind:"drop"}`.
- Panel with "Add" buttons (disabled at 25, with the spec's messages); suggestion mode (read only, "Accept suggestion"); empty-decade message; "N of 25".
- Component tests with the actions mocked: suggestion then Accept; move up and down; remove; add from the panel; Add disabled at 25; revert and message after a failed save. No drag simulation.

## Task 5: finish

- Update `docs/stack.md` (drag and drop row) if no other doc already lists `@dnd-kit`. Update README routes list if it has one.
- Run the full verification, then commit in small commits (`feat: ALBUM-9 ...`), push.
