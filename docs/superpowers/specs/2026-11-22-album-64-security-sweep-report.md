# Security sweep report

**Status:** Shipped
**Date:** 2026-11-22
**Ticket:** [ALBUM-64](https://github.com/dbeallor/album-ranker/issues/64)
**Spec:** [2026-11-22-album-64-security-sweep.md](2026-11-22-album-64-security-sweep.md)

- Model: `claude-fable-5-2`, high effort. Skill: `owasp-security` (OWASP Top 10:2025, ASVS 5.0).
- Commit reviewed: `c66e8804295c6ab0743521560458c11b6c9cd2da` (`origin/main`). The branch HEAD `43dd0af` adds only the spec.
- Method: code reading of every tracked file under `app/`, `components/`, `lib/`, `scripts/`, `e2e/`, plus config; `npm audit --package-lock-only`; a scan of all 830 commits reachable from any local ref (34 of them on `origin/main`); two local checks with no network (regex timing, an in-memory SQLite check). No attack traffic was sent and no server was started.
- Limits:
  - This worktree has no `node_modules`, and installing would write into the repo, so **the test suite was not run**.
  - Next.js behaviour was read from the Next 16.4.6 docs and source installed in the root checkout (`/Users/david_beallor/Documents/album-ranker/node_modules/next`), the version `package-lock.json` pins.
  - The unmerged #14 branches that exist locally (`feat/album-14-deploy-password-gate`, `feat/album-14-aws-terraform-deploy`) were not reviewed.
- Severity is judged for the app once #14 ships (on the internet, behind a password gate). Each finding says how it stands today.

## Correction to one assumption

The brief says the app is on 127.0.0.1 only today. That holds for `npm run preview` and the Playwright server, which pass `--hostname 127.0.0.1`. It does not hold for `npm run dev` and `npm start`, which listen on every interface (S2). "Today" below means: reachable from the same network when started with `npm run dev`, loopback only when started as a preview.

## Entry points and trust boundaries

- Browser to server: 8 page routes (`/`, `/search`, `/library`, `/library/remove/[albumId]`, `/matchups`, `/analytics`, `/artists/[id]`, `/import`), 6 config redirects, 8 server actions. There are no route handlers, no `proxy.ts` or `middleware.ts`, no `error.tsx`, and no auth code of any kind.
- Server to outside: MusicBrainz (search), Cover Art Archive (HEAD), Deezer (search). Hosts come from env config, never from a request.
- Browser to outside: cover images load straight from `coverartarchive.org` and the Deezer CDN in a plain `<img>`.
- Operator only: the CLI scripts (import, backup, restore, migrate, backfill-covers, preview, record). The spreadsheet import is a CLI script; **the web app has no file upload**.

## Summary table

| ID | Severity | Area | Title | Needs #14 | Ticket |
| --- | --- | --- | --- | --- | --- |
| S1 | High | 10 | No page or action checks who is calling; all data can be changed or deleted | Yes (it is the gate's coverage list) | #65 |
| S2 | Medium | 6 | `npm run dev` and `npm start` listen on every network interface | No, exists today | #66 |
| S3 | Low | 1 | `chooseAlbumAction` stores catalog fields with no validation | No | #67 |
| S4 | Low | 4 | Text from the query string is shown as the app's own error and success messages | No | #68 |
| S5 | Low | 7 | Pages can be framed by another site (no `frame-ancestors` or `X-Frame-Options`) | Yes | #69 |
| S6 | Low | 7 | No Content-Security-Policy | Yes | #69 |
| S7 | Low | 7 | No `X-Content-Type-Options`, `Referrer-Policy` or HSTS | Yes | #69 |
| S8 | Low | 7 | `X-Powered-By: Next.js` is sent | Yes | #69 |
| S9 | Low | 3 | Cover lookups run before the form is validated and are not paced | No | #67 |
| S10 | Low | 3 | MusicBrainz and Deezer requests follow redirects | Impact needs #14 | #70 |
| S11 | Low | 3 | Catalog responses have no size cap; a long Deezer title stalls the server | No | #70 |
| S12 | Low | 3 | MusicBrainz ids and credit entries are used without shape checks | No | #70 |

Counts: Critical 0, High 1, Medium 1, Low 10. Two more items could not be confirmed (N1, N2) and ten are informational (I1 to I10).

## Findings

### S1. No page or action checks who is calling (High, area 10)

- **Follow-up:** #65.

- **Where:** every file under `app/`. No `proxy.ts`/`middleware.ts` exists. The actions: `addToLibraryAction` (`app/search/actions.ts:14`), `answerMatchup`, `skipMatchup`, `undoMatchup` (`app/matchups/actions.ts:6,10,14`), `chooseAlbumAction`, `keepManualAction`, `skipAction` (`app/import/actions.ts:81,89,95`), `removeAlbumAction` (`app/library/remove/[albumId]/actions.ts:12`).
- **How to trigger:** anyone who can reach the port can do all of this with a browser or a plain HTTP client. Next's Origin check (below) stops cross-site browser forms, not direct clients.
  - Delete the library: `GET /library/remove/<id>` shows the matchup count, which is the only "token" `removeFromLibrary` asks for (`lib/library-service.ts:107-128`); posting the form deletes the album and its matchups. Album ids are sequential.
  - Delete every matchup: call `undoMatchup` in a loop (`lib/matchups-service.ts:105`, `lib/db/matchups.ts:63`). No confirmation, no undo of the undo.
  - Insert without limit: `addToLibraryAction` (albums), `answerMatchup` (matchups). Every page replays all matchups per request (`lib/ratings.ts:18`), so a flood of matchups also slows every page.
  - Resolve or skip every import review item, and store unvalidated album rows (S3).
  - Make the server call outside services: `GET /search?q=...` (one MusicBrainz request per new query), `GET /import?search=<id>&q=...` (up to 4), and the add actions (Cover Art Archive plus Deezer, unpaced, S9). The MusicBrainz queue is shared (`lib/catalog/musicbrainz.ts:178-189`), so a stranger filling it makes search answer "busy" for the owner, and the requests carry the owner's User-Agent.
  - Read everything: the library, rankings, matchup counts and the spreadsheet rows on `/import`.
- **What the gate in #14 must cover:**
  1. Every page route and every POST. In Next 16 a server action is a POST to the page that uses it, so a `proxy.ts` matcher that leaves a path out also leaves out the actions on that path (Next docs, `proxy.md`: "Always verify authentication and authorization inside each Server Function rather than relying on Proxy alone"). Check the session inside each of the 8 actions as well as in the proxy.
  2. Exclude only `/_next/static` (and the gate's own page) from the matcher. Do not exclude `/_next/image` (N2).
  3. Session cookie: `HttpOnly`, `Secure`, `SameSite=Lax` or stricter. With that, Next's built-in check (the `Origin` host must equal `Host`/`X-Forwarded-Host`, POST only) is enough against CSRF. `serverActions.allowedOrigins` is unset, which is right; if a CDN or proxy sits in front, it must forward the public host in `X-Forwarded-Host`.
  4. Rate limit the password form (ASVS 6.3.1). The password is the only factor.
  5. Serve a production build (`next build` then `next start`), never `next dev`: the dev server shows stack traces and source to any visitor. A production build shows Next's generic error page; the repo has no `error.tsx`, and no page renders a stack or raw exception except the note in I7.
  6. If the gate sits in a proxy on the same host rather than in the app, the app must not be reachable around it (S2).
  7. Take a backup on a schedule. Today backups happen only before a migration, before a restore, or by hand, and the delete actions cannot be undone.
- **Fix:** #14, built to the list above.
- **Today:** same impact, smaller reach (the local network via S2, or loopback for previews).
- **Needs #14:** yes. This is the requirement list for #14, not a separate bug in `main`.

### S2. `npm run dev` and `npm start` listen on every network interface (Medium, area 6)

- **Follow-up:** #66.

- **Where:** `package.json:9` (`"dev": "next dev"`) and `package.json:11` (`"start": "next start"`). `README.md:10` tells the user to run `npm run dev`.
- **Why:** with no `--hostname`, both commands bind `0.0.0.0` (Next docs `cli/next.md`; the option text in `next/dist/bin/next` says "default: 0.0.0.0"). The preview script and the Playwright config pass `--hostname 127.0.0.1` on purpose (`scripts/preview/index.ts:46,374-377,410`, `playwright.config.ts:26`); the two npm scripts do not.
- **How to trigger:** run `npm run dev` on a shared network. Another machine opens `http://<laptop-ip>:3000` and has everything in S1, with no login. A host firewall that blocks incoming connections stops it; macOS ships with that off.
- **Fix:** `next dev --hostname 127.0.0.1` and `next start --hostname 127.0.0.1` in `package.json`. For #14, decide the bind address on purpose: loopback if a proxy on the same host fronts the app, otherwise restrict the port with the security group.
- **Today:** this is today's exposure, not lower.
- **Needs #14:** no.

### S3. `chooseAlbumAction` stores catalog fields with no validation (Low, area 1)

- **Follow-up:** #67.

- **Where:** `candidateFrom` and `chooseAlbumAction` (`app/import/actions.ts:50-64, 81-87`), `resolveReviewItem` (`lib/import/resolve.ts:62, 84-90`), `createAlbum` (`lib/db/albums.ts:87-102`).
- **What:** the search add path validates every field (`addCatalogAlbumToLibrary`, `lib/library-service.ts:60-84`: UUID catalog id, lower-cased; artist id shape; title and artist at most 300 characters; release year 1 to 2100). The import review path checks only that `catalogId`, `title` and `artist` are not empty and that `releaseYear` is digits.
- **How to trigger:** post the "Use this album" form on `/import` for any open item with changed hidden fields:
  - `catalogId` in upper case: `resolve.ts:62` looks it up as sent, SQLite compares text case-sensitively, so the lookup misses the stored lower-case row and the `UNIQUE` constraint does not fire. The same album is in the library twice. (Checked in an in-memory SQLite database.)
  - `catalogId=x`: stored as the album's catalog id.
  - `title` or `artist` of several hundred kilobytes (the only cap is Next's 1 MB action body): stored, then sent in every page that lists the album.
  - `releaseYear=99999`, or 400 digits: stored as an out-of-range or infinite number (`whole`, `actions.ts:18-20`).
  - `artistId` of any text: stored as the artist's catalog id.
  The cover URL cannot be set this way: the server picks it (`withCover`, `actions.ts:67-70`), and `resolveCover` returns nothing for a non-UUID id.
- **Fix:** share one validator between the two paths (export the checks from `lib/library-service.ts`) and reject a bad candidate in `candidateFrom`; lower-case the catalog id before `findAlbumByCatalogId` in `resolve.ts:62`.
- **Today:** same. After #14 only the logged-in owner can send it, which is why it is Low.
- **Needs #14:** no.

### S4. Text from the query string is shown as the app's own messages (Low, area 4)

- **Follow-up:** #68.

- **Where:** `app/import/page.tsx:95,107,116` (`error`); `app/library/page.tsx:68,88-92` (`removed`); `app/library/remove/[albumId]/page.tsx:40-41,50-54` (`error`); `app/search/page.tsx:37-38,106-110` (`error` with `item`).
- **How to trigger:** a link such as `/import?error=<any text>` or `/library/remove/5?error=<any text>` shows that text in the red alert box; `/library?removed=<any text>` shows "Removed <any text>." in the green one. React escapes it, so this is not script injection. It is a way to put a made-up instruction ("Your session expired, sign in again at ...") inside the app's own alert, on a link someone else wrote.
- **Fix:** put a short code in the URL and map it to a fixed message on the server (`error=stale`, `error=not_found`); for `removed`, cap the length or drop the title.
- **Today:** same.
- **Needs #14:** no.

### S5. Pages can be framed by another site (Low, area 7)

- **Follow-up:** #69.

- **Where:** `next.config.ts:5-22` has no `headers()`, so no `Content-Security-Policy: frame-ancestors` and no `X-Frame-Options`.
- **How to trigger:** another site loads `/library/remove/<id>` in an invisible frame and gets the user to click where "Remove album" is; one click deletes the album and its matchups. The matchup buttons on `/matchups` are one click each too. After #14 this works only if the gate cookie is sent inside a cross-site frame, which `SameSite=Lax` prevents. Today, with no login, any site the user visits while the app runs could frame `http://localhost:3000` (newer Chrome versions ask for permission first).
- **Fix:** in `next.config.ts` `headers()` for `/:path*`: `Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY`.
- **Today:** present, as described.
- **Needs #14:** yes, it matters once other machines can reach the app.

### S6. No Content-Security-Policy (Low, area 7)

- **Follow-up:** #69.

- **Where:** `next.config.ts` (no `headers()`), no `proxy.ts`.
- **What:** defence in depth only. No script injection sink was found (area 4), so a CSP would limit damage from a future one.
- **Fix:** either a static policy from `headers()` (needs `'unsafe-inline'` for Next's inline scripts) or a nonce policy set in `proxy.ts` (Next docs `content-security-policy.md`; nonces need dynamic rendering, and every page here except the 404 already is). It needs `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, and `img-src 'self'` plus `https://coverartarchive.org`, the host its cover links redirect to (check the chain when writing the policy), `https://cdn-images.dzcdn.net` and `https://e-cdns-images.dzcdn.net`. Fonts are self-hosted by `next/font` (`app/layout.tsx:7-10`).
- **Today:** same, low value while the app is local.
- **Needs #14:** yes.

### S7. No `X-Content-Type-Options`, `Referrer-Policy` or HSTS (Low, area 7)

- **Follow-up:** #69.

- **Where:** `next.config.ts` (no `headers()`).
- **What:** hardening. Without a referrer policy the browser default applies, so the two image hosts learn the app's origin on each cover load. HSTS matters once the app has HTTPS.
- **Fix:** `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` (or `strict-origin-when-cross-origin`), and `Strict-Transport-Security` at the app or the CDN once HTTPS is in place.
- **Today:** no effect on a loopback app.
- **Needs #14:** yes.

### S8. `X-Powered-By: Next.js` is sent (Low, area 7)

- **Follow-up:** #69.

- **Where:** `next.config.ts`: `poweredByHeader` is not set, and Next sends the header by default (Next docs `poweredByHeader.md`).
- **How to trigger:** any response names the framework, which helps someone pick exploits for it.
- **Fix:** `poweredByHeader: false`.
- **Today:** no effect.
- **Needs #14:** yes.

### S9. Cover lookups run before the form is validated and are not paced (Low, area 3)

- **Follow-up:** #67.

- **Where:** `addToLibraryAction` (`app/search/actions.ts:21`), `withCover` (`app/import/actions.ts:67-70`, called at `:86`), `find` (`lib/catalog/cover-art.ts:116-139`).
- **What:** `resolveCover` is called before `addCatalogAlbumToLibrary` checks the year and the other fields. `find` only checks that the id is a UUID and that title and artist are at most 300 characters. The MusicBrainz client spaces requests 1.1 s apart; the cover lookup has no spacing and no cache.
- **How to trigger:** post the add form with a valid-looking UUID that is not stored and `year=abc`. The server sends a HEAD to the Cover Art Archive (with the owner's User-Agent) and, on a 404, a search to Deezer, then rejects the form. Repeat with new UUIDs as fast as the server answers; the Cover Art Archive or Deezer may block the server's address.
- **Fix:** validate first, look up the cover only for a request that will be stored; pace cover lookups the way `createMusicBrainzClient` paces searches.
- **Today:** same. After #14 only the owner can send it.
- **Needs #14:** no.

### S10. MusicBrainz and Deezer requests follow redirects (Low, area 3)

- **Follow-up:** #70.

- **Where:** `searchReleaseGroups` (`lib/catalog/musicbrainz.ts:206-209`) and `askDeezer` (`lib/catalog/cover-art.ts:85-88`) call `fetch` with the default `redirect: "follow"`. The Cover Art Archive check already uses `redirect: "manual"` (`cover-art.ts:125`).
- **How to trigger:** only if MusicBrainz or Deezer (or whatever `MUSICBRAINZ_URL`/`DEEZER_URL` point at) answers with a redirect to an internal address; the server then requests that address. The request is a GET and the answer is parsed as a catalog result, so nothing readable comes back. No user input can cause it. On AWS the instance metadata address is the usual target, and IMDSv2 does not answer a plain GET.
- **Fix:** `redirect: "error"` on both calls.
- **Today:** no practical target on a laptop.
- **Needs #14:** the impact does; the fix does not.

### S11. Catalog responses have no size cap; a long Deezer title stalls the server (Low, area 3)

- **Follow-up:** #70.

- **Where:** `response.json()` at `lib/catalog/musicbrainz.ts:226` and `lib/catalog/cover-art.ts:93`; `normalizeForMatch` and `EDITION_TAG` (`cover-art.ts:15, 21-31`), called on Deezer's `title` and `artist.name` at `cover-art.ts:102`; the loop at `cover-art.ts:99` reads every entry, not the 10 asked for.
- **What:** the 8 s and 5 s timeouts cover the body download, but nothing limits its size, and titles, artist names and ids are kept at any length (the search cache holds 500 results, `lib/catalog/search.ts:8,69`). The edition-tag regex takes quadratic time on a long run of spaces inside a title: measured locally, 20,000 characters take 0.25 s and 80,000 take 4 s. The regex runs synchronously, so the timeout cannot stop it and the server answers nothing meanwhile. The user's own title is capped at 300 characters (`cover-art.ts:117`); the title in Deezer's answer is not.
- **How to trigger:** needs a hostile or broken answer from Deezer or MusicBrainz (or a wrong `DEEZER_URL`). No user input reaches it.
- **Fix:** refuse a body over about 1 MB (check `Content-Length`, and count bytes while reading); skip entries whose title, artist or id is longer than 300 characters in `mapReleaseGroups` and `askDeezer`; stop after `DEEZER_RESULT_LIMIT` entries.
- **Today:** same.
- **Needs #14:** no.

### S12. MusicBrainz ids and credit entries are used without shape checks (Low, area 3)

- **Follow-up:** #70.

- **Where:** `mapReleaseGroups`, `joinArtistCredit`, `joinArtistIds` (`lib/catalog/musicbrainz.ts:96-120, 129-159`); `writeRow` (`lib/import/write-row.ts:45-53`); `searchWithRetries` (`lib/import/run.ts:65-67`).
- **What:** the release group `id` only has to be a string. It goes into the cover URL path (`musicbrainz.ts:155`, host fixed), into hidden form fields, and, in the CLI import, straight into `albums.catalog_id` with no UUID check (the web add path does check). Artist ids are joined unchecked. A `null` entry inside `artist-credit` throws a `TypeError` at `part.name`: the web search catches it and shows "couldn't be reached" (`lib/catalog/search.ts:74-77`), but the import script rethrows anything that is not a `CatalogError` and stops.
- **How to trigger:** needs a malformed answer from MusicBrainz (or a wrong `MUSICBRAINZ_URL`).
- **Fix:** in `mapReleaseGroups`, keep only ids that match the UUID pattern, skip credit entries that are not objects, and keep only UUID artist ids.
- **Today:** same.
- **Needs #14:** no.

## Not confirmed

Report only, no ticket: neither was confirmed against a running server.

- **N1. DNS rebinding against a local run (would be Low, today only).** Not confirmed because it was not run against a server. What was read: the repo has no check of the `Host` header, and Next's action check compares the `Origin` host with `Host` (`next/dist/server/app-render/action-handler.js`, around line 442), which a rebound page passes because both carry the attacker's name. A page on a hostile site could then read the local app and call its actions. Not checked: whether the dev server's own blocking of cross-origin requests to `/_next` assets (`allowedDevOrigins`) gets in the way. After #14 a cookie tied to the real hostname closes this for the deployed app; a local run without the gate stays open. A fix would be a `Host` allow-list in `proxy.ts`.
- **N2. `/_next/image` is on by default and unused.** Not confirmed because no request was sent. The app uses a plain `<img>` (`components/cover.tsx:26`) and sets no `images` config, so Next's image optimizer endpoint should still answer for local paths, with remote URLs refused. If so, it is an unused endpoint: keep it behind the gate (S1 item 2) or set `images: { unoptimized: true }`.

## Areas

### 1. Server actions

Checked: every `FormData` field and argument of the 8 actions, down to the SQL; id handling; Next's CSRF and origin check (docs `data-security.md`, `server-actions.md`, `serverActions.md`, and `action-handler.js`).

- `addToLibraryAction`: all fields validated in `addCatalogAlbumToLibrary` (types, UUID shapes, lengths, year ranges); the browser's `coverUrl` is ignored. Order of lookup and validation: S9.
- `answerMatchup`, `skipMatchup`, `undoMatchup`: arguments are typed in the signature but checked at run time in `lib/matchups-service.ts` (positive integers, result in a fixed list, `avoid` capped at 100,000 well-formed keys). No finding.
- `removeAlbumAction`: id and count parsed as safe whole numbers; redirects use `encodeURIComponent` and `URLSearchParams`. No finding.
- `chooseAlbumAction`: S3. `keepManualAction`, `skipAction`: `itemId` digits only. No finding.
- Access by id: the app has one owner and no accounts, so there is no row a caller should not touch; the missing check is the login itself (S1).
- CSRF: actions are POST only and Next rejects a request whose `Origin` host differs from `Host`/`X-Forwarded-Host`; `allowedOrigins` is unset. No GET changes the database. A request with no `Origin` is let through with a warning, which only non-browser clients can send. No finding beyond S1.
- Body size: Next's default 1 MB cap applies (`bodySizeLimit` unset).

### 2. Spreadsheet import

Checked: `scripts/import.ts`, `lib/import/read-sheet.ts`, `rows.ts`, `run.ts`, `write-row.ts`, `match.ts`, `resolve.ts`, `app/import/`.

**No findings.** The import is a CLI script that reads a local path given by the operator (`scripts/import.ts:13`, `read-sheet.ts:64-76`). The web app has no upload, so upload limits, zip bombs and huge sheets are not reachable from a request; `read-excel-file` is imported only by `read-sheet.ts`. Cell text is trimmed, checked (year 1900 to 2100, rank 1 to 10), stored through bound parameters, sent to MusicBrainz as escaped words cut at 200 characters (`musicbrainz.ts:25-55`), and rendered as React text. See I5 for the missing caps, which matter only if an upload is ever added.

### 3. Catalog requests

Checked: `musicbrainz.ts`, `cover-art.ts`, `server-cover.ts`, `backfill-covers.ts`, `search.ts`, `scripts/backfill-covers.ts`, `lib/config.ts`.

- SSRF: no finding. Hosts come from env config only; the one path segment built from input is a UUID checked by regex (`cover-art.ts:9,117`); query strings go through `URLSearchParams`; Lucene specials and operators are escaped; the stored cover URL is always the canonical Cover Art Archive URL or a Deezer URL checked against a host list with scheme, port and credentials (`cover-art.ts:33-41,107`).
- Redirects: S10. Timeouts: present on all three (8 s, 5 s, 5 s). Response size: S11. JSON shapes: S12 (Deezer's shape is checked). Rate limits: MusicBrainz is spaced 1.1 s with a 5 s queue cap, per process; cover lookups are not (S9); the backfill script paces at 1 per second. User-Agent: I3.

### 4. Rendering of catalog text and cover URLs

Checked: every `.tsx` under `app/` and `components/`; grep for `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, `srcDoc`, `javascript:`; every `href`, `src` and `action`.

- No raw HTML sink anywhere. Catalog, sheet and database text is rendered as React text or attribute values.
- Every `href` is a fixed internal path, or one built from a numeric id or a validated scope. No external link, no `target`.
- `<img src>` (`components/cover.tsx:26-28`) gets either a stored cover (written only by the server, from the host-checked lookup) or, in search results and review candidates, `https://coverartarchive.org/release-group/<id>/front-250` with the host fixed.
- `next/image` is not used, so there are no `remotePatterns` to check (see N2).
- Finding: S4.

### 5. SQLite

Checked: all of `lib/db/`, every `prepare` and `exec` in `lib/` and `scripts/`, the three migrations.

**No findings.** Every value is a bound parameter. The few interpolated pieces are constants in the code (`ALBUM_SELECT`, `REPLAY_ORDER`, the two `WHERE` strings in `backfill-covers.ts:79-89`, a fixed table name in `backup.ts:70-83`, and `?` placeholders in `library.ts:50-56`). `VACUUM INTO ?` is bound. Foreign keys are on. Migrations are files from the checkout, each run in its own transaction, with a backup first. Backups are mode 0600 in 0700 folders. The live database's permissions: I1. What restore trusts: I4.

### 6. Scripts

Checked: `scripts/backup.ts`, `restore.ts`, `migrate.ts`, `import.ts`, `backfill-covers.ts`, `preview.ts`, `preview/index.ts`, `preview/rules.ts`, `record.ts`, `record/*.ts`, `e2e/recorder/*.ts`.

- Shell commands: no finding. All child processes use an argument array (`execFileSync`, `spawn`, `spawnSync`). The one `sh -c` (`preview/index.ts:371-378`) has a constant script and takes the path, port and host as positional arguments.
- Paths: no finding. Preview file names are reduced to `[A-Za-z0-9._-]`; ports are range-checked; backup names follow a fixed pattern.
- 127.0.0.1: previews and the Playwright server are pinned to it; `npm run dev` and `npm start` are not (S2).
- Record: accepts only `localhost`, `127.0.0.1` and `[::1]` (`record/rules.ts:32,72-73`) and masks password fields (`e2e/recorder/recorder.ts:172-173`). No finding.
- Restore: I4.

### 7. `next.config.ts` and headers

Checked: `next.config.ts`, every `redirect()` call in the actions.

- Redirects: no finding. All six config redirects go to fixed internal paths with `\d{4}` parameters. Every action redirect is an internal path with encoded parameters. No open redirect.
- Headers: S5, S6, S7, S8.

### 8. Secrets

Checked: the tree; `git log --all -p` over 830 commits (34 on `origin/main`, the rest on local branches, PR refs and t3 checkpoint refs) for AWS, GitHub, Slack, OpenAI-style, ElevenLabs-style, Google, Linear, npm and GitLab key shapes, private key blocks, JWTs, and `password|secret|api key|token = <value>` assignments; every file ever added whose name suggests a secret or data file; `.gitignore`.

**No findings.** No key shape matched. The assignment search matched only test values on the unmerged #14 branch. The app on `main` uses no secret: all three outside services are keyless. `.gitignore` covers `.env*` (except `.env.example`), `data/`, `*.db`, `*.sqlite*`, `*.db-*`, `*.db.bak*`, `.preview/` and `recordings/`. `.env.example` holds only defaults. See I8 and I9.

### 9. Dependencies

Checked: `npm audit --package-lock-only` on `package-lock.json` (503 packages: 29 production, 438 dev).

**No findings: 0 advisories**, so there is nothing to mark as reachable or not. For later advisories: the web app's runtime uses `next` 16.4.6, `react` and `react-dom` 19.3.1 and `server-only`; `read-excel-file` 9.3.20 and its four dependencies are loaded only by the CLI import; everything else is dev tooling. The lockfile is version 3, every package resolves from `registry.npmjs.org` with an integrity hash, and the only install script is `fsevents` (dev, optional).

### 10. Exposure once deployed

Checked: every route and action for a login or ownership check, the files that would hold one, error handling, and the Next docs on proxy coverage of actions.

Findings: S1 (the full list of open pages and actions, and what the gate must cover) and S2. Not confirmed: N1, N2. Error pages: a production build shows Next's generic page with no stack trace; `next dev` must not be the deployed command (S1 item 5).

## Informational (no practical attack, no ticket)

I9 and I10 are notes for #14.

- **I1.** The live database and `data/` are created with default permissions (`lib/db/connection.ts:40-42`, usually 0644 and 0755), while backups are 0600 in 0700 folders. Other accounts on the same machine could read the file. It holds album titles and matchups, nothing secret.
- **I2.** The Deezer log lines include the submitted title as is (`lib/catalog/cover-art.ts:90,95,111`), so a title with a line break can fake a log line. After #14 only the owner can send one.
- **I3.** The default User-Agent `album-ranker/0.1` (`lib/config.ts:15`) has no contact detail, which MusicBrainz asks for and may throttle. Set `MUSICBRAINZ_USER_AGENT` on the deployed server.
- **I4.** Restore accepts any SQLite file that passes `integrity_check` and has a `schema_migrations` table (`lib/db/backup.ts:38-63, 231-292`); it does not check the schema, triggers or stored cover URLs. Only the operator can run it, with a file they chose.
- **I5.** The CLI import reads the whole workbook into memory and has no cap on file size, row count or cell length (`lib/import/read-sheet.ts:70`, `lib/import/rows.ts:18-20`). The file is the operator's own. A web upload would need all three caps.
- **I6.** `MUSICBRAINZ_URL`, `COVER_ART_ARCHIVE_URL` and `DEEZER_URL` are not checked to be `https` (`lib/config.ts:52-66`). They are meant for tests; leave them unset on the deployed server.
- **I7.** The import page shows the message of any exception thrown during its search (`app/import/page.tsx:89-91`). A message, not a stack trace.
- **I8.** Local t3 checkpoint refs (not on `origin/main`) once committed `.preview/main.json` and `.preview/main.log`; the log shows a process id, a port and a private network address. No secret. `.preview/` is ignored now.
- **I9.** The #14 Terraform branch generates the app password with `random_password`, which Terraform keeps in its state file in plain text. `main` has no ignore rule for `*.tfstate` or `.terraform/`. Seen in history only, not reviewed; for #14 to handle.
- **I10.** Nothing logs who did what: no record of deletes, action calls or (later) failed logins. ASVS puts security logging at level 2; for #14, log failed gate attempts at least.

## Follow-up tickets

All are sub-issues of [#11](https://github.com/dbeallor/album-ranker/issues/11) with `Related: #64`.

| Ticket | Findings | Priority | Blocked by |
| --- | --- | --- | --- |
| [#65](https://github.com/dbeallor/album-ranker/issues/65) Make the #14 password gate cover every page and server action | S1 | high | #14 |
| [#66](https://github.com/dbeallor/album-ranker/issues/66) Bind dev and start to 127.0.0.1 only | S2 | medium | none |
| [#67](https://github.com/dbeallor/album-ranker/issues/67) Validate add and import form fields the same way, before any lookup | S3, S9 | low | none |
| [#68](https://github.com/dbeallor/album-ranker/issues/68) Show fixed messages instead of text from the URL | S4 | low | none |
| [#69](https://github.com/dbeallor/album-ranker/issues/69) Add security headers and hide X-Powered-By | S5, S6, S7, S8 | low | #14 |
| [#70](https://github.com/dbeallor/album-ranker/issues/70) Harden catalog responses: redirects, size and id shapes | S10, S11, S12 | low | none |

## Checks by the builder

The builder confirmed against the code: no `proxy.ts` or `middleware.ts`; `next dev` and `next start` take no `--hostname`; `next.config.ts` has no `headers()` or `poweredByHeader`; `redirect: "manual"` is set only in `cover-art.ts`; the query-string messages in the import and library pages. The regex timing (S11) and the duplicate-row case (S3) are the sweep's own local checks, not repeated.
