# Smarter import matching and a dependable import review page

**Status:** Draft
**Date:** 2026-11-22
**Ticket:** [ALBUM-49](https://github.com/dbeallor/album-ranker/issues/49)
**Follows:** [ALBUM-5 catalog search](2026-11-21-album-5-catalog-search.md)
**Related:** [ALBUM-47](https://github.com/dbeallor/album-ranker/issues/47) (site redesign; not part of this ticket)

## Goal

Fewer spreadsheet rows should end up in review, and working through the rows that do should take one click per decision. Four parts: fix the review buttons that look like they did nothing, use the sheet year when ranking and choosing, retry with simpler searches when the full one finds nothing, and auto-accept close matches when that is safe.

## 1. Review clicks that look like they did nothing

### What the recordings show

Both recorded sessions follow the same pattern (first session seq 86 to 109, second seq 272 to 342):

| Page the click was on | Navigation after the action | Page updates? |
|---|---|---|
| `/import?q=...` or `/import?error=...` | `push` to `/import` | yes |
| `/import` | `replace` to `/import` (same URL) | **no**: the handled item stays on screen |

The user then clicks the same button again, the item is no longer open, and the action fails with "This item is already resolved." All 11 errors in the two sessions come right after a same-URL `replace`. Skip fails the same way.

**Cause:** each action ends with `redirect("/import")`. When the page is already on `/import`, the router treats this as a replace to the current URL and the page keeps the tree it already has, so the item that was just handled stays on screen. Nothing on the page shows that the action worked, so the user clicks again. The build reproduces this first (a browser test that clicks "Use this album" twice on `/import`) and confirms the cause before the fix lands. If the cause turns out to be different, the fix below still applies, and the as-built says what the cause was.

### Fix

- **Refresh, and land on a new URL.** On success every action calls `refresh()` from `next/cache` (see `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md` § Refresh data), then redirects to `/import?done=<itemId>#item-<nextOpenItemId>`. The `done` parameter makes each action's URL different from the page it came from, and the page shows what happened (below). The fragment scrolls to the next open item, the one now in the handled item's place. With no open item left, there is no fragment.
- **Say what happened.** With `done=<id>`, the page shows a `role="status"` message at the top: "Added *Title* (year) to your library.", "Moved *Title* to year." or "Skipped *Title*.", followed by "*N* left." The message comes from the item's stored status and resolved album, so a reload shows the same text.
- **Pending state.** The review card becomes a small client component. While any of its forms is submitting, every button in that card is disabled and shows "Working..." on the clicked one (`useFormStatus` inside each form, plus a card-level flag set when one of its forms submits). A second click while the first runs does nothing.
- **A second click is harmless.** When `openItem` fails with `not_open`, the actions treat it as done: they refresh and redirect to `?done=<id>` like a success. The status message then reads "*Title* was already handled." (info tone, not error). `not_found`, `album_in_library` and `invalid` stay errors, as today.

## 2. Matching: score candidates, use the year

`chooseMatch` in `lib/import/match.ts` scores each search result against the sheet row instead of requiring an exact match.

### How a result is scored

Each field gets a grade:

| Grade | Title | Artist |
|---|---|---|
| `exact` | normalized texts equal (`normalizeText`, unchanged) | normalized texts equal |
| `close` | one is the other plus trailing words after a dash, colon or slash (catalog "Getz/Gilberto" vs a longer sheet title, or the other way); or edit distance 1 when both are at least 5 letters ("Meet the Tempations" vs "Meet the Temptations") | the shorter name's words are all in the longer one ("Bill Evans" vs "Bill Evans Trio", "Stan Getz" vs "Stan Getz & João Gilberto"); or edit distance 1 when both are at least 5 letters |
| `none` | anything else | anything else |

Year fit is `|result year - sheet year|`, with an unknown year treated as farther than any known one.

**Ranking order** (used for the stored candidates and for the review page's candidate and search result lists): grade points first (`exact` 2, `close` 1, `none` 0, summed over title and artist), then year fit, then the catalog's order.

### What the import decides

| Results | Outcome |
|---|---|
| Exactly one `exact`/`exact` result | accepted (as today, whatever the year) |
| Several `exact`/`exact` results, exactly one within 1 year | accepted (as today) |
| Several `exact`/`exact` results otherwise | `ambiguous`, listed in ranking order |
| No `exact`/`exact`; exactly one result with both fields `exact` or `close`, and its year is within 1 of the sheet's | **accepted** (new) |
| No `exact`/`exact`; anything else | `no_match`, the top 5 in ranking order (today: the first 5 in the catalog's order) |

A close match with the wrong year, or two close matches, still goes to review. A `none` grade on either field never auto-accepts.

The review page re-ranks stored candidates when it renders, so rows already in review from earlier imports get the new order too.

## 3. Search: a fallback ladder

### Query fixes in `buildQuery`

Words that are only punctuation (`&`, `-`, `/`, `+`) are dropped. Today they become escaped search terms that no album or artist contains, so a query like "Getz/Gilberto Stan Getz & Joao Gilberto" finds nothing. A `/` inside a word splits it ("Getz/Gilberto" becomes "Getz Gilberto").

### Structured queries

`CatalogSearch` takes a `CatalogQuery` instead of a string:

```ts
type CatalogQuery =
  | { kind: "text"; text: string } // today's query: every word in the title or the artist
  | { kind: "fields"; title?: string; artist?: string };
```

A `fields` query in MusicBrainz Lucene syntax: every title word must match `releasegroup` and at least one artist word must match `artist`. Words of 5 or more letters match with edit distance 1 (`word~1`). The search cache keys on the serialized query.

### The ladder

The import tries these in order and stops at the first step that gives a usable result (both fields `exact` or `close`). It then chooses over all results gathered so far, deduped by catalog id.

1. `text`: "<album> <artist>" (today's query, with the fixes above).
2. `fields` with title and artist: handles a typo, and extra artist words such as "Trio" or a collaborator.
3. `fields` with the title only, keeping results whose artist is `exact` or `close`.
4. `fields` with the artist only, keeping results whose title is `exact` or `close`.

Each step is one rate-limited request (about 1.1 seconds), so a row that never matches costs 4 requests instead of 1. Rows that match on step 1 cost what they cost today.

On the review page, the search box runs the same ladder when its text is still the default query. For text the user typed, it runs that text as a `text` query and, if it finds nothing, a `fields` query with the text as the title. Results are listed in ranking order against the row.

## 4. Review page polish

Judged against the recordings, where the user scrolled, retyped searches and could not tell what had worked:

- **Status message and count** after each action (part 1).
- **Scroll to the next item** after each action, and after a search (the search form's action gets `#item-<id>`, so the page reloads with the searched item in view, not at the top).
- **Year next to the sheet's year.** Each candidate and search result shows its year, and when it differs from the sheet's year by more than 1, a note such as "Sheet says 1964, 3 years off". An unknown year reads "Unknown year".
- **Better default search.** The search box starts with "<album> <artist>" as today, but because the default runs the ladder, the user's usual edits (drop the artist, drop "Trio") are no longer needed.
- **Header count.** The page title area shows "*N* left" next to the existing open, resolved and skipped counts.
- The review card uses the shared UI parts (`Card`, `ListRow`, `Button`, `Message`), as now.

Not used: keyboard shortcuts, batch accept, and searching as you type. They are bigger changes than the recordings call for.

## Tests

One table-driven test per rule, using `catalogAlbum` and a fake search in `lib/import/test-support.ts`, never the live catalog.

- `lib/import/match.test.ts`: the grade table, the ranking order, and the outcome table, including the year deciding between candidates when no title and artist match exactly, a close match with the wrong year going to review, and two close matches going to review.
- `lib/import/match.test.ts`: the ladder, with fixtures from the recordings: "Portraits in Jazz" by "Bill Evans Trio" (extra artist word), "Meet the Tempations" by "The Temptations" (typo), "Procol Harum" by "Procol Harum" (title equals artist, several albums, the year decides), "Getz/Gilberto" by "Stan Getz & Joao Gilberto" (punctuation and accents). The fake search implements `text` and `fields` queries over a small catalog, with edit distance 1 for words of 5 or more letters.
- `lib/catalog/search.test.ts`: `buildQuery` drops punctuation-only words and splits on `/`; `fields` queries build the expected Lucene string; the cache keys on the query kind.
- `lib/import/run.test.ts`: a run that needs the fallback imports the row, and a doubtful row still goes to review.
- `app/import/actions.test.ts`: success redirects to `?done=<id>#item-<next>`; a second submit on the same item (double submit) redirects to `?done=<id>` without an error and changes nothing.
- `app/import/page.test.tsx`: the `done` status message for each outcome, including "already handled"; candidates listed in ranking order; the year note.
- A browser test (`npm run test:e2e`) that clicks "Use this album" on `/import`, sees the item leave and the status message appear, and that a fast second click shows no error. This is the reproduction from part 1.

## Leaves out

- Re-matching items already open in review from an earlier import. They get the new ranking on the page, but the import does not re-run their search or auto-accept them.
- A different spreadsheet format, or the rank and placement columns (unused).
- Changing the catalog source, its rate limit or its cache, beyond keying the cache on the structured query.
- The wider site redesign (#47).

## Calls I made

- **Rows already in review are not re-matched.** Re-running the import skips them, as today. Re-matching them would need the import to resolve review items itself; that is a separate ticket if wanted.
- **An exact title and artist match is still accepted whatever its year**, as today. MusicBrainz gives the first release date, which can differ from the year in the sheet, and tightening this would send many good rows to review.
- **A close match is auto-accepted only within 1 year**, and only when it is the only close candidate.
- **"Close" means a trailing subtitle, an artist name contained in the other, or one-letter edit distance** on words of 5 or more letters. Nothing looser, such as word reordering or two typos, auto-accepts; those rows still reach review, ranked.
- **Up to 4 catalog requests per unmatched row.** The import is slower for rows that don't match, in exchange for fewer rows in review.
- **The fix for the dead clicks uses `refresh()` plus a `done` URL**, rather than turning the actions into client calls with `useActionState`. That keeps the forms working without JavaScript and keeps the result on a reloadable URL.
- **A second click on a handled item shows an info message**, not nothing, so the user knows the first click worked.
- **Polish used:** status message, count left, scroll to the next item, year note, ladder behind the default search. **Not used:** keyboard shortcuts, batch accept, search as you type.
- **The ladder also runs in the review page's search box** for the default query, and a single title-only retry for typed text.
