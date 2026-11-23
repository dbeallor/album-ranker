# ALBUM-84 plan: deploy staging from CI

Spec: [2026-11-23-album-84-ci-staging-deploy.md](../specs/2026-11-23-album-84-ci-staging-deploy.md). Work in this worktree on `infra/album-84-ci-staging-deploy`. Never run `terraform apply` or `destroy`, and never touch AWS; `fmt`, `init -backend=false`, `validate` and `test` with mock providers are fine. No secrets, no `*.tfvars`, no `backend.hcl`, no state in commits.

## Task 1: app module changes (`infra/modules/app`, `infra/envs/staging`, `infra/envs/production`)

- `variables.tf`: add `permissions_boundary_arn` (string, default `null`).
- `main.tf`: set `permissions_boundary = var.permissions_boundary_arn` on `aws_iam_role.app`.
- `outputs.tf`: add `response_headers_policy_id` (from `aws_cloudfront_response_headers_policy.security.id`) and `origin_access_control_id` (from `aws_cloudfront_origin_access_control.assets.id`).
- `infra/envs/staging/main.tf`: pass `permissions_boundary_arn = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/album-ranker-staging-function-boundary"` (add the data source). `outputs.tf`: re-export the two new IDs. Production: no change (boundary stays null); it need not re-export the IDs.
- Verify: `terraform fmt -check -recursive infra`; `terraform -chdir=infra/envs/staging init -backend=false && validate`; same for production.

## Task 2: `infra/ci` root

Files: `main.tf`, `variables.tf`, `outputs.tf`, `backend.hcl.example`, `terraform.tfvars.example`, `README`-style comments at the top of `main.tf` (match `infra/dns/main.tf` style: aws provider `~> 6.73`, `required_version >= 1.10`, s3 backend with `key = "album-ranker/ci.tfstate"`, `encrypt`, `use_lockfile`).

- Variables per spec: `region`, `state_bucket`, `github_repository` (default `dbeallor/album-ranker`), `zone_id`, `staging_domain` (default `staging.album-ranker.com`), `create_oidc_provider` (default `true`).
- Resources: OIDC provider (or data source when `create_oidc_provider = false`); `aws_iam_role` `album-ranker-ci-staging-deploy` with trust exactly: `sts:AssumeRoleWithWebIdentity`, principal the provider, `StringEquals` on `token.actions.githubusercontent.com:aud = sts.amazonaws.com` and `:sub = repo:<github_repository>:ref:refs/heads/main`, `max_session_duration = 3600`; boundary policy `album-ranker-staging-function-boundary`; the deploy policy as the spec's table (separate `aws_iam_policy_document` statements, one per row, with the spec's conditions; include the explicit Deny statements).
- `terraform_remote_state` on `album-ranker/staging.tfstate` (bucket `var.state_bucket`, region `var.region`) for the two CloudFront IDs.
- The exact action lists come from what `infra/modules/app/main.tf` and the provider need for each resource it declares (read the module; include the Read/Describe/List/Get calls the AWS provider issues on refresh, e.g. `s3:GetBucket*`, `lambda:GetFunction*`, `iam:GetRole*`, `cloudfront:GetDistribution`, `acm:DescribeCertificate`). Where a service needs `Resource: "*"` (List/Describe), allow read only and add a comment saying why.
- Outputs: `deploy_role_arn`, `aws_region`, `state_bucket`, `zone_id` (the values for the GitHub variables).
- Verify: `fmt`, `init -backend=false`, `validate`.

## Task 3: offline policy test

`infra/ci/ci.tftest.hcl` with `mock_provider "aws"` (and a mocked remote state via `override_data`), `command = plan`, asserting on the rendered JSON policies:
- Trust policy: one statement, `sub` equals `repo:dbeallor/album-ranker:ref:refs/heads/main`, `aud` equals `sts.amazonaws.com`, no `*` in either; table-driven over a changed `github_repository` value.
- Deploy policy: no statement allows an action on a resource containing `production`; every `iam:*` allow statement is limited to the staging role ARN; the explicit Deny for the boundary and deploy role is present; state access is limited to `album-ranker/staging.tfstate*`.
- Run: `terraform -chdir=infra/ci test`. If mock providers can't render a check, assert on the policy document data sources instead and say so in the report.

## Task 4: workflow

`.github/workflows/deploy-staging.yml` exactly per spec § 4: `push` to `main` plus `workflow_dispatch`; `permissions: id-token: write, contents: read`; `concurrency: group: deploy-staging, cancel-in-progress: false`; actions pinned to full commit SHAs (look each SHA up with `gh api repos/<owner>/<repo>/git/ref/tags/<tag>` through `~/.collective-wisdom/scripts/gh.sh`, tag in a comment); `plan -out` then `apply tfplan`; print `url` and `deployed_commit` only (never `password`); fail if `deployed_commit` is not `github.sha`; `TF_VAR_*` from variables and secrets. Do not echo secrets; add `::add-mask::` is not needed for secrets.
- Verify: `actionlint .github/workflows/deploy-staging.yml`.

## Task 5: docs

README "Deploy staging" and a new "Set up the CI deploy (once)" section (apply `infra/ci` with the operator's profile, one manual staging apply to add the boundary, set the four variables and two secrets, re-apply `infra/ci` if staging replaces its response headers policy or origin access control); "Promote to production" builds from the commit staging runs. `docs/agents/project.md` § Environments and deploy: staging deploys from CI on every merge to `main`, production stays manual, agents still never apply. `.gitignore` already covers `*.tfvars`, `backend.hcl` and state.

## Final verification

`terraform fmt -check -recursive infra`, validate in `infra/ci`, `infra/envs/staging`, `infra/envs/production`, `terraform -chdir=infra/ci test`, `actionlint`, `npm test`, `npm run lint`, `npm run typecheck`. Commit per task (`infra:` prefix) and push the branch.
