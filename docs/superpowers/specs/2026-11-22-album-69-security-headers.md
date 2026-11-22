# Security headers and no X-Powered-By

**Status:** Shipped
**Shipped:** in PR #76, as specified
**Date:** 2026-11-22
**Ticket:** [ALBUM-69](https://github.com/dbeallor/album-ranker/issues/69)
**Follows:** [ALBUM-64 security sweep report](2026-11-22-album-64-security-sweep-report.md) (findings S5 to S8)

## Goal

Every response from the app carries a Content-Security-Policy and the basic hardening headers, and none names the framework. This closes sweep findings S5 (framing), S6 (no CSP), S7 (no nosniff or referrer policy) and S8 (`X-Powered-By: Next.js`).

## What is there today

- `next.config.ts` has a `headers()` that sends `X-Robots-Tag` on `/:path*`, and no `poweredByHeader` setting.
- `proxy.ts` answers some requests itself (login redirects, 401 and 403 refusals) and sets `X-Robots-Tag` on those, because the config headers don't reach them.
- Since #14, CloudFront adds a response headers policy (`infra/modules/app/main.tf`, `aws_cloudfront_response_headers_policy.security`) with HSTS (one year, this host only), `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` and `X-Frame-Options: DENY`, each with `override = true`. That covers the deployed site; a local run (`npm start`, `npm run dev`, previews) gets none of it.
- Cover images load in a plain `<img>` from `https://coverartarchive.org` and the Deezer CDN. A Cover Art Archive link redirects to `https://archive.org/download/...` and then to a host like `https://ia601000.us.archive.org/...` (checked with `curl -IL` on 2026-11-22).

## What changes

### One list of headers, used in two places

A new module, `lib/security-headers.ts`, exports the header list (name and value pairs). It takes no config other than whether the app is in development.

- `next.config.ts` `headers()` sends that list on `/:path*`, next to the existing `X-Robots-Tag`.
- `proxy.ts` `respond()` sets the same list on the responses it answers itself, as it does for `X-Robots-Tag` today.

`next.config.ts` imports the module by relative path (it is plain data, no `server-only`).

### The headers

- `Content-Security-Policy`, a static policy (no nonce):
  - `default-src 'self'`
  - `script-src 'self' 'unsafe-inline'`, plus `'unsafe-eval'` in development only (React needs it for dev error stacks, per the Next docs `content-security-policy.md`)
  - `style-src 'self' 'unsafe-inline'` (components set CSS custom properties through `style` attributes)
  - `img-src 'self' https://coverartarchive.org https://archive.org https://*.archive.org https://cdn-images.dzcdn.net https://e-cdns-images.dzcdn.net`
  - `font-src 'self'` (fonts are self-hosted by `next/font`)
  - `connect-src 'self'` (server actions, and the dev server's websocket on the same host)
  - `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: same-origin`

### No X-Powered-By

`poweredByHeader: false` in `next.config.ts`.

### HSTS stays at CloudFront

The app does not send `Strict-Transport-Security`. CloudFront already sends it on the deployed hosts, and a local run is plain HTTP on localhost, where HSTS would only get in the way.

### CloudFront referrer policy matches the app

`infra/modules/app/main.tf` changes `referrer_policy` from `strict-origin-when-cross-origin` to `same-origin`. CloudFront overrides the app's value, so without this the deployed site would keep sending its origin to the image hosts. This takes effect on the next `terraform apply`, which a human runs; agents run only `terraform fmt -check` and `terraform validate`.

## Tests

- `lib/security-headers.test.ts`: one table-driven test over production and development: each header is present, the CSP has each directive above, `'unsafe-eval'` appears only in development, and no `Strict-Transport-Security`.
- `proxy.test.ts`: the existing cases for the proxy's own answers (redirect, refusal) also check that the security headers are set.
- An e2e check (Playwright, which runs a production build with `next start`): a page response carries each header and no `X-Powered-By`, and loading the library and matchups pages logs no CSP violation in the console. The e2e catalog stub serves no cover images, so the remote image hosts are covered by the manual check below.
- Manual proof on a ticket preview (a production build): open each page (`/`, `/search`, `/library`, a remove page, `/matchups`, `/analytics`, an artist page, `/import`, `/login` with the gate on), confirm covers from both Cover Art Archive and Deezer load, and the console shows no CSP violations. `curl -I` shows the headers and no `X-Powered-By`.

## Leaves out

- A nonce-based CSP in `proxy.ts` (see Calls I made).
- CSP violation reporting (`report-to` or `report-uri`); there is nowhere to send reports.
- `Permissions-Policy`, `Cross-Origin-Opener-Policy` and other headers the ticket doesn't name.
- HSTS in the app (above), and HSTS `includeSubDomains` or `preload` at CloudFront.
- Running `terraform apply`.
- `/_next/image` (sweep note N2); separate from headers.

## Calls I made

- **`Referrer-Policy: same-origin`, not `no-referrer`, and CloudFront changes to match.** The ticket asks for `no-referrer`. Under `no-referrer`, a browser sends `Origin: null` on a plain form post (one sent before the page's JavaScript loads, such as the login form or a server action form with JavaScript off). Next's server action check compares `Origin` with `Host`, so those posts would be refused. `same-origin` keeps the real `Origin` on the app's own posts and sends no referrer at all to the image hosts, which is what S7 wanted. The CloudFront policy changes to `same-origin` too, since its `override = true` would otherwise win.
- **A static CSP with `'unsafe-inline'` for scripts, not a nonce policy.** A nonce needs every page rendered per request and the policy built in `proxy.ts`, which today skips `_next/static`. No script injection sink exists (sweep area 4), so the gain is small for the extra moving parts. A static policy still blocks scripts from other origins, `<object>`, `<base>` changes, framing and form posts to other sites.
- **`img-src` lists `archive.org` and `*.archive.org`.** The browser checks each hop of the cover redirect against the policy, and the chain ends on a numbered `*.us.archive.org` host.
- **The proxy's own answers get the headers too**, from the same list, so a login redirect or a refusal is not the one unprotected response.
- **No HSTS from the app**, because CloudFront already sends it and local runs are HTTP.
