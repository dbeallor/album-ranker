# album-ranker
Personal Favorite Album Ranker

## Run the app

1. Install Node 24 or newer (`nvm use` reads `.nvmrc`).
2. `npm install`
3. Optional: `cp .env.example .env` to change `DATABASE_PATH` or `MUSICBRAINZ_USER_AGENT`, or to set `APP_PASSWORD` (any text) so the local app asks for a password too. Leave it unset and nothing asks.
4. `npm run db:migrate` creates the SQLite file and applies migrations. Optional: the app also migrates on first use.
5. `npm run dev`
6. Open <http://localhost:3000>.

The app listens on this machine only (127.0.0.1), so other devices on your network can't reach it. If you want to open it from another device on purpose, run the production server directly with a different host: `npm run build && npx next start --hostname 0.0.0.0`. Set a long `APP_PASSWORD` first, because anyone on your network can then reach the app, and the password travels over plain HTTP.

## Deploy to AWS

Two copies run in your own AWS account, staging and production, each with its own password and its own database. Terraform builds everything; you never click through the console. Each copy is a Lambda function behind CloudFront, with the database as one file in a versioned S3 bucket. Production is at <https://album-ranker.com> and staging at <https://staging.album-ranker.com>, with certificates from AWS. Idle, both together cost about $0.60 a month, almost all of it the $0.50 DNS zone.

Two trade-offs of that choice. After a quiet spell the first request takes 1 to 3 seconds (a cold start). Only one request runs at a time, so a second one that lands mid-request gets a 429 and works on a reload.

### What you need first

- An AWS account, and the AWS CLI with a profile that can create these resources (`aws configure sso` or an access key). The credentials stay on your machine; nothing here stores them.
- Terraform 1.10 or newer.
- The domain `album-ranker.com`, registered at GoDaddy. The registration stays there (and so does its renewal); AWS only answers DNS for it.
- Node 24 and `npm ci`, as for the local app.

Use the profile for every command below (`export AWS_PROFILE=<name>`, and `aws sso login` first if you use SSO).

### Set up once

1. Create the bucket that holds Terraform's state:
   `terraform -chdir=infra/bootstrap init && terraform -chdir=infra/bootstrap apply`
2. `terraform -chdir=infra/bootstrap output` prints `state_bucket` and `region`. In `infra/dns`, `infra/envs/staging` and `infra/envs/production`, copy `backend.hcl.example` to `backend.hcl` and put those two values in it.
3. Create the DNS zone for the domain:
   ```
   terraform -chdir=infra/dns init -backend-config=backend.hcl
   terraform -chdir=infra/dns apply
   terraform -chdir=infra/dns output
   ```
   This makes a Route 53 hosted zone for `album-ranker.com` and prints its `zone_id` and four `name_servers`. (`infra/dns/terraform.tfvars.example` is optional: its values are the defaults.)
4. Point the domain at AWS. Both environments need this before their first apply can finish. At GoDaddy: **My Products**, the domain `album-ranker.com`, **DNS**, **Nameservers**, **Change**, **I'll use my own nameservers**, then enter the four name servers from the output (without a trailing dot) and save. Then wait for it to take effect, usually minutes and sometimes a few hours. Check with `dig NS album-ranker.com +short`: it should list the four `awsdns` servers. GoDaddy renames its menus now and then; the setting you want is the one that lets you use your own (custom) name servers.
   - Moving the name servers moves *all* DNS for the domain to Route 53. GoDaddy's own DNS records for the domain (email, a website) stop answering, so copy any you still need into the zone first.
5. In `infra/envs/staging` and `infra/envs/production`, copy `terraform.tfvars.example` to `terraform.tfvars` and edit it: `zone_id` (from `terraform -chdir=infra/dns output -raw zone_id`), your MusicBrainz User-Agent, and optionally `budget_email` for an alert when the monthly bill passes $5. Keep `region` in `terraform.tfvars` equal to `region` in `backend.hcl`. These files are gitignored, as is Terraform's state.

