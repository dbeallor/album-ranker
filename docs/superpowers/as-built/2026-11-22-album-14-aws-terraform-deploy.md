# As-built: Deploy to AWS with Terraform

**Shipped:** in PR #63
**Ticket:** ALBUM-14
**Spec:** [2026-11-22-album-14-aws-terraform-deploy.md](../specs/2026-11-22-album-14-aws-terraform-deploy.md)

## Differs from the spec

- The spec doesn't name the origin secret. It is the `ORIGIN_SECRET` setting, sent by CloudFront as the `x-origin-secret` header. A deployed server without it answers 403 to everything.
- Reserved concurrency is the variable `reserved_concurrency` (default 1). AWS requires a large unreserved quota to reserve any, so a new account's first apply can fail; set it to `-1` and the conditional S3 write is then the only guard against two writers. The README says so.
- The data bucket has `prevent_destroy`, so `terraform destroy` fails at plan time (the spec said only while it holds data). The README says how to tear down on purpose.
- A free CloudFront viewer-request function copies `Host` into `x-forwarded-host`, and the login redirect builds its address from `x-forwarded-host`. Both are needed so redirects and server actions work behind CloudFront. The spec lists neither.
- The guessing limit keys on `x-viewer-ip`, which the same CloudFront function sets from the viewer's address (overwriting anything the viewer sends), because the managed origin request policy doesn't forward `CloudFront-Viewer-Address`.
- An unknown or empty `DEPLOY_ENV` throws at startup instead of counting as local.
- A failed login redirects to `/login?error=wrong|locked` and the page maps the code to a fixed message, instead of showing a server action's returned text.
- The proxy covers everything except `/_next/static`. A request counts as a page (redirect to login) when it is a GET or HEAD that accepts HTML; anything else gets 401.
- `safeNext` also rejects `/\host`, control characters and `/login` itself.
- Responses are buffered whole until the upload finishes, so the response is held until the change is in S3. A failed conditional write gives a 503 "not saved" page.
- A stored database with pending migrations is migrated on load and uploaded straight away.
- `lambda/server.ts` wraps the Next.js listener, and the sync's connection is the one `getDb()` returns in S3 mode (shared through `globalThis`).
- Changes are detected with `total_changes()`.
- The Lambda zip is built by `npm run build:lambda`, using the Lambda Web Adapter layer v30 (a variable) with a `run.sh` handler. The readiness check is TCP so it doesn't go through the sync wrapper.
- Extra tests beyond the spec's list: `requireSession`, the login action, and a guard that every server action starts with `await requireSession()`.

## Differs from the spec's domain section

- `zone_id` is a plain variable in each environment's `terraform.tfvars`, copied from `terraform -chdir=infra/dns output -raw zone_id`, rather than `terraform_remote_state` (no cross-state read permissions). `domain_name` is a variable too, defaulting to `album-ranker.com` in production and `staging.album-ranker.com` in staging.
- The module declares the provider alias `aws.us_east_1` (`configuration_aliases`), and each environment root defines it and passes it in, so the certificate is in us-east-1 even when `region` is not.
- The module's `url` output is `https://<domain_name>`; the new `cloudfront_url` output is the `*.cloudfront.net` address. Both environment roots output both.
- The response headers policy is one resource per environment, attached to both cache behaviors. HSTS is one year with neither `includeSubdomains` nor `preload`, so staging and production stay independent; the other headers are `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` and `X-Frame-Options: DENY`, each overriding anything the origin sends.
- `infra/dns` takes the variables `region` and `domain`, both defaulted, with an optional `terraform.tfvars.example`.
- The app needed no change for the domain: server actions and the login redirect already use `x-forwarded-host`, which the CloudFront function sets from the viewer's `Host`, and the session cookie sets no `Domain`.
- Not proven: real DNS delegation, certificate validation and the first apply on the domain (no `terraform apply` was run). `terraform validate` passes for every root.
