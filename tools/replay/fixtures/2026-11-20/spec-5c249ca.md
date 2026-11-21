# Album ranker MVP: requirements

**Status:** Draft
**Date:** 2026-11-20
**Ticket:** [ALBUM-2](https://github.com/dbeallor/album-ranker/issues/2), epic [#11](https://github.com/dbeallor/album-ranker/issues/11)

## Goal

Replace the `Best Albums.xlsx` spreadsheet with a web app where the user:

- searches an album catalog and adds albums to a year,
- ranks each year's favourites by dragging cover art,
- picks and tunes a scoring system,
- sees artist rankings (overall and per decade) and decade top 25 lists computed from it,
- imports the spreadsheet once, so nothing is retyped.

This spec is the requirements for the build tickets #3 to #10. It contains no code.

## What the spreadsheet actually does

The ticket's description came from a values-only export. The attached workbook still has its formulas and pivot tables, and they correct several of its assumptions. Counts below are from the Albums sheet.

**Rows.** 752 album rows, years 1955 to 2024 (56 distinct years), 391 artists. Each row is one of:

| Row kind | Count | Points |
|---|---|---|
| Ranked (rank 1 to 10) | 292 | 10 down to 1 |
| Honorable mention | 378 | 0.25 (from `'Scoring System'!B12`) |
| Ranked and flagged honorable mention | 1 (a 2014 row, rank 5) | 0.25: the formula checks the honorable mention flag first |
| Listed only: no rank, no honorable mention | 81 | 0 |

The ticket's "about 674" counted ranked plus honorable mentions and missed the 81 listed-only rows. Its "754" counted rows with any value. Listed-only rows sit mostly in 1960 to 1981. One pair (a 1960 album) is an exact duplicate row, both listed-only.

**Ranks per year.** Only 11 years (2014 to 2024) use all ten ranks. 33 years stop at rank 5, 11 years stop at rank 1 to 3, and 1996 has no ranked album. The Ranked sheet itself shows five rank columns.

**Year weight.** The formula is in the sheet, not a fit: `weight = (N / maxN) ^ (1/4)`. `N` is `count(Album) where Year = this year`, so it counts every row in the year, listed-only rows included. `maxN` is 41 (2019 and 2021). The formula matches every row's stored weight.

**Weighted score.** `points × year weight`. Matches every row.

**Rollups.** These are pivot tables:

| Sheet | What it shows |
|---|---|
| Artist Stats | Sum of **unweighted points** per artist, in four groups: 1960s and 1970s; 2010s and 2020s; 1990s and 2000s; 1980s. The one 1950s album is in no group. |
| By Decade | Despite the name, the sum of unweighted points per artist over all years. |
| Weighted Score | Sum of **weighted score** per artist over all years, with a row count. |
| Year Weights | Weight and row count per year. |
| Artist Summary | Per-artist drill-down: each album with year, rank, points, weight, weighted score. |

So the sheet has two artist rules: unweighted points per decade group, weighted score overall. The ticket assumed weighted score everywhere.

**Decade top 25.** 75 albums carry a decade rank: 25 each for the 1960s, 2000s and 2010s. The candidate flag is not required: none of the 2000s ranked albums is flagged, and 2010s has 55 candidates for 25 places. 7 of the 75 are honorable mentions. Ranks are typed by hand; no formula derives them.

**Other columns.** `New` marks 24 rows, all in 2023. `DecadeRank` is a derived label (`2010-07`). The leading `Rank` column is a derived key (`20241`).

## Users and shape

- **One user, no accounts.** The app is for the person who keeps the spreadsheet. No sign-up, no sharing, no multi-user data.
- **Web app with a small server.** The catalog source may need an API key, and #5 requires calling it from server code. A server also holds the data, so a phone and a laptop see the same rankings once it is deployed.
- **Data in one SQLite file** on the server. One user and about a thousand rows need no database server. Backup is copying the file.
- **Runs on localhost for the MVP.** Deploying it (and putting a password in front of it) is a follow-up ticket. Nothing in the MVP should make that harder: config from environment variables, no hardcoded paths.
- The stack itself is #3's call.

## MVP features

1. **Catalog search with cover art (#5).** Free text search by title and artist. Results show cover, title, artist and original release year. Missing covers show a placeholder.
2. **Year ranking screen (#6).** One page per year with three areas:
   - ten ordered rank slots, with the points each slot earns under the active scoring,
   - an unordered honorable mention area,
   - an unordered **listed** area for albums the user heard that year but did not place. These exist in the spreadsheet (81 rows) and count toward the default year weight, so the screen has to show them.

   Add from search into any area, drag to reorder or move between areas, remove. Keyboard and touch work too. A year page with fewer than ten ranked albums shows the empty slots.
3. **Scoring settings (#7).** Pick the active scoring algorithm and edit its settings. Every list recomputes when they change. Stored rankings never change.
4. **Artist views (#8).** An overall artist list and a per-decade list (1950s to 2020s, one decade at a time), each with rank, artist, score and album count. Opening an artist shows their albums with cover, year, placement and score.
5. **Decade top 25 (#9).** One hand-ranked list per decade (see below).
6. **Spreadsheet import (#10).** A one-off import of the Albums sheet with a review step for rows it can't match (see below).

## Albums versus releases

- **An album is the catalog's release group**, not a pressing or edition (MusicBrainz "release group", Discogs "master", or the nearest equivalent in the source #5 picks). Reissues, remasters and deluxe editions are the same album and cannot be added separately.
- **The year comes from the user.** Adding an album to a year page puts it in that year. The catalog's original release year is shown and is the default when the import or a search result has no year. #4 stores the user's year on the entry, not on the album.
- **One album, one year.** An album can be on at most one year page. Adding it to a second year asks to move it.
- **Compilations, live albums and soundtracks** are albums like any other if the catalog has them.
- **Missing from the catalog:** the user creates a manual album (title, artist, year) with the placeholder cover. A manual album can be linked to a catalog album later, which keeps its placement and fills in the cover.
- **Artists are the catalog's credited artist.** A collaboration ("Stan Getz & João Gilberto") is one artist entry, as in the spreadsheet. Splitting credits across artists is out of scope.

## Scoring

### The open question

The user has always been unhappy with the scoring and says the weights feel arbitrary, without being more specific. **Open question for the user: what feels wrong about it?** Some possibilities to react to:

- big years and small years count differently (the year weight),
- an honorable mention is worth a quarter of a #10,
- #1 against #2 counts the same as #9 against #10,
- artists with many albums win.

The design below does not depend on the answer, because scoring is swappable and the MVP ships two algorithms.

### What is wrong with today's rule

1. The year weight measures how many albums the user logged in a year, which tracks listening volume and recency, not how good the year was. It also counts listed-only albums, so logging an album you didn't place raises every score in its year.
2. The 1/4 exponent has no reason behind it.
3. A #1 in a one-album year scores 3.95; a #1 in 2019 scores 10. Both were the favourite of their year.
4. Ranks only order albums within a year. Nothing in the data compares one year's #3 with another year's #3.
5. Linear points: the gap between #1 and #2 equals the gap between #9 and #10.
6. Artist totals are sums, so volume wins. The Beatles have 13 rows and 81.3 weighted points, almost twice the next artist.
7. The decade groups use unweighted points while the overall list uses weighted points, so the same artist is scored two ways.
8. 33 of 56 years stop at rank 5, so ranks 6 to 10 exist only for 2014 onwards.

### Options

| Option | What it is | Fixes | Costs |
|---|---|---|---|
| (a) No year weight, rank points, diminishing artist sums | Today's points; artist score sums each artist's albums with a discount (1st album full, 2nd ×0.8, ...) | 1, 2, 3, partly 6 | Still invents numbers: points table, discount rate |
| (b) Tier per album | The user gives every album a tier (say S/A/B/C) that means the same in every year | 4, the only option that does | Tags ~670 albums by hand; adds a second judgement next to rank that can disagree with it |
| (c) Pairwise (Elo or Bradley-Terry) | The app serves head-to-head matchups and fits a global order | 2, 4, 5: no hand-set weights | Needs a new matchup screen and hundreds of answers before the order means anything; the order moves as answers come in |
| (d) Medal table, no scores | Artists ordered by count of #1s, then top 3s, then top 10s, then honorable mentions | 1, 2, 3, 5, 7: no numbers to tune | Ties are common; still rewards volume within a tier; gives no single number to display |
| (e) Bayesian average for artists | Artist score = average album score pulled toward the overall mean for artists with few albums | 6 | Needs a prior strength, another knob; needs an album score from some other option |

### Choice for the MVP (user to approve)

Ship two algorithms behind one interface:

1. **Spreadsheet (default at first).** Today's rule exactly, so the import can be checked against the sheet. Settings: points per rank, honorable mention value, listed-only value (default 0), year weight on or off, year weight exponent (default 1/4), which rows count toward `N` (default: all rows on the year, as the sheet does), and artist rollup (sum of weighted score, the default, or sum of unweighted points).
2. **Medal table (d).** Proposed replacement. No numbers to tune. Albums are ordered by placement (rank 1 first, then honorable mentions, then listed-only); artists by count of #1s, then ranks 1 to 3, then ranks 1 to 10, then honorable mentions; ties share a rank. Settings: the tier cut-offs (default 1, 3, 10) and whether honorable mentions break ties. The artist list also shows album count and average rank so volume and quality are visible side by side.

Once the user is happy with the data in the app, they switch the default to the medal table in settings, or keep the spreadsheet rule.

Why (d) over the Chief of Staff's lean toward (b) or (c) plus (e):

- The user's complaint is that the weights feel arbitrary. (d) is the only option with no weights at all.
- (b) and (c) each need a large piece of new input work (tagging ~670 albums, or hundreds of matchups) before they give a useful answer. That is a feature in itself, not a scoring setting. Both stay possible: the interface takes them without changing callers. They are follow-up tickets once the user has lived with (d).
- (e) needs an album score to average and a prior to tune, which brings a knob back.
- Rank within a year is the only judgement the user has actually made for every album. (d) uses only that.

### Interface requirement for #7

An algorithm takes all year entries plus its own settings and returns:

- an album ordering, with an optional number to display per album,
- an artist ordering for any set of entries (all years, or one decade), with an optional number and the album count.

The result is an ordering, not just a number: the medal table has no single score. Callers (#6, #8, #9) sort by the ordering and show the number only when there is one. Settings are stored per algorithm, so switching back and forth keeps both.

## Decade top 25

**Hand-ranked, as in the sheet.** The 75 existing decade ranks are judgements the user typed, and the import keeps them.

- Any album placed in the decade (ranked, honorable mention or listed) can go on the list. No candidate flag: the sheet didn't rely on it, so it is not imported.
- The user adds albums and reorders by drag and drop; up to 25 per decade.
- A decade with no list yet shows a suggested list from the active algorithm's album ordering, which the user can accept and then reorder. A suggestion is never saved until accepted.
- Decades follow the album's year on its year page, not its catalog release year.

## Spreadsheet import

- **A script**, run once from the command line with the file path. It is a one-off for one file; a screen is not worth building. The review of unmatched rows happens in the app, on a review page the import fills.
- Reads the Albums sheet's input columns: album, artist, year, rank, honorable mention, decade top 25 rank. Ignores derived columns, `New`, the candidate flag and the pivot sheets.
- Row mapping: rank → ranked; honorable mention flag → honorable mention (the flag wins over a rank, as in the sheet, and the row goes on the review list); neither → listed.
- Matches each row to a catalog album. Clear matches are accepted; ambiguous or missing ones go to the review page, where the user picks a match or keeps it as a manual album.
- Exact duplicate rows (same album, same year) are merged into one entry and listed in the summary.
- Re-running is safe: an entry already imported is not added again.
- Prints a summary: rows read, matched, sent to review, merged, skipped.
- Never commit the spreadsheet or rows from it. Test fixtures use made-up rows.

## Data model outline (for #4)

Store inputs only. Points, weights, scores and artist totals are computed.

- **Artist**: name, catalog id (nullable).
- **Album**: title, artist, catalog id (nullable for manual albums), original release year (nullable), cover art URL (nullable).
- **Year entry**: album, year, placement (`ranked`, `honorable_mention` or `listed`), rank 1 to 10 when ranked. Rules: an album has at most one year entry; ranks are unique within a year; honorable mentions and listed albums have no order. A year can have any number of honorable mention and listed entries.
- **Decade list entry**: decade, album, position 1 to 25, unique per decade. The album's year entry must fall in that decade.
- **Scoring settings**: one row per algorithm with its settings as validated JSON, plus which algorithm is active.
- **Import review item**: the source row's text (title, artist, year, placement), candidate matches, status. Deleted once resolved.

## Non-goals

- Accounts, multiple users, sharing or public profiles.
- Deployment and a password gate (follow-up ticket).
- Tier ratings (b) and pairwise matchups (c) (follow-up tickets if the user wants them after trying the medal table).
- Track-level data, listening history, streaming links or play counts.
- Exporting back to a spreadsheet.
- Splitting collaborations into separate artists.
- A native app. The web app must work on a phone's browser, which #6's touch drag covers.
- Visual design beyond the ranking screen's layout above.

## Acceptance for the whole MVP

1. **Engine regression.** With the spreadsheet algorithm and its defaults, a fixture of sheet rows (including 2024, 2023, 1983, a year with listed-only rows such as 1971, and the rank-plus-honorable-mention row) scores to the sheet's weighted score within 1e-6. Example: 2024 rank 1 is 8.357214, rank 10 is 0.835721, an honorable mention is 0.208930.
2. **Import round trip.** After importing the user's file and resolving the review page, the spreadsheet algorithm's weighted score matches the sheet's for every imported entry in every year where the import merged or dropped nothing. The import names the years where it did (1960 has the duplicate row, so its `N` drops from 8 to 7).
3. **Artist lists.** The overall list under the spreadsheet algorithm (weighted sum) matches the Weighted Score pivot's top 20. With the rollup set to unweighted points, a decade's list matches the Artist Stats pivot for that decade's albums.
4. **Decade top 25.** The 1960s, 2000s and 2010s lists match the sheet's decade ranks after import.
5. **Swap.** Switching to the medal table reorders artist lists and the decade suggestion without changing any stored entry, and switching back restores the spreadsheet numbers.
6. **Ranking screen.** The user can add a searched album to a year, move it between ranked, honorable mention and listed, reorder, remove, and the state survives a reload.

## Follow-up tickets: changes needed

This ticket may only change itself, so these edits are for the Chief of Staff or the user to apply:

- **#3 scaffold:** shape is one web app with a server and a SQLite file, run on localhost. No change to scope otherwise.
- **#4 data model:** add the `listed` placement; one year entry per album across all years; decade list entries independent of a candidate flag; manual albums; scoring settings per algorithm; import review items. The "album year versus catalog year" question is settled here: the entry's year is the user's.
- **#5 catalog search:** results are release groups (albums), not editions. Return the original release year.
- **#6 ranking screen:** add the listed area; adding an album already on another year asks to move it.
- **#7 scoring engine:** `N` counts every row in the year including listed-only ones; the formula is in the sheet, not a fit; the honorable mention flag wins over a rank; the rollup rule has two values (weighted sum, unweighted sum); add the medal table as a second algorithm; the result is an ordering with an optional number. Add a listed-only row and the rank-plus-honorable-mention row to the fixture.
- **#8 artist views:** per-decade lists, one decade at a time, rather than the sheet's paired groups. Acceptance compares against the Weighted Score pivot (overall) and Artist Stats (per decade, unweighted). Show average rank next to the total.
- **#9 decade top 25:** hand-ranked, no candidate flag, suggestion from the active algorithm for empty decades.
- **#10 import:** a command-line script plus an in-app review page; map listed-only rows; merge exact duplicates; the honorable mention flag wins over a rank. The row count is 752, not about 674.
- **New ticket (Backlog):** deploy the app with a password gate.
- **Later tickets, not in the MVP:** tier ratings (b); pairwise matchups (c).

## Calls I made

Surprising first.

- Picked the **medal table (d)** as the proposed new scoring, not the Chief of Staff's lean toward tiers or pairwise plus a Bayesian artist score. Reasons in § Scoring.
- Kept the 81 **listed-only rows** as a third placement (`listed`) instead of dropping them, because the sheet's year weight counts them and dropping them breaks the regression. I don't know what these rows mean to the user (a longlist? albums heard and not loved?). The label "listed" is a placeholder.
- **One album, one year.** An album can't be ranked in two years.
- The **year is the user's**, not the catalog's: an album's year entry keeps the year the user put it in.
- **Localhost only for the MVP**, no deployment and no password.
- **Import is a script**, with review in the app, not an upload screen.
- **Per-decade artist lists** (1950s to 2020s) instead of the sheet's four paired groups (60s and 70s, 80s, 90s and 2000s, 2010s and 2020s). The sheet also leaves the 1950s out of every group.
- **Dropped the decade top 25 candidate flag** and the `New` flag. The candidate flag wasn't used consistently; `New` looks like a marker for one year's additions.
- The **honorable mention flag wins** over a rank on the one row that has both, matching the sheet's formula, and that row goes to review.
- **Exact duplicate rows merge** on import, which changes 1960's year weight under the spreadsheet rule. Acceptance excludes that year from the round-trip check.
- Spreadsheet scoring stays the **default algorithm** until the user switches, so the first thing they see after import matches their sheet.
- **A collaboration is one artist**, as in the sheet.
- The catalog's **release group** is the album; editions collapse to it.
- **One user, no accounts, SQLite.**

## Open questions for the user

1. What feels wrong about the current scoring? (§ Scoring)
2. Do you approve the medal table as the proposed replacement, with the spreadsheet rule kept as the default until you switch?
3. What are the 81 rows with no rank and no honorable mention? Should they stay as a "listed" placement?
4. Should the per-decade artist lists keep the sheet's paired groups (60s and 70s, ...) instead of one decade at a time?