The state holds the generated passwords, so keep the state bucket private (the bootstrap makes it so).

### Deploy staging

Every merge to `main` deploys staging from GitHub Actions (`.github/workflows/deploy-staging.yml`, set up once below). The run prints the `url` and `deployed_commit` and fails if staging doesn't run the commit that was pushed. **Actions**, **Deploy staging**, **Run workflow** (on `main`) repeats it without a new merge. Production is never deployed from CI.

By hand, which is the fallback when CI is down and how the first apply of an environment goes:

```
npm ci && npm run build:lambda
terraform -chdir=infra/envs/staging init -backend-config=backend.hcl
terraform -chdir=infra/envs/staging apply
```

`build:lambda` writes `dist/` (the function and the build files). The first apply of an environment takes a few minutes while CloudFront comes up, and it **waits for the HTTPS certificate to validate**, which only happens once the name servers at GoDaddy have taken effect. If that is still pending, the apply sits on `aws_acm_certificate_validation` for up to 75 minutes and then fails with a timeout. Nothing is lost: check the name servers with `dig NS album-ranker.com +short` and run `terraform apply` again, which picks up where it stopped. Then:

```
terraform -chdir=infra/envs/staging output url
terraform -chdir=infra/envs/staging output -raw password
terraform -chdir=infra/envs/staging output data_bucket
```

