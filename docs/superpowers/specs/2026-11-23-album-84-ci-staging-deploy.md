# Deploy staging from CI after every merge to main

**Status:** Draft
**Date:** 2026-11-23
**Ticket:** [ALBUM-84](https://github.com/dbeallor/album-ranker/issues/84)

## Goal

Every push to `main` builds the app and applies `infra/envs/staging` from GitHub Actions, so staging always runs the latest `main`. AWS access comes from GitHub OIDC and a deploy role that can change staging and nothing else. Production stays a manual deploy.

## Non-goals

- Deploying production from CI, or any production workflow.
- Running tests, lint or typecheck in CI (separate ticket).
- Moving `infra/dns` or `infra/bootstrap` to CI.
- Changing the app module beyond what the deploy role needs (below: a permissions boundary on the function's role, and two outputs).

## What changes

### 1. A new Terraform root: `infra/ci`

Applied once by hand with the operator's admin profile, like `infra/dns`. State in the existing state bucket under `album-ranker/ci.tfstate` (`backend.hcl` gitignored, `backend.hcl.example` committed, same shape as the other roots).

Inputs (`terraform.tfvars`, gitignored; `terraform.tfvars.example` committed): `region` (same as `backend.hcl`), `state_bucket`, `github_repository` (default `dbeallor/album-ranker`), `zone_id`, `staging_domain` (default `staging.album-ranker.com`), `create_oidc_provider` (default `true`; `false` reads an existing one with a data source, since an account holds only one provider per URL).

It creates:

- **The GitHub OIDC provider** for `https://token.actions.githubusercontent.com`, audience `sts.amazonaws.com`.
- **The deploy role** `album-ranker-ci-staging-deploy`. Trust policy: `sts:AssumeRoleWithWebIdentity` from that provider only, with `aud = sts.amazonaws.com` and `sub = repo:<github_repository>:ref:refs/heads/main` (both `StringEquals`, no wildcards). A PR, a fork, another branch, a tag or another repo gets a different `sub` and is refused. Session length 1 hour.
- **A permissions boundary policy** `album-ranker-staging-function-boundary`: the most the staging function's role may ever do (read and write objects in `album-ranker-staging-data-*`, list that bucket, write to the `/aws/lambda/album-ranker-staging` log group). The app module puts it on the function role (§ 3).
- **The deploy role's policy**, least privilege for what `infra/modules/app` does on staging. Writes are scoped to staging by name, by tag or by record name; reads that can't be scoped are list/describe only and never read object data outside staging:

| Service | Allowed | Scope |
|---|---|---|
| S3 (state) | `GetObject`, `PutObject`, `DeleteObject` | `<state_bucket>/album-ranker/staging.tfstate` and `.tflock` only |
| S3 (state) | `ListBucket` | the state bucket, `s3:prefix` = `album-ranker/staging.tfstate*` |
| S3 (app buckets) | bucket config reads and writes, object reads and writes, create/delete | `album-ranker-staging-*` buckets and their objects |
| Lambda | function and function URL create, update, delete, read, tag | `function:album-ranker-staging` |
| IAM | `CreateRole`, `PutRolePolicy`, `DeleteRolePolicy`, `AttachRolePolicy` and similar | `role/album-ranker-staging` only, and only with `iam:PermissionsBoundary` equal to the boundary above |
| IAM | `PassRole` | `role/album-ranker-staging`, `iam:PassedToService = lambda.amazonaws.com` |
| IAM | deny `DeleteRolePermissionsBoundary`, any write on the boundary policy or on the deploy role itself | explicit `Deny` |
| CloudWatch Logs | log group create, retention, tag, delete, describe | `/aws/lambda/album-ranker-staging` |
| CloudFront | distribution create, update, delete, tag, read | create with `aws:RequestTag/environment = staging`; update, delete and tag with `aws:ResourceTag/environment = staging` |
| CloudFront | function create, update, publish, delete, describe | `function/album-ranker-staging-*` |
| CloudFront | response headers policy and origin access control update and delete | the staging ones only, by ID (§ 2); create is unscoped since these types take no tags |
| CloudFront | `List*`, `Get*` on managed cache and origin request policies | read only |
| ACM (us-east-1) | request with `aws:RequestTag/environment = staging`; delete, tag, describe with `aws:ResourceTag/environment = staging` | certificates |
| Route 53 | `ChangeResourceRecordSets` | the zone, only when every record name is `staging.album-ranker.com` or under it (`route53:ChangeResourceRecordSetsNormalizedRecordNames`, `ForAllValues:StringLike`) |
| Route 53 | `GetHostedZone`, `ListResourceRecordSets`, `GetChange`, `ListTagsForResource` | read only |
| Budgets | view, modify, tag | `budget/album-ranker-staging-monthly` |
| STS | `GetCallerIdentity` | read only |

  The exact action list is settled in the plan from the provider's calls for each resource in `infra/modules/app/main.tf`.
- **Outputs:** `deploy_role_arn`, plus the values to put in GitHub (below).

### 2. Staging IDs for the untaggable CloudFront types

`aws_cloudfront_response_headers_policy` and `aws_cloudfront_origin_access_control` have random IDs and take no tags, so update and delete can only be scoped by ID. `infra/modules/app` gets two outputs (`response_headers_policy_id`, `origin_access_control_id`), `infra/envs/staging` passes them on, and `infra/ci` reads them with `terraform_remote_state` from `album-ranker/staging.tfstate`. Staging is deployed today, so they exist. If staging ever replaces one, re-apply `infra/ci` (README says so).

### 3. Permissions boundary on the function role

`infra/modules/app` gets an optional `permissions_boundary_arn` (default `null`), set on `aws_iam_role.app`. `infra/envs/staging` sets it to the ARN built from the account ID and the fixed boundary name; production leaves it `null`. Without it the deploy role could give the staging function's role any permission and then run code as it, which would reach production. Order: apply `infra/ci` first (creates the boundary), then one manual staging apply that adds the boundary, then CI takes over.

### 4. The workflow: `.github/workflows/deploy-staging.yml`

- Triggers: `push` to `main`, and `workflow_dispatch` (still only `main`: the trust policy refuses any other ref).
- `permissions: { id-token: write, contents: read }`.
- `concurrency: { group: deploy-staging, cancel-in-progress: false }`. The S3 lock file stays as the second guard.
- Steps, every third-party action pinned to a full commit SHA with the version in a comment:
  1. `actions/checkout` (full SHA is `github.sha`, so `build-info.json` records the merge commit).
  2. `actions/setup-node` with `node-version-file: .nvmrc` and npm cache.
  3. `hashicorp/setup-terraform` at 1.10 or newer (pinned version), `terraform_wrapper: false`.
  4. `aws-actions/configure-aws-credentials` with `role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}` and `aws-region: ${{ vars.AWS_REGION }}`.
  5. `npm ci`, `npm run build:lambda`.
  6. `terraform init -input=false -backend-config="bucket=${{ vars.TF_STATE_BUCKET }}" -backend-config="region=${{ vars.AWS_REGION }}"` in `infra/envs/staging`.
  7. `terraform plan -input=false -out=tfplan`, then `terraform apply -input=false tfplan`. A plan error stops the run before anything changes.
  8. Print `url` and `deployed_commit` (`output -raw`), never `password`. Fail the run if `deployed_commit` isn't `github.sha`.
- Inputs as `TF_VAR_` environment variables: `TF_VAR_region` from `vars.AWS_REGION` (the same variable as the backend region, so they can't drift), `TF_VAR_zone_id` from `vars.ZONE_ID`, `TF_VAR_musicbrainz_user_agent` and `TF_VAR_budget_email` from secrets (both hold an email address).

GitHub repository settings the operator sets once (README lists them; `infra/ci` outputs the values): variables `AWS_DEPLOY_ROLE_ARN`, `AWS_REGION`, `TF_STATE_BUCKET`, `ZONE_ID`; secrets `MUSICBRAINZ_USER_AGENT`, `BUDGET_EMAIL`.

### 5. Docs

- README: "Deploy staging" says CI deploys every merge to `main` and keeps the manual commands as the fallback; a new "Set up the CI deploy (once)" section covers `infra/ci`, the one manual staging apply, the GitHub variables and secrets, and re-applying `infra/ci` if staging's response headers policy or origin access control is replaced. "Promote to production" says to build `dist/` from the commit staging runs (`output deployed_commit`).
- `docs/agents/project.md` § Environments and deploy: staging deploys from CI on every merge to `main`; production is still manual; agents still don't apply.

## Calls I made

- **A new root `infra/ci`, not `infra/bootstrap`.** Bootstrap keeps local state and does one job; the deploy role changes more often and belongs in the shared state bucket like `infra/dns`.
- **Trust on `ref:refs/heads/main`, not a GitHub `staging` environment.** An environment's branch rule lives in repo settings, where it can be loosened without a PR. Pushing to `main` is already the gate. Adding an environment later only changes the `sub` string.
- **A permissions boundary on the staging function role (an app module change).** The ticket limits module changes to what the deploy role needs; without the boundary the role could escalate to production through the function role, which breaks the "can't change production" acceptance. Production's role stays without one.
- **Two new module outputs for CloudFront IDs**, read by `infra/ci` through remote state, so the role can't update or delete production's response headers policy or origin access control. Create stays unscoped for those two types (creating one doesn't touch production).
- **`plan -out` then `apply` of the plan**, not `apply -auto-approve`. Same effect, and nothing changes when planning fails.
- **The run fails if `deployed_commit` doesn't match `github.sha`.** Makes the first acceptance item checked on every run.
- **The MusicBrainz User-Agent and budget email are secrets**, the rest repository variables: those two carry an email address and would otherwise show in logs.
- **`workflow_dispatch` added** for a re-run of `main` without a new merge.
- **Actions pinned to commit SHAs** (supply chain).
- **`create_oidc_provider` switch**, since the account may already have a GitHub OIDC provider.
- **"Previous deploy keeps serving" covers failures before apply** (build, init, plan). An apply that fails half way can leave staging between two builds, as a manual apply can; the next merge or a re-run repairs it. Not solved here.

## Success criteria

- `terraform fmt -check -recursive infra` and `terraform validate` (after `init -backend=false`) pass for `infra/ci`, `infra/envs/staging`, `infra/envs/production`.
- `actionlint` passes on the workflow (via `npx`/`go run`/`brew` if available, else noted under Not proven).
- The trust policy and the deploy policy are checked by a small table-driven test of the rendered JSON (`terraform console` or a `terraform plan -out` with mock inputs is not possible without AWS; the plan picks the cheapest offline check, e.g. a Terraform `check`/`tftest` with `mock_provider`).
- `npm test`, `npm run lint`, `npm run typecheck` still pass.

### Not provable without AWS (goes under Not proven in the PR)

- An apply with the role succeeds (the ticket's "check this by applying with the role"): the user runs `infra/ci` and the first CI deploy. Missing actions show up as `AccessDenied` in that run and get a follow-up fix.
- `deployed_commit` equals the merge commit after a real merge; two quick merges run one after the other.
- The role is refused for a PR branch, and for production state and resources.
