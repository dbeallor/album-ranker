# As-built: deploy staging from CI

**Shipped:** 2026-11-23 in PR #87
**Spec:** [ALBUM-84](../specs/2026-11-23-album-84-ci-staging-deploy.md)

## What shipped

Every push to `main` builds the app and applies `infra/envs/staging` from `.github/workflows/deploy-staging.yml`, through a GitHub OIDC role from the new `infra/ci` root. The role trusts only `main` of this repo and can change staging only.

## How it differs from the spec

- **Staging IDs may not exist yet.** The staging state has no `response_headers_policy_id` or `origin_access_control_id` until it is applied with the new module, and that apply needs the boundary from `infra/ci`. `infra/ci` reads them with `try()`; without them the role gets no update or delete on those two types. Order: apply `infra/ci`, apply staging by hand, apply `infra/ci` again.
- **The IDs from staging's state are only candidates.** The deploy role can write that state, so `infra/ci` reads each candidate back with the operator's credentials (`data.aws_cloudfront_response_headers_policy` and `data.aws_cloudfront_origin_access_control`, both by id) and a postcondition refuses it unless its name is `album-ranker-staging-security` or `album-ranker-staging` (CloudFront keeps both names unique per account). The provider can't look an origin access control up by name, and a by-name lookup of the headers policy would fail while staging has none, so both go by id with the name check. A planted ID fails the `infra/ci` apply instead of being granted.
- **Reads and create on those two CloudFront types use `Resource: "*"`.** The provider reads a policy back right after creating it, before its ID is known to the role. Update and delete stay scoped by ID.
- **Object access is limited to the assets bucket** (`album-ranker-staging-assets-*/*`), not every staging bucket. Nothing in the module reads the database file, so CI can't either.
- **Create statements for CloudFront distributions and ACM certificates also require the resource to have no `environment` tag yet**, so CI can't re-tag production resources as staging and then change them.
- **State list condition also allows `env:/*`**, since `init` may list workspaces.
- **The `iam:PermissionsBoundary` condition applies to the role actions that change permissions** (create, put and attach), not to `DeleteRole`, `TagRole` or reads. `iam:UpdateAssumeRolePolicy` has its own statement on the function role without it, because IAM probably doesn't evaluate that condition for it; the boundary still caps whoever gets to assume the role.
- **Only the lock file can be deleted in the state bucket** (`s3:DeleteObject` on `staging.tfstate.tflock`); `staging.tfstate` itself is get and put only.
- **Checkout uses `persist-credentials: false`**, and Terraform in CI is pinned to 1.16.5. AWS credentials are configured after the build, just before `terraform init`, and `plan` and `apply` wait up to 5 minutes for the state lock.
- **The role trusts the `main` ref, not the workflow**, so any other workflow on `main` that runs on `issue_comment`, `workflow_run` or `schedule` could assume it too. The README says to keep `deploy-staging.yml` the only one.
- **ARNs of the boundary policy and deploy role are built from their names**, since the mock provider leaves resource ARNs unknown at plan time.
- The deploy policy is an inline policy of about 8,300 characters (limit 10,240), so new statements need room checked.

## Verified

`terraform fmt -check`, `validate` in `infra/ci`, `infra/envs/staging` and `infra/envs/production`, `terraform -chdir=infra/ci test` (14 passed, and broken ways to see the new assertions fail), `actionlint`, `npm test`, `npm run lint`, `npm run typecheck`.

## Known gaps / deferred

- No apply with the role has run; expect an `AccessDenied` or two on the first CI run.
- Tag conditions on CloudFront and ACM reads, and the S3 backend's `init` against the list condition, are untested without AWS.
- The build and the deploy share one job, so a compromised npm dependency could request the OIDC token during `npm ci`. Splitting the build into a job without `id-token` that hands `dist/` to the deploy job would contain that; deferred.