Open the `url` (<https://staging.album-ranker.com>) and log in with the `password` (24 random characters). The cookie lasts 90 days and belongs to that host alone, so staging and production sign in separately. Ten wrong tries from one address lock it out for 15 minutes.

The `*.cloudfront.net` address (`output cloudfront_url`) still works and shows the same login page, behind the same password. It is just the unfriendly name for the same copy, with its own cookie.

- **If the first apply fails on concurrency:** a new AWS account can have a Lambda quota too low to reserve any. Set `reserved_concurrency = -1` in `terraform.tfvars` and apply again. The function can then run more than one copy, and the conditional write (`If-Match`) on the database file is the only thing that stops two copies saving over each other: the loser's request fails and nothing is overwritten.
- **Each apply replaces the build files** in the assets bucket and removes the old ones. A page left open across a deploy may need a reload.

### Set up the CI deploy (once)

CI signs in to AWS with GitHub's OIDC token, no stored keys. It assumes the role `album-ranker-ci-staging-deploy`, which only a run on the `main` branch of this repository can assume (a pull request, a fork, another branch or a tag is refused), and which can change staging and nothing else. The trust is on the `main` ref, not on the workflow file: any workflow on `main` that runs on `issue_comment`, `workflow_run`, `schedule` or another event gets the same token subject and could assume the role too. Keep `deploy-staging.yml` the only workflow on `main` that asks for `id-token: write`, and review any new one as if it were a deploy key. `infra/ci` creates the role, the OIDC provider and the permissions boundary the staging function's role now carries. Do this once, after the staging deploy above works, with your admin profile:

1. In `infra/ci`, copy `backend.hcl.example` to `backend.hcl` and `terraform.tfvars.example` to `terraform.tfvars` (both gitignored) and fill them in: the bucket and region from the bootstrap, and `zone_id`. An AWS account holds one GitHub OIDC provider; if yours already has one, set `create_oidc_provider = false`. Then:
   ```
   terraform -chdir=infra/ci init -backend-config=backend.hcl
   terraform -chdir=infra/ci apply
   ```
2. Apply staging by hand once, so the function's role gets the permissions boundary this created and staging's state publishes the IDs of its CloudFront response headers policy and origin access control (`npm ci && npm run build:lambda`, then the `init` and `apply` from "Deploy staging"). Production is untouched.
3. Apply `infra/ci` again. It reads those two IDs from staging's state, looks each one up with your admin credentials, and only if they are named `album-ranker-staging-security` and `album-ranker-staging` lets the role update or delete those two things. The role can write staging's state, so an ID that names anything else (production's, say) makes this apply fail instead of being granted.
4. In the repository settings, **Secrets and variables**, **Actions**, add the variables from `terraform -chdir=infra/ci output`: `AWS_DEPLOY_ROLE_ARN`, `AWS_REGION`, `TF_STATE_BUCKET` and `ZONE_ID`. Add two secrets, the same values as in staging's `terraform.tfvars`: `MUSICBRAINZ_USER_AGENT` and `BUDGET_EMAIL` (skip it if you don't use the budget). CI doesn't read your `terraform.tfvars`, so a value that differs from it, or a setting only in that file such as `reserved_concurrency = -1`, is applied to staging on the next merge.
5. Merge to `main`, or run the workflow by hand. The first run may stop on an `AccessDenied` for an action the role lacks: add it to `infra/ci/policy.tf` (not in the console) and apply `infra/ci`.

If staging ever replaces its response headers policy or its origin access control, the next change to it fails with `AccessDenied` on that resource: apply `infra/ci` again so the role learns the new IDs, then re-run the workflow.

GitHub keeps one pending run per concurrency group, so with three quick merges the middle one is skipped and the latest still deploys.

### Promote to production

Build `dist/` from the commit staging runs, so production gets exactly what you tried in staging. CI deploys staging, so your checkout may be on a different commit:

```
git switch --detach "$(terraform -chdir=infra/envs/staging output -raw deployed_commit)"
npm ci && npm run build:lambda
terraform -chdir=infra/envs/production init -backend-config=backend.hcl
terraform -chdir=infra/envs/production apply
```

(`git switch main` afterwards.)

Production is <https://album-ranker.com>, with its own `url`, `password` and `data_bucket`. Staging data never reaches it. Both send HSTS (one year) for their own host only, so once a browser has seen an address over HTTPS it refuses plain HTTP for it.

### New password

`terraform -chdir=infra/envs/staging apply -replace=module.app.random_password.app` makes a new one (read it with `output -raw password`). Everyone is signed out, and the old password stops working. Do the same in `infra/envs/production` for production.

### Back up, restore, undo a restore

Set `BUCKET` to the environment's `data_bucket` (`BUCKET=$(terraform -chdir=infra/envs/production output -raw data_bucket)`). The database is the object `album-ranker.db`. S3 keeps every replaced version for 30 days, so there is always a recent copy.

| What | Command |
|---|---|
| Back up | `aws s3 cp s3://$BUCKET/album-ranker.db ./production-backup.db` |
| Restore | `aws s3 cp ./production-backup.db s3://$BUCKET/album-ranker.db` |
| List versions | `aws s3api list-object-versions --bucket $BUCKET --prefix album-ranker.db --query 'Versions[].[VersionId,LastModified,Size,IsLatest]' --output table` |
| Go back to a version | `aws s3api get-object --bucket $BUCKET --key album-ranker.db --version-id <id> ./old.db`, then restore `./old.db` as above |

- **Restore takes effect on the next page load.** The app checks the object on every request, so there is nothing to restart. A file that isn't an album-ranker database gives an error page, and the stored object is left as it was.
- **Undo a restore:** list the versions, pick the one from just before your restore, download it with `get-object` and copy it back.
- **Move your local data up:** run `npm run db:backup` first (the live `data/album-ranker.db` can have recent answers in its `-wal` file), then upload the backup file with the restore command. Do the same after `npm run import` or `npm run backfill-covers`, which run on your machine only.
- Backups are your personal data. Keep them out of git.

### Tear down

The data bucket refuses to be destroyed, so a stray `terraform destroy` can't delete your rankings. It fails at plan time. To tear an environment down on purpose:

1. Back up the database (above).
2. In `infra/modules/app/main.tf`, delete the `lifecycle { prevent_destroy = true }` block in `resource "aws_s3_bucket" "data"`.
3. Empty the bucket, every version included:
   ```
   aws s3api delete-objects --bucket $BUCKET --delete "$(aws s3api list-object-versions --bucket $BUCKET --output json --query '{Objects: Versions[].{Key:Key,VersionId:VersionId}}')"
   ```
   (If it reports delete markers too, run it again with `DeleteMarkers` in place of `Versions`.)
4. `terraform -chdir=infra/envs/<env> destroy`

Put the lifecycle block back afterwards (`git checkout infra/modules/app/main.tf`). The state bucket from the bootstrap has the same protection; remove it the same way, after both environments are gone.

The DNS zone is protected too (`prevent_destroy` in `infra/dns/main.tf`), and destroying an environment leaves it alone. Remove it last, after both environments are destroyed, and only for good: a new zone gets new name servers, so the domain stays dead until they are changed at GoDaddy again. Delete the `lifecycle` block in `infra/dns/main.tf`, run `terraform -chdir=infra/dns destroy`, and in GoDaddy choose **Nameservers**, **Change**, **GoDaddy Nameservers** to get its own DNS back. The registration itself is never touched by any of this.

## Back up and restore your data

Your rankings live in one SQLite file: `data/album-ranker.db` in the checkout (or `DATABASE_PATH`). While the app runs, recent answers can sit in its `-wal` and `-shm` files next to it, so copying the `.db` alone can miss them. Deleting the checkout or worktree, or running `git clean -fdx`, deletes its `data/` folder.

Backups go to `~/.album-ranker/backups/`, outside every checkout, so they survive removing a worktree or re-cloning. Set `BACKUP_DIR` to move them. Each database file gets its own subfolder (its name plus a short hash of its path, with a `source.txt` saying which file), so another worktree's test data never pushes your real backups out. Files are named like `20261121T143005Z-manual.db`, and the newest 10 per database are kept. Backups are your personal data: they stay on this machine, are readable only by you, and never go in git.

| Command | What it does |
|---|---|
| `npm run db:backup` | Backs up the database now. Safe while the app runs |
| `npm run db:backup -- list` | Lists the backups, newest first, with size and album, library album and matchup counts |
| `npm run db:restore -- latest` | Restores the newest backup |
| `npm run db:restore -- <file>` | Restores a backup, given as a path or as a file name in this database's backup folder |

- **Restore:** stop the app first (`npm run dev`, and any preview using that file). If a database already exists, it shows what would be replaced and asks you to type `yes`. `--yes` skips the question; with no terminal and no `--yes` it refuses and changes nothing. If the file is still open in another process (the app is running), the restore stops without replacing it. A damaged file that can't be opened is replaced after you confirm, and its raw files are kept in the backup folder as `*-pre-restore-unreadable.db.bak`.
- **Undo a restore:** the replaced data is saved as a `pre-restore` backup, and restore prints its path. Run `npm run db:restore -- <that file>` to go back.
- **Migrations:** when `npm run db:migrate` or the app finds a pending migration in an existing database, it takes a `pre-migrate` backup first. If that backup fails, no migration runs.

## Preview branches

Run `main` and any ticket's worktree side by side, each on its own port and its own SQLite file.

| Command | What it does |
|---|---|
| `npm run preview -- main` | Builds the root checkout (on `main`) and serves it on <http://localhost:4000> |
| `npm run preview -- 20` | Runs the worktree whose branch contains `album-20-` on <http://localhost:4020> |
| `npm run preview -- feat/album-20-local-previews` | Same, found by branch name |
| `npm run preview -- list` | Shows each running preview: target, port, URL, pid, commit |
| `npm run preview -- stop 20` | Stops one preview (`stop main` and `stop all` work too) |

Any checkout can run these. A ticket preview needs a worktree for its branch, for example `git worktree add ../album-ranker-20 -b feat/album-20-short-title origin/main`. Previews are bound to 127.0.0.1 only, so other machines on the network can't reach them. Previews run in the background; the pid file and log are in `.preview/` in the checkout being served (gitignored).

- **Ports:** main is 4000, a ticket is `4000 + N` (1 to 999). A branch without a ticket number, or a number of 1000 or more, needs `--port <p>` (1024 to 65535). Plain `npm run dev` stays on 3000. A taken port fails with the preview that holds it, or an `lsof` hint.
- **Data:** main uses the root checkout's `data/album-ranker.db`, the same file `npm run dev` there uses. A ticket preview uses `data/preview.db` in its own worktree, so migrations and test data never reach main. It keeps that file between runs. `--empty` deletes it first; `--copy-main-data` replaces it with a copy of main's file.
- **Setup:** the script runs `npm install` in the checkout when `node_modules` is missing or `package-lock.json` is newer, and copies `.env.example` to `.env` when `.env` is missing.
- **Refresh after a merge:** run `npm run preview -- main` again. It stops the running main preview, rebuilds and starts it. If the root checkout is behind `origin/main`, it warns and prints the `git pull --ff-only` command; it never pulls.
- **Stop:** `npm run preview -- stop <main|N|branch|all>`.

## Record a session

`npm run record -- <target>` opens a Chromium window on a local app and records what you click, type and submit there, for the replay renderer. One time: `npx playwright install chromium`.

| Command | Records |
|---|---|
| `npm run record -- main` | The running main preview (<http://localhost:4000>) |
| `npm run record -- 30` | The running preview of ticket 30; a branch name works too |
| `npm run record -- 3000` | `http://localhost:3000`, for example `npm run dev` |
| `npm run record -- http://localhost:3000/search` | A URL on `localhost`, `127.0.0.1` or `[::1]`; any other host is refused |

If the preview isn't running, the command prints the `npm run preview -- <target>` line that starts it. Click through the app in the window. Close the window or press Ctrl-C to stop (only the page you start on is checked as local, so pages you reach by following an external link are recorded too); the command prints where it saved the log.

- **Where:** `recordings/<YYYYMMDD-HHMMSS>-<port>/events.json` in the checkout you ran it from (gitignored), or `<dir>/events.json` with `--out <dir>`. While you work the file is rewritten at most once a second, so a crash loses at most the last second.
- **Viewport:** the window starts at 1280x720 unless `--viewport <W>x<H>` says otherwise, and the page follows the window, so resizing it changes the layout as in a normal browser. The log's `viewport` (the page size at the first load) and `resizes` (each later size) say what click positions were measured against.
- **Which app:** each log's `source` says where it came from: host and port, and, where the code can tell, the kind of run, preview name, branch, worktree and commit. The fields are in [docs/event-log-format.md](docs/event-log-format.md).
- **Nothing runs in the app:** the recorder is injected by this command's browser. The app has no recorder code and no endpoint, and a build contains none.

## Add albums

The header has a link to each of the four pages: Add albums, Library, Play and Rankings. The home page is the start of the same flow, with a search box, the library count, your ranking progress and the top five albums; it links to Import review only while spreadsheet rows wait for review.

Open <http://localhost:3000/search> (Add albums) and type an album or artist. Results appear about half a second after you stop typing (a "Searching…" line shows meanwhile); text under 2 characters isn't searched, and Search and Enter still work. Results come from MusicBrainz, one per album, with cover art from the Cover Art Archive. Each result can be added to your library under a year you choose (it starts as the catalog's year); one already in the library shows its year instead. After you add one, the confirmation links to View library (sorted by year, so it sits under its year heading) and to Play matchups. When an album is added (from search, import review or the import script) and the Cover Art Archive has no front cover for it, the server looks for a cover on Deezer, accepting only an album with the same title and artist, and stores it; with no match the grey placeholder stays. Cover lookups from search and import review start at least 1.1 seconds apart; a lookup that would wait more than 5 seconds is skipped and the album is added with the placeholder, and `npm run backfill-covers` fills it later. Results on the search page still show only Cover Art Archive covers, and adding an album does not change albums already in your library; `npm run backfill-covers` fills missing covers for those (see Backfill covers).

MusicBrainz asks API users to put contact details in the User-Agent. Set `MUSICBRAINZ_USER_AGENT` (for example `album-ranker/0.1 (you@example.com)`) in `.env`; the default is `album-ranker/0.1`. MusicBrainz allows about one request per second, and the app retries a busy answer from MusicBrainz up to 3 times itself, so if you still see the busy message, wait a moment and search again.

## Library

Open <http://localhost:3000/library> for every album you have listened to, as a grid. Sort by rating, title, artist, year, decade, era, matchups played, wins, losses, ties, win rate, last matchup or date added, in either direction. Albums that tie on the sort key go by rating, then artist, then title (within one artist, by year, then title). Sorting by year, decade, era or artist puts a heading above each group. Sort by and Direction are always shown. A Filters section holds the search text, the scope (lifetime, an era, a decade or a year) and played or unplayed; it opens by itself when one of them is set. The header links to Add albums and Play, and an empty library or a filter with no match offers Search albums or Clear filters. The sort and filters are in the URL, so a view can be bookmarked. Each card has a Remove link that opens a confirmation page; removing deletes the album and all of its matchups, and can't be undone. Details are in [the ALBUM-34 spec](docs/superpowers/specs/2026-11-21-album-34-elo-library-table.md) and [the ALBUM-35 spec](docs/superpowers/specs/2026-11-21-album-35-add-albums-library.md).

## Play (matchups)

Open <http://localhost:3000/matchups> (Play) to answer "which of these two do you like more?" for any two albums in your library, whatever their years. Pick one, call it a tie, skip the pair, or undo the last answer (undo works repeatedly and serves the undone pair again).

Matchups are the only thing that rates an album. Ratings are never stored: every request replays your matchup answers, oldest first, as Elo with K = 32, starting every library album at 1500. Details are in [the ALBUM-7 spec](docs/superpowers/specs/2026-11-21-album-7-elo-matchup.md) and the ALBUM-34 spec above.

Once at least 8 albums are established (8 or more matchups), a new album (fewer than 8 matchups) is first matched against established albums, halving the rating order from the middle and passing over any established album from the last 3 matchups with a new album, before ordinary closest-rating pairing takes over; with fewer than 8 established albums, ordinary closest-rating pairing is used throughout; see [the ALBUM-43 spec](docs/superpowers/specs/2026-11-22-album-43-favour-new-albums.md).

Beside the matchup count, the page shows how far you are toward an approximately right overall order, as "N% there · about R more to go" ("Target reached" at 100%). It is hidden with fewer than two library albums. How it is measured is in [the ALBUM-42 spec](docs/superpowers/specs/2026-11-22-album-42-ranking-progress.md).

## Rankings (analytics)

Open <http://localhost:3000/analytics> (Rankings) for album and artist rankings by lifetime, era (before 1960, 1960 to 1979, 1980 to 1999, 2000 on), decade or year, and summary tables by year, decade and era. An artist's score is 1500 + 100 × ln(1 + excess / 100), where excess is the total of each album's points above 1500, so more good albums raise it with diminishing returns and albums at or below 1500 add nothing. Open an artist to see their albums with year, rating and win-loss-tie record. Old `/artists`, `/years` and `/decades` links redirect here or to the library. The view tabs are labeled "Show" (Albums, Artists, Years, Decades, Eras) and the scope tabs and pickers "Period"; a period with no albums offers Show lifetime. The home page shows how many albums and matchups you have and links here.

A "Ranking progress" panel sits above the Show tabs on every view. It is library-wide and ignores the period. It shows the percent, "N of about M matchups", and the order confidence (the expected share of album pairs in the right order) against its 90% target, with a Play matchups link. The goal is the matchups played plus an estimate of how many more it takes to reach the target, so adding albums lowers the percent and playing matchups raises it. With fewer than two albums it shows an empty state. Details are in [the ALBUM-42 spec](docs/superpowers/specs/2026-11-22-album-42-ranking-progress.md).

## Import the spreadsheet

`npm run import -- "/path/to/Best Albums.xlsx"` loads the Albums sheet into the database at `DATABASE_PATH`. It matches each row to a MusicBrainz album, then adds the albums to the library with the year from the sheet. It imports an exact title and artist match, and also a single close match (a typo, a subtitle, an extra artist word) when its year is within 1 of the sheet's. Everything else goes to the review page, with candidates ranked by how well title, artist and year fit.

- It takes about 15 minutes for 750 rows if every row matches exactly on the first search. A row that doesn't takes up to 3 more searches with simpler queries (title and artist fields, title only, artist only), so allow longer. It makes at most one MusicBrainz request per second (1.1 s apart), plus a Cover Art Archive check (and a Deezer search when that has no cover) for each new album, so allow longer, and prints progress every 25 rows. Set `MUSICBRAINZ_USER_AGENT` in `.env` first.
- It is safe to re-run or stop. Each row is written in its own transaction. A second run skips rows it already imported, sent to review or that you skipped there, and tries the rows it could not reach again.
- Review the rest at <http://localhost:3000/import> (linked from the home page while items are open). For each item, pick a candidate or search the catalog (the search box runs the same fallback searches as the import), keep it as a manual album, or skip it. After each click the page says what happened, shows how many items are left and scrolls to the next one.
- The spreadsheet is never committed; keep it outside the repo.

Reading the summary the script prints at the end:

- `Imported` rows were matched automatically. `Sent to review` splits into no match, ambiguous and duplicate album match; the rows themselves are on `/import`.
- `Merged duplicates` and `Conflicting placement` (a rank and an honorable mention on one row) name the rows that need a look. Ranks, honorable mentions and decade ranks are read from the sheet but no longer used.
- `Invalid, skipped` rows are left out, each with its reason; fix the sheet and run again.
- `Not reached` rows hit a MusicBrainz error; run the command again to retry them. Ten failures in a row stop the run.

## Backfill covers

`npm run backfill-covers` does two jobs in one run. It fills the cover of library albums saved without one (added before Deezer was a fallback, or while the Cover Art Archive had none), and it checks each album's stored Cover Art Archive link and replaces a dead one (the archive answers 404) with the Deezer cover for an album with the same title and artist, when Deezer has one. Both use the same lookup as adding an album: the Cover Art Archive first, then Deezer. It looks at one album at a time, about one a second (a library of 678 albums takes about 12 minutes; the script says so before it starts), never changes a link that works, and skips albums with no catalog id (manual albums).

- The first summary, `Missing covers`, counts `Filled`, `Still none` (no cover on either service), `Failed` (a lookup failed, so the album is left alone) and `Skipped`. The second, `Cover Art Archive links`, counts `Checked`, `Kept` (the link works), `Replaced`, `Still dead` (dead link and no Deezer match; the link stays), `Failed` and `Skipped` (no catalog id, or a link that is not the album's own). Run it again to retry failed albums. It exits 0 even with failed albums.
- Running it again checks every Cover Art Archive link again, but albums already replaced have a Deezer cover and are not looked at. Set `MUSICBRAINZ_USER_AGENT` in `.env` first; it is sent to the Cover Art Archive. Details are in [the ALBUM-59 spec](docs/superpowers/specs/2026-11-22-album-59-dead-cover-links.md).

## Browser tests

Playwright drives Chromium against a production build of the app on port 3100, with its own SQLite file under `test-results/` and a local stand-in for MusicBrainz, the Cover Art Archive and Deezer (`MUSICBRAINZ_URL`, `COVER_ART_ARCHIVE_URL`, `DEEZER_URL`), so no test calls a live service.

1. One time: `npx playwright install chromium`
2. `npm run test:e2e`

Each test also records what it does in the page (clicks, typing, form submits, route changes) and writes it as `events.json` in that test's folder under `test-results/e2e/`, for the replay renderer. The format is in [docs/event-log-format.md](docs/event-log-format.md). The same recorder runs in `npm run record` ([Record a session](#record-a-session)). The browser injects it; the app's own code never contains it.

Checks:

- `npm test`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run test:e2e` (needs the one-time Chromium install above)

The stack and the reasons for it are in [docs/stack.md](docs/stack.md).
