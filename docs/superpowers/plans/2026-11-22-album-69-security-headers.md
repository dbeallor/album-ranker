# ALBUM-69 security headers: plan

Spec: [2026-11-22-album-69-security-headers.md](../specs/2026-11-22-album-69-security-headers.md)

## Tasks

1. **`lib/security-headers.ts`** (no `server-only`; plain data). Export `securityHeaders({ development }: { development: boolean }): { key: string; value: string }[]` returning the CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy: same-origin`, as in the spec. `'unsafe-eval'` in `script-src` only when `development`. Test `lib/security-headers.test.ts` (one table-driven test, production and development; no HSTS).
2. **`next.config.ts`**: `poweredByHeader: false`; `headers()` sends `X-Robots-Tag` plus `securityHeaders({ development: process.env.NODE_ENV === "development" })` on `/:path*`. Import by relative path with the `.ts` extension only if the config already loads that way (check; otherwise no extension).
3. **`proxy.ts`** `respond()`: set the same headers (read `NODE_ENV` the same way). `proxy.test.ts`: assert the CSP and the other three headers on every existing case.
4. **e2e** `e2e/security-headers.spec.ts`: a page response carries each header and no `x-powered-by`; visiting `/library` and `/matchups` logs no console message containing "Content Security Policy" and no `securitypolicyviolation` event.
5. **`infra/modules/app/main.tf`**: `referrer_policy = "same-origin"`, update the resource comment if it names the old value. `terraform fmt -check` and `terraform validate` only; never apply.
6. Docs: README note if it lists response headers or CloudFront policy (check; skip if nothing stale).

## Verification
`npm test`, `npm run lint`, `npm run typecheck`, `npx playwright test e2e/security-headers.spec.ts` (needs `npm ci` and Chromium), `npm run build` then `curl -I` against `next start` on a spare loopback port. Manual page-by-page check with real covers on a preview, per the spec.
