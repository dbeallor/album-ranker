# Deploy to AWS with Terraform, staging and production behind a password gate

**Status:** Shipped
**Shipped:** in PR #63, with differences: [as-built](../as-built/2026-11-22-album-14-aws-terraform-deploy.md)
**Date:** 2026-11-22
**Ticket:** [ALBUM-14](https://github.com/dbeallor/album-ranker/issues/14)
**Follows:** [MVP requirements](2026-11-20-album-ranker-mvp.md) § Shape (deploying is a follow-up), [data model and storage](2026-11-21-album-4-data-model-storage.md), [stack](../../stack.md)
**Replaces:** the unmerged Fly.io spec on branch `feat/album-14-deploy-password-gate` (commit b0e86b7). The ticket now asks for AWS and Terraform; the password gate design carries over.

## Goal

Put the app on AWS in two environments, staging and production, each with its own HTTPS address, its own SQLite file and its own password, so a phone and a laptop see the same rankings. Every AWS resource is defined in Terraform in this repo. Idle cost is close to zero: nothing is billed by the hour.

## The shape

```
browser ──HTTPS──> CloudFront (*.cloudfront.net)
                     ├─ /_next/static/*  ──> S3 assets bucket (build files, no data)
                     └─ everything else  ──> Lambda function URL ──> Next.js server (one copy)
                                                                       │  /tmp/album-ranker.db
                                                                       └─ syncs with ──> S3 data bucket (versioned)
```

One stack like this per environment, built from the same Terraform module.

## Choosing the compute

The app is one Node process with one SQLite file. The file has to survive restarts and redeploys, there must be one writer, and the ticket asks for pay-per-use billing.

| Option | Durable SQLite | HTTPS without a domain | Idle cost, both environments | Verdict |
|---|---|---|---|---|
| **Lambda + SQLite file synced to S3** | S3 object, versioned; the function works on a copy in `/tmp` | CloudFront default address | about $0 to $0.20 a month | **Chosen** |
| Lambda + EFS | EFS file, but SQLite's WAL mode doesn't work on network file systems, and a function in a VPC needs a NAT gateway (about $33 a month each) to reach MusicBrainz and Deezer | CloudFront | about $66 a month | Ruled out by NAT cost |
| EC2 t4g.nano + EBS | Instance disk | Needs a domain for a certificate, or an unencrypted CloudFront-to-origin hop | about $15 a month (instance, disk, public IPv4) | Always on; fallback if Lambda falls through |
| ECS Fargate + EFS + load balancer | EFS | Load balancer | about $50 a month and up | Always on, costly |
| Lightsail instance | Instance disk | Needs a domain or a $18 load balancer | about $10 a month | Always on |

**How Lambda meets one copy, one writer, durable file.**

- **One copy.** The function has reserved concurrency 1, so AWS runs at most one copy at a time. Lambda also hands that copy one request at a time.
- **Durable file.** The database lives in S3 as a single SQLite file. On the first request after a cold start, the server downloads it to `/tmp`, opens it, and applies pending migrations.
- **Writes land before the response.** A small wrapper around the Next.js server watches SQLite's change count. When a request changed the database, before the response finishes, it writes a clean copy with `VACUUM INTO` (which includes what's still in the WAL file) and uploads it with a conditional write (`If-Match` on the ETag it last saw). If the upload fails, the request fails and the copy in `/tmp` is thrown away, so the app never shows a change that isn't in S3.
- **One writer, even if something goes wrong.** The conditional write only succeeds if nobody replaced the file since this copy read it. A restore or a second copy would make it fail instead of silently overwriting. Before each request the wrapper also checks the S3 ETag (one small request, about 20 ms), and reloads if the file changed, so a restore takes effect on the next page load.

**What it costs.**

