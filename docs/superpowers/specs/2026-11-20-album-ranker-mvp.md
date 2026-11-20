# Album ranker MVP: requirements

**Status:** Draft
**Date:** 2026-11-20
**Ticket:** [ALBUM-2](https://github.com/dbeallor/album-ranker/issues/2), epic [#11](https://github.com/dbeallor/album-ranker/issues/11)

## Goal

Replace the `Best Albums.xlsx` spreadsheet with a web app where the user:

- searches an album catalog and adds albums to a year,
- ranks each year's favourites by dragging cover art,
- answers head-to-head matchups ("which of these two do you like more?") that build one Elo rating per album across all years,
- sees artist rankings (overall and per decade) and decade top 25 lists built from those ratings,
- imports the spreadsheet once, so nothing is retyped.

This spec is the requirements for the build tickets #3 to #10. It contains no code.

## What the spreadsheet actually does

The ticket's description came from a values-only export. The attached workbook still has its formulas and pivot tables, and they correct several of its assumptions. Counts below are from the Albums sheet. The import (#10) depends on these facts; the scoring rule is replaced (§ Scoring).

**Rows.** 752 album rows, years 1955 to 2024 (56 distinct years), 391 artists. Each row is one of:

| Row kind | Count |
|---|---|
| Ranked (rank 1 to 10) | 292 |
| Honorable mention | 378 |
| Ranked and flagged honorable mention | 1 (a 2014 row, rank 5); the sheet's formula scores it as an honorable mention |
| Listed only: no rank, no honorable mention | 81 |

The ticket's "about 674" counted ranked plus honorable mentions and missed the 81 listed-only rows. Its "754" counted rows with any value. Listed-only rows sit mostly in 1960 to 1981. One pair (a 1960 album) is an exact duplicate row, both listed-only.

**Ranks per year.** Only 11 years (2014 to 2024) use all ten ranks. 33 years stop at rank 5, 11 years stop at rank 1 to 3, and 1996 has no ranked album.

**Scoring today.** Rank 1 to 10 earns 10 to 1 points, an honorable mention 0.25. Each row is multiplied by `(N / maxN) ^ (1/4)`, where `N` counts every row in the year (listed-only rows included) and `maxN` is 41. That formula is in the sheet, not a fit. The Artist Stats pivots sum **unweighted** points in four decade groups (1960s and 1970s; 1980s; 1990s and 2000s; 2010s and 2020s; the 1950s are in none). The Weighted Score pivot sums weighted score per artist over all years.

**Decade top 25.** 75 albums carry a decade rank: 25 each for the 1960s, 2000s and 2010s, typed by hand. The candidate flag is not used consistently: none of the 2000s ranked albums is flagged, and 7 of the 75 are honorable mentions.

**Other columns.** `New` marks 24 rows, all in 2023. `DecadeRank` and the leading `Rank` column are derived labels.

## Users and shape

- **One user, no accounts.** The app is for the person who keeps the spreadsheet.
- **Web app with a small server.** The catalog source may need an API key, and #5 requires calling it from server code. A server also holds the data, so a phone and a laptop see the same rankings once it is deployed.
- **Data in one SQLite file** on the server. One user and about a thousand albums need no database server. Backup is copying the file.
- **Runs on localhost for the MVP.** Deploying it (and a password in front of it) is a follow-up ticket. Config comes from environment variables, so deploying later needs no rework.
- The stack itself is #3's call.

## MVP features

1. **Catalog search with cover art (#5).** Free text search by title and artist. Results show cover, title, artist and original release year. Missing covers show a placeholder.
2. **Year ranking screen (#6).** One page per year with three areas:
   - ten ordered rank slots,
   - an unordered honorable mention area,
   - an unordered **listed** area for albums the user heard that year but did not place (the spreadsheet's 81 listed-only rows).

   Each album shows its current rating. Add from search into any area, drag to reorder or move between areas, remove. Keyboard and touch work too. A year with fewer than ten ranked albums shows the empty slots.
3. **Matchup screen (#7).** Two album covers side by side. The user picks one, calls it a tie, or skips. Undo takes back the last answer. Each answer updates the ratings straight away. A counter shows matchups played.
4. **Artist views (#8).** An overall artist list and a per-decade list (1950s to 2020s, one decade at a time), each with rank, artist, score and album count. Opening an artist shows their albums with cover, year, placement and rating.
5. **Decade top 25 (#9).** One hand-ranked list per decade, with a suggestion from the ratings (see below).
6. **Spreadsheet import (#10).** A one-off import of the Albums sheet with a review step for rows it can't match.

## Albums versus releases

- **An album is the catalog's release group**, not a pressing or edition (MusicBrainz "release group", Discogs "master", or the nearest equivalent in the source #5 picks). Reissues, remasters and deluxe editions are the same album and cannot be added separately.
- **The year comes from the user.** Adding an album to a year page puts it in that year. The catalog's original release year is shown and is the default when an imported row or search result has no year.
- **One album, one year.** An album can be on at most one year page. Adding it to a second year asks to move it.
- **Compilations, live albums and soundtracks** are albums like any other if the catalog has them.
- **Missing from the catalog:** the user creates a manual album (title, artist, year) with the placeholder cover. A manual album can be linked to a catalog album later, which keeps its placement, matchups and rating and fills in the cover.
- **Artists are the catalog's credited artist.** A collaboration ("Stan Getz & João Gilberto") is one artist, as in the spreadsheet.

## Scoring: head-to-head Elo

The user chose one algorithm: Elo ratings from head-to-head matchups. There is no spreadsheet scoring rule in the app, no points table, no year weight and no way to plug in another algorithm.

### Why it fixes the spreadsheet's problems

- No hand-set weights: the points table, the 0.25 honorable mention value and the 1/4 exponent all go.
- No year weight, so a #1 in a small year is not capped below a #1 in a big year.
- Matchups across years compare albums from different years directly, which the yearly ranks can't.
- Gaps between albums come from the user's answers, not from linear points.

### Ratings

- Every album with a ranked or honorable mention placement has a rating. Listed albums have none and are left out of matchups, artist lists and decade suggestions.
- Standard Elo. Every album starts at 1500. For a matchup between A and B, `expected_A = 1 / (1 + 10 ^ ((rating_B - rating_A) / 400))`, and `rating_A += K × (score_A - expected_A)`, where `score_A` is 1 for a win, 0.5 for a tie and 0 for a loss. B moves by the same amount the other way. `K = 32`.
- These constants are fixed in code. There is no scoring settings screen.
- **Ratings are computed, not stored.** The app stores the inputs (year placements and matchup answers) and computes ratings by replaying them in a fixed order. Undoing an answer or changing a year's ranking just changes the inputs. Replaying a thousand albums and a few thousand answers takes milliseconds; caching is the build's call.

### Seeding from the yearly ranks

Without seeding, every album sits at 1500 until hundreds of matchups are played. The yearly ranks are already head-to-head answers inside each year, so the replay starts with them:

- Within a year, each ranked album beats every album ranked below it, and every ranked album beats every honorable mention. Honorable mentions don't play each other. Listed albums don't play.
- These **implied results** are replayed first, year by year in ascending order, higher ranks first. The user's explicit matchup answers are replayed after them, oldest first.
- Implied results are not stored. They are derived from the current year placements on every replay, so editing a year re-seeds it.

**Known limit.** Seeding alone rewards big years: a #1 that beats 40 albums in 2019 ends higher than a #1 that beats no one in 1983. That is the same bias as the year weight, and only cross-year matchups remove it. The matchup screen serves those first (below). Until enough are played, the artist and decade lists still favour big years. The matchup counter tells the user how far along they are.

### Picking matchups

- Only albums from different years. The year ranking already settles pairs within a year.
- First pick the album with the fewest explicit matchups (random among ties), then the opponent from another year whose rating is closest to it, skipping a pair already played.
- A skip records nothing and serves the next pair.
- Rough scale: about ten explicit matchups per album is ~3,400 answers in total. A sitting of 50 takes a few minutes.

### Artist score

An artist's score is the average rating of their rated albums, counted as if they had one extra album at 1500: `(sum of ratings + 1500) / (album count + 1)`. A sum would reward volume, as the spreadsheet's does (The Beatles: 13 rows, 81.3 weighted points, almost twice the next artist). A plain average would put a one-album artist with one great album at the top. The extra 1500 album pulls small catalogs toward the middle without a setting to tune. Per-decade lists use the same rule over the artist's albums placed in that decade.

## Decade top 25

**Hand-ranked, as in the sheet.** The 75 existing decade ranks are judgements the user typed, and the import keeps them.

- Any ranked or honorable mention album placed in the decade can go on the list. No candidate flag: the sheet didn't rely on it, so it is not imported.
- The user adds albums and reorders by drag and drop, up to 25 per decade.
- A decade with no list shows a suggestion: its top 25 albums by rating. The user can accept it and then reorder. A suggestion is not saved until accepted.
- The decade is the album's year page decade, not its catalog release year.

## Spreadsheet import

- **A script**, run once from the command line with the file path. Review of unmatched rows happens in the app, on a review page the import fills.
- Reads the Albums sheet's input columns: album, artist, year, rank, honorable mention, decade top 25 rank. Ignores derived columns, `New`, the candidate flag and the pivot sheets.
- Row mapping: rank → ranked; honorable mention flag → honorable mention (the flag wins over a rank, as in the sheet, and the row goes on the review list); neither → listed.
- Matches each row to a catalog album. Clear matches are accepted; ambiguous or missing ones go to the review page, where the user picks a match or keeps it as a manual album.
- Exact duplicate rows (same album, same year) merge into one entry and are listed in the summary.
- Re-running is safe: an entry already imported is not added again.
- Prints a summary: rows read, matched, sent to review, merged, skipped.
- Never commit the spreadsheet or rows from it. Test fixtures use made-up rows.

## Data model outline (for #4)

Store inputs only. Ratings and artist scores are computed.

- **Artist**: name, catalog id (nullable).
- **Album**: title, artist, catalog id (nullable for manual albums), original release year (nullable), cover art URL (nullable).
- **Year entry**: album, year, placement (`ranked`, `honorable_mention` or `listed`), rank 1 to 10 when ranked. Rules: an album has at most one year entry; ranks are unique within a year; honorable mention and listed entries have no order.
- **Matchup**: album A, album B, result (`a`, `b` or `tie`), created at. The screen serves only pairs from different years, but a matchup stays valid if the user later moves an album into its opponent's year. Undo deletes the newest row. Deleting an album deletes its matchups.
- **Decade list entry**: decade, album, position 1 to 25, unique per decade. The album's year entry must fall in that decade.
- **Import review item**: the source row's text (title, artist, year, placement), candidate matches, status. Deleted once resolved.

## Non-goals

- More than one scoring algorithm, a scoring settings screen, or the spreadsheet's points and year weight.
- Accounts, multiple users, sharing.
- Deployment and a password gate (follow-up ticket).
- Track-level data, listening history, streaming links.
- Exporting back to a spreadsheet.
- Splitting collaborations into separate artists.
- A native app. The web app must work in a phone's browser, which #6's touch drag covers.
- Visual design beyond the screens described above.

## Acceptance for the whole MVP

1. **Import.** After importing the user's file and resolving the review page, every year page shows the sheet's ranks, honorable mentions and listed albums for that year, and the 1960s, 2000s and 2010s decade lists match the sheet's decade ranks. The only differences are the merged duplicate and the rank-plus-honorable-mention row, both named in the summary.
2. **Elo math.** Unit tests on fixed inputs: two new albums at 1500, A wins: A is 1516, B is 1484. A tie between 1500 and 1500 changes nothing. Replaying the same inputs twice gives the same ratings.
3. **Seeding.** On a fixture year with no explicit matchups, the replay plays exactly the implied results above (ranked over lower ranked, ranked over honorable mention, nothing else).
4. **Matchups.** Answering a matchup changes both ratings and the artist and decade lists that contain them. Undo restores the previous ratings exactly. The screen never serves two albums from the same year, a listed album, or a pair already played while an unplayed pair exists.
5. **Year edits.** Moving an album from rank 4 to rank 1 survives a reload and changes the ratings in that year on the next replay.
6. **Artist score.** For an artist with albums rated 1600 and 1700, the score is (1600 + 1700 + 1500) / 3 = 1600.

## Follow-up tickets: changes needed

This ticket may only change itself, so these edits are for the Chief of Staff or the user to apply:

- **#3 scaffold:** shape is one web app with a server and a SQLite file, run on localhost.
- **#4 data model:** add the `listed` placement; one year entry per album; a matchup table; decade list entries with no candidate flag; manual albums; import review items. Remove the scoring configuration entity. The album year question is settled: the entry's year is the user's.
- **#5 catalog search:** results are release groups (albums), not editions. Return the original release year.
- **#6 ranking screen:** add the listed area; show each album's rating instead of rank points; adding an album already on another year asks to move it.
- **#7 scoring engine:** rewrite as "Build the Elo rating engine and matchup screen". Pure replay of implied and explicit results into ratings, the artist score rule, matchup picking, and the matchup screen with tie, skip and undo. Drop the points, year weight and settings screen, the spreadsheet regression fixture, and the swappable algorithms section.
- **#8 artist views:** score is the artist rule above. Drop the acceptance that compares with the sheet's artist summary. Per-decade lists one decade at a time.
- **#9 decade top 25:** hand-ranked, no candidate flag, suggestion by rating for empty decades.
- **#10 import:** a command-line script plus an in-app review page; map listed-only rows; merge exact duplicates; the honorable mention flag wins over a rank. Replace the weighted-score acceptance with acceptance 1 above. The row count is 752, not about 674.
- **New ticket (Backlog):** deploy the app with a password gate.

## Calls I made

Surprising first.

- **Seeded Elo from the yearly ranks** by replaying them as implied wins before the user's matchups. Without it nothing is ranked until hundreds of answers. The cost: until cross-year matchups are played, big years rate higher, as with today's year weight.
- **Elo constants fixed** (start 1500, K 32, scale 400) with no settings screen, since the user asked for one algorithm and no hand-set weights.
- **Artist score is an average with one phantom 1500 album**, not a sum (rewards volume) and not a plain average (rewards one-album artists).
- **Listed albums get no rating** and stay out of matchups and lists. They are kept on the year page so the import loses nothing. I don't know what these 81 rows mean to the user; "listed" is a placeholder name.
- **Honorable mentions don't play each other** in seeding, because the sheet calls them unordered.
- **No same-year matchups.** The year ranking already answers those.
- **Decade top 25 stays hand-ranked**, with a rating-based suggestion for empty decades, instead of being the decade's top 25 by rating.
- **One album, one year.**
- The **year is the user's**, not the catalog's.
- **Localhost only for the MVP**, no deployment and no password.
- **Import is a script**, with review in the app.
- **Per-decade artist lists** (1950s to 2020s) instead of the sheet's paired groups.
- **Dropped the candidate flag and the `New` flag.**
- The **honorable mention flag wins** over a rank on the one row that has both, and that row goes to review.
- **Exact duplicate rows merge** on import.
- **A collaboration is one artist.**
- The catalog's **release group** is the album.

## Open questions for the user

1. What are the 81 rows with no rank and no honorable mention? Should they stay as a "listed" placement with no rating?
2. Should decade top 25 lists stay hand-ranked, or simply be the decade's top 25 by rating?
3. Should the per-decade artist lists keep the sheet's paired groups (1960s and 1970s, ...) instead of one decade at a time?
