# ALBUM-78 faster matchup covers: plan

Spec: `docs/superpowers/specs/2026-11-22-album-78-faster-matchup-covers.md` (approved).

## Task 1: service predicts the next pairs (`lib/matchups-service.ts`, `lib/ratings.ts`)
- `MatchupView` gains `seed: number` (Math.random() drawn when the view is built) and `upcoming: string[]`.
- `upcoming`: deduplicated non-null cover URLs, minus the current pair's own, of the pair served after answer a / b / tie (replay with a hypothetical newest matchup appended, `random = () => seed`), after a skip (current pair added to avoid), and the pair an undo would serve (newest stored matchup's albums). Empty when there is no pair.
- `answerMatchup`, `skipMatchup`, `undoMatchup` take a `seed` argument (after `avoid`, before the injectable `random`); use `() => seed` as random when it is a finite number in [0, 1), else the injected random. Same stored matchups + same avoid + same seed must serve the predicted pair.
- Add an exported service function that builds the first view (used by `app/matchups/page.tsx` instead of calling `loadMatchupState` directly).
- Tests: `lib/matchups-service.test.ts`, one table-driven test (answer a/b/tie, skip, undo: `upcoming` contains the covers of the pair that action then serves with the view's seed), plus rows for invalid seed falling back without error and null covers left out.

## Task 2: actions and page (`app/matchups/actions.ts`, `app/matchups/page.tsx`)
- Actions take and pass `seed`. Page builds the initial view through the service function.

## Task 3: Cover priority (`components/cover.tsx`)
- Optional `priority` prop: `loading="eager"` and `fetchPriority="high"`; default stays `loading="lazy"`.

## Task 4: screen prefetch (`components/matchup-screen.tsx`)
- Action prop types gain `seed`; each call passes `view.seed`.
- Effect on `view.upcoming`: `new Image()` with `src` per URL, held in a ref until the next view; skip URLs already prefetched.
- `AlbumPick` passes `priority` to `Cover`.
- Tests in `components/matchup-screen.test.tsx` (existing fixtures need `seed`/`upcoming`): with `Image` stubbed, initial and post-answer `upcoming` are prefetched; the view's seed is passed to each action; matchup covers render `loading="eager"` (use a card with a coverUrl).

## Verify
`npm test`, `npm run lint`, `npm run typecheck` all green. Fix any other caller of the changed signatures (grep `MatchupView`, `answerMatchup`, e2e stubs).