- **Cold starts.** After about 5 to 15 minutes idle, the first request takes about 1 to 3 seconds longer (Lambda start, Next.js boot, file download). Later requests run warm.
- **Parallel requests are refused.** With one copy, a second request that arrives while one is running gets a 429. Static files come from S3 rather than the function, and links don't prefetch (see The app changes), so a single user rarely sends two at once. If it happens, the page or action fails and works on retry.
- **Every write uploads the whole file.** The database is a few MB at most. Each upload takes tens of milliseconds and costs $0.000005.
- **Long jobs don't run in the function.** The spreadsheet import (`npm run import`) and `npm run backfill-covers` run on your machine against a local file, which you then upload as a restore. The function times out at 30 seconds.

If any of this proves wrong in the build (for example the Node 24 runtime or `node:sqlite` misbehaves on Lambda), the build stops with `BLOCKED:` and proposes the EC2 fallback rather than switching on its own.

## AWS components and cost

Prices are us-east-1 list prices as I know them, rechecked in the build. "Free tier" means the always-free allowance, which is per account and shared by both environments.

| Component | Per environment | Billed by | Idle cost, staging | Idle cost, production |
|---|---|---|---|---|
| Lambda function (arm64, 1 GB, Node 24, Lambda Web Adapter layer) | 1 | Requests and GB-seconds; 1M requests and 400,000 GB-s a month free | $0 | $0 |
| Lambda function URL | 1 | Free | $0 | $0 |
| CloudFront distribution | 1 | Requests and data out; 10M requests and 1 TB a month free | $0 | $0 |
| S3 data bucket (versioned, old versions expire after 30 days) | 1 | Storage and requests | under $0.01 | under $0.01 |
| S3 assets bucket (build files) | 1 | Storage and requests | under $0.01 | under $0.01 |
| CloudWatch log group (14-day retention) | 1 | Log data ingested and stored | under $0.05 | under $0.05 |
| IAM role and policies | 1 | Free | $0 | $0 |
| AWS Budgets alert (optional, emails you above $5 a month) | 1 | First two budgets free | $0 | $0 |
| **Total** | | | **about $0.05** | **about $0.05** |

Shared, created once by the bootstrap step:

