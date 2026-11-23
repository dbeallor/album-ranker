# As-built: deploy staging from CI

**Shipped:** 2026-11-23 in PR #87
**Spec:** [ALBUM-84](../specs/2026-11-23-album-84-ci-staging-deploy.md)

## What shipped

Every push to `main` builds the app and applies `infra/envs/staging` from `.github/workflows/deploy-staging.yml`, through a GitHub OIDC role from the new `infra/ci` root. The role trusts only `main` of this repo and can change staging only.

## How it differs from the spec

- **Staging IDs may not exist yet.** The staging state has no `response_headers_policy_id` or `origin_access_control_id` until it is applied with the new module, and that apply needs the boundary from `infra/ci`. `infra/ci` reads them with `try()`; without them the role gets no update or delete on those two types. Order: apply `infra/ci`, apply staging by hand, apply `infra/ci` again.
- **Reads and create on those two CloudFront types use `Resource: "*"`.** The provider reads a policy back right after creating it, before its ID is known to the role. Update and delete stay scoped by ID.
- **Object access is limited to the assets bucket** (`album-ranker-staging-assets-*/*`), not every staging bucket. Nothing in the module reads the database file, so CI can't either.
- **Create statements for CloudFront distributions and ACM certificates also require the resource to have no `environment` tag yet**, so CI can't re-tag production resources as staging and then change them.
- **State list condition also allows `env:/*`**, since `init` may list workspaces.
- **The `iam:PermissionsBoundary` condition applies to the role actions that change permissions or trust**, not to `DeleteRole`, `TagRole` or reads.
- **Checkout uses `persist-credentials: false`**, and Terraform in CI is pinned to 1.16.5.
- **ARNs of the boundary policy and deploy role are built from their names**, since the mock provider leaves resource ARNs unknown at plan time.
- The deploy policy is an inline policy of about 8,000 characters (limit 10,240), so new statements need room checked.

## Verified

`terraform fmt -check`, `validate` in `infra/ci`, `infra/envs/staging` and `infra/envs/production`, `terraform -chdir=infra/ci test` (12 passed, and broken nine ways to see it fail), `actionlint`, `npm test`, `npm run lint`, `npm run typecheck`.

## Known gaps / deferred

- No apply with the role has run; expect an `AccessDenied` or two on the first CI run.
- Tag conditions on CloudFront and ACM reads, and the S3 backend's `init` against the list condition, are untested without AWS.