| Component | Billed by | Idle cost |
|---|---|---|
| S3 state bucket (versioned, encrypted, holds both environments' Terraform state) | Storage and requests | under $0.01 |

**Always-on, idle-billed components: none.** Every component above bills by request or by storage used. Light use (a few hundred page loads and matchups a month) stays inside the free allowances. New accounts on AWS's credit-based free plan get the same always-free allowances for Lambda and CloudFront; the build rechecks this.

## Terraform

- **Layout.** `infra/bootstrap/` creates the state bucket. `infra/modules/app/` defines every resource of one environment. `infra/envs/staging/` and `infra/envs/production/` each call the module with their own variables and their own state.
- **State.** Kept in the S3 state bucket, encrypted, versioned, with Terraform's S3 native locking (`use_lockfile`, Terraform 1.10 or newer; no DynamoDB table). Staging's state is at `album-ranker/staging.tfstate`, production's at `album-ranker/production.tfstate`. The bootstrap step's own state is local (`infra/bootstrap/terraform.tfstate`, gitignored); it holds only the bucket's name and settings. That bucket is the one resource that can't keep its state in itself.
- **Separation.** Every resource name starts with `album-ranker-<env>-`. Each environment's IAM role can read and write only its own data bucket. Separate state files mean an apply in one environment can't change the other's resources.
- **Secrets.** Terraform generates each environment's password and the CloudFront-to-function secret with `random_password` and passes them to the function as environment variables. They live only in the encrypted state and the function's config. You read the password with `terraform output -raw password`. A new password: `terraform apply -replace=module.app.random_password.app`.
- **Variables.** `region` (default `us-east-1`), `environment`, `musicbrainz_user_agent` (holds your contact email), `budget_email` (optional). They go in `terraform.tfvars` in each env folder, which is gitignored; a `terraform.tfvars.example` is committed. The state bucket name goes in a gitignored `backend.hcl`, from the bootstrap output.
- **Gitignore additions.** `*.tfstate`, `*.tfstate.*`, `.terraform/`, `*.tfvars` (except the examples), `backend.hcl`, `dist/`. The `.terraform.lock.hcl` provider lock files are committed.

## How a version reaches an environment

1. `npm run build:lambda` builds Next.js with `output: "standalone"` and assembles `dist/lambda/` (server, migrations, the sync wrapper, the start script) and `dist/static/` (the `/_next/static` files), with `dist/build-info.json` naming the git commit.
2. `terraform -chdir=infra/envs/staging apply` zips `dist/lambda/`, updates the function when the zip changed, uploads changed static files to the assets bucket, and outputs the address and the deployed commit.
3. **Promote:** after checking staging, `terraform -chdir=infra/envs/production apply` with the same `dist/` (don't rebuild in between). Its plan shows the same commit as staging.

Not done through Terraform: the build in step 1 (Terraform packages the files it produces), creating the AWS account and your credentials, and copying database files for backup and restore (data, not infrastructure). HTML isn't cached by CloudFront and build files have unique names, so no cache invalidation is needed.

## The password gate

- **Config.** `APP_PASSWORD` holds the password. `.env.example` documents it.
- **Deployed environments fail closed.** Terraform sets `DEPLOY_ENV` to `staging` or `production`. When `DEPLOY_ENV` is set and `APP_PASSWORD` is unset, empty or shorter than 12 characters, the server refuses to start, with a message naming the setting, and the proxy answers every request with 503 if it is reached anyway. This applies to staging too.
- **Local runs.** Without `DEPLOY_ENV`, there is no gate unless `APP_PASSWORD` is set, as today. `npm run dev`, `npm run preview` and the browser tests are unchanged. Setting `APP_PASSWORD` in `.env` turns the gate on locally for testing.
- **Where it runs.** A Next.js Proxy (`proxy.ts`, Node runtime by default in Next.js 16) runs on every request to the function except `/login`. Without a valid session cookie, a page request redirects to `/login?next=<path>`, and any other request (server actions, RSC requests) gets 401. The server actions also call a `requireSession()` helper from `lib/auth/`, since the Next.js docs warn that proxy coverage alone can lapse when a route moves.
- **Only CloudFront reaches the function.** The function URL is public (AWS's signed-origin option breaks POST requests such as server actions), so CloudFront adds a secret header and, when `DEPLOY_ENV` is set, the proxy answers 403 to any request without it.
- **What isn't gated.** The `/_next/static` build files come straight from S3 through CloudFront. They are the app's JavaScript and CSS, the same for everyone, with no albums, rankings or covers in them.
- **Login page.** `/login` has one password field and a submit button. A server action checks the password. On success it sets the session cookie and redirects to `next` if it is a path on this site (starts with `/`, not `//`), else `/`. On failure it shows "Wrong password." after a one-second pause.
- **Guessing limit.** After 10 wrong passwords from one client IP within 15 minutes, the login refuses further tries from that IP for 15 minutes ("Too many tries. Wait 15 minutes."). The IP comes from the `CloudFront-Viewer-Address` header, which CloudFront sets; without it (local runs) all tries share one bucket. Counts live in memory and reset on a cold start. The generated password is 24 random characters, so this is a backstop.
- **Session cookie.** Named `album_session`, value `<expiry>.<signature>`, where the signature is an HMAC-SHA256 of the expiry keyed from `APP_PASSWORD` and `DEPLOY_ENV`. It is `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` when deployed, and lasts 90 days. Each environment has its own address and its own key, so a staging cookie never works on production. Changing the password signs every device out. No accounts, no session table.
- **Comparisons are constant time.** The password, signature and origin-secret checks compare with `crypto.timingSafeEqual` on fixed-length digests.
- **Not indexed.** Every response from the function carries `X-Robots-Tag: noindex, nofollow`.

## The app changes

- **Storage mode.** When `DATABASE_S3_BUCKET` and `DATABASE_S3_KEY` are set, the database syncs with S3 as described above; `DATABASE_PATH` points into `/tmp`. Without them nothing changes. The sync uses `@aws-sdk/client-s3`, the one new runtime dependency.
- **A file that won't open.** If the downloaded file isn't a SQLite database with a `schema_migrations` table, the server serves an error page saying the stored database can't be opened, logs why, and changes nothing in S3. A missing object means a fresh environment: the server creates an empty database and uploads it.
- **Pre-migrate backup.** In storage mode the existing pre-migrate backup is skipped: S3 versioning already keeps the version before the migration.
- **Links don't prefetch.** Links in the app set `prefetch={false}`, so a page load doesn't send several requests to the one copy at once. A test keeps new links from forgetting it. Locally this makes navigation a little slower to start; nothing else changes.

## Backup and restore

- **Automatic.** Every write replaces the S3 object, and versioning keeps each previous version for 30 days. Because each version is a `VACUUM INTO` copy, it is a complete database with nothing left in a WAL file.
- **Manual backup.** `aws s3 cp s3://<data bucket>/album-ranker.db ./staging-backup.db`. Terraform outputs the bucket name. The file opens with the local app (`DATABASE_PATH=./staging-backup.db npm run dev`).
- **Restore.** `aws s3 cp ./backup.db s3://<data bucket>/album-ranker.db`. The running copy sees the new ETag on its next request and loads it; a cold copy loads it on start. The replaced version stays in the bucket's version history.
- **Undo a restore.** The README lists the bucket's versions with `aws s3api list-object-versions` and copies the one you want back.
- **Moving local data up.** The same restore command uploads your local `data/album-ranker.db` (take a `npm run db:backup` first, then upload the backup file, so nothing is left in a WAL file).

## README

A new "Deploy to AWS" section after "Run the app":

1. **What you set up first:** an AWS account, the AWS CLI with a profile that can create these resources (`aws configure sso` or an access key, on your machine only), and Terraform 1.10 or newer.
2. **Bootstrap once:** `terraform -chdir=infra/bootstrap init && terraform -chdir=infra/bootstrap apply`, then write its bucket output into each env's `backend.hcl`.
3. **Deploy staging:** copy `terraform.tfvars.example` to `terraform.tfvars`, `terraform init -backend-config=backend.hcl`, `npm run build:lambda`, `terraform apply`, then `terraform output url` and `terraform output -raw password`.
4. **Promote to production:** the same apply in `infra/envs/production` with the same build.
5. **Back up, restore, undo a restore** as above.
6. **Tear down:** `terraform destroy` per environment (the data bucket refuses to be destroyed while it holds data, so an accidental destroy can't delete your rankings; the README says how to empty it first on purpose).

"Run the app" gains the optional `APP_PASSWORD` line. `docs/stack.md` gains Hosting, Infrastructure and Auth rows. `docs/agents/project.md` § Environments and deploy names the two environments and the deploy commands.

## Tests

One table-driven test per rule, in Vitest:

- **Session token:** a fresh token passes; expired, tampered, malformed, empty, signed with another password, and signed for another environment all fail.
- **Redirect target:** `/`, `/search?q=x` pass; `//evil.example`, `https://evil.example`, `javascript:...`, empty and missing fall back to `/`.
- **Gate decision** (the pure function the proxy calls): `/login` passes; no cookie gives a redirect for pages and 401 for other requests; a valid cookie passes; deployed without a password gives 503; deployed without the origin secret gives 403; local without a password passes.
- **Guessing limit:** the 10th failure locks, the 11th try is refused, a lock lifts after 15 minutes, IPs are counted apart.
- **Config:** with `DEPLOY_ENV` set, `APP_PASSWORD` unset, empty and short throw with the setting's name; without it, unset means no gate.
- **S3 sync** (against an in-memory fake of the S3 calls): a cold start downloads and opens the file; a missing object creates and uploads an empty database; a request that writes uploads with `If-Match`; a read-only request uploads nothing; a failed conditional write fails the request and drops the local copy; a changed ETag reloads before the request; an invalid file leaves S3 untouched.
- **No prefetch:** every `Link` in `app/` and `components/` sets `prefetch={false}`.

In the build: `terraform fmt -check` and `terraform validate` for every root, and a `terraform plan` against your account if credentials are set up. A local run of the Lambda package (the start script with a local S3 stand-in, or against a real staging apply if you approve it) checks: no cookie redirects to `/login`, a wrong password is refused, the right one lets you in, a write survives a restart.

## Acceptance

- Staging and production each ask for their own password and show nothing without it.
- Both are served over HTTPS on their CloudFront addresses.
- A change made on one device shows on another after reload, in each environment.
- A change made in staging does not show in production.
- Every AWS resource of both environments is defined in Terraform, and the README steps create a fresh copy of each environment with Terraform alone, beyond the account setup the README lists.
- The README steps restore a database file copied from a running environment.
- Deployed environments refuse to start without a password of 12 characters or more.
- No AWS credential, secret, `.env` file, Terraform state file, `.tfvars` file or database file is committed.

## Non-goals

- Creating the AWS account or handling its credentials.
- A custom domain (the CloudFront addresses are enough; adding one later is a certificate and an alias in the module).
- Automatic deploys on merge or CI.
- Accounts, multiple users, sharing, a sign-out button (a new password signs everyone out).
- Running the spreadsheet import or the cover backfill inside AWS.
- Any album, ranking or rating features. Local previews (#20) and browser test runs (#19).

## Calls I made

- **Lambda with the SQLite file kept in S3, not a server with a disk.** It is the only option I found with no idle bill (about $0.10 a month for both environments versus about $15 for the cheapest always-on server). The price is a 1 to 3 second cold start after idle, the occasional refused parallel request, and a whole-file upload on every write. EC2 is the fallback if you'd rather pay for always-on.
- **Reserved concurrency 1, so at most one copy runs.** This keeps the ticket's one-copy rule exactly. A second request arriving mid-request gets a 429 and works on retry.
- **Links no longer prefetch,** in every environment including local, so the one copy isn't sent several requests per page.
- **The first `terraform apply` is yours unless you approve me running it.** It creates billable resources in your account with your credentials. The build delivers the Terraform, the gate, the packaging and the README, and proves them with `validate`, `plan` and a local run. Live checks (both passwords, two devices, staging apart from production) go under Not proven in the PR. Say "deploy it" in the approval and I'll apply staging and production with the AWS profile on this machine.
- **Terraform generates the passwords** (24 random characters each), so you never type one into a file. You read them with `terraform output`. They sit in the encrypted state and the function's config.
- **Secrets as Lambda environment variables,** not Secrets Manager ($0.40 per secret a month) or Parameter Store lookups at cold start. Anyone with console access to your account can read them; that's you.
- **A login page with a 90-day cookie, not HTTP Basic Auth.** Phone browsers forget Basic Auth and ask again often.
- **The gate applies when `DEPLOY_ENV` is set,** not on `NODE_ENV=production`, so `npm run preview` (which runs a production build) keeps working without a password.
- **Build files are served without the password.** They hold no personal data, and serving them from S3 keeps page loads from hitting the one copy.
- **Backup and restore are `aws s3 cp` commands** on the data bucket, with S3 versioning as the automatic backup (30 days). They copy data, not infrastructure, so they don't break the Terraform-only rule.
- **`us-east-1` as the default region.** Change `region` in `terraform.tfvars` before the first apply.
- **Zip package with the Node 24 managed runtime and the Lambda Web Adapter layer,** not a container image, so deploying needs no Docker and no image registry.
- **Bootstrap state stays local** on your machine (gitignored); everything else keeps state in the S3 bucket it creates.
- **An optional $5 monthly budget alert** emails you if the bill grows. Leave `budget_email` empty to skip it.
- **Minimum password length 12, 10 wrong tries per IP per 15 minutes, then a 15-minute lockout,** carried over from the Fly spec.
- **The data bucket can't be destroyed while it holds data,** so `terraform destroy` never deletes your rankings by accident.
- **No health check route,** so nothing skips the gate.
