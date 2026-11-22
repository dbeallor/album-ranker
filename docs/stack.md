# Stack

One web app with a small server, one SQLite file, run on localhost or on AWS in staging and production (see Hosting), config from environment variables. Chosen in [the stack and scaffold spec](superpowers/specs/2026-11-20-album-3-stack-scaffold.md). Exact versions are in `package-lock.json`.

| Layer | Choice |
|---|---|
| Language | TypeScript, strict mode |
| Runtime | Node.js 24 LTS or newer (`engines` in `package.json`, `.nvmrc` set to 24) |
| Framework | Next.js (App Router), React |
| Package manager | npm, with a committed `package-lock.json` |
| Tests | Vitest, with React Testing Library and jsdom for components; Playwright (Chromium) for browser tests in `e2e/`, run with `npm run test:e2e` |
| Lint | ESLint with the Next.js config (flat config) |
| Typecheck | `tsc --noEmit` |
| Album catalog | MusicBrainz search (release groups) with Cover Art Archive covers, called from the server and cached in memory. See [the catalog search spec](superpowers/specs/2026-11-21-album-5-catalog-search.md) |
| Spreadsheet reader | `read-excel-file`, read-only, used by the import script (`npm run import`). `write-excel-file` (dev dependency) generates the test fixture. See [the import spec](superpowers/specs/2026-11-21-album-10-spreadsheet-import.md) |
| Database | SQLite in one file through Node's built-in `node:sqlite`, plain SQL with no ORM, numbered `.sql` migrations in `lib/db/migrations/` |
| Styling | Plain CSS, no library: design tokens, dark theme and base styles in `app/globals.css`, layout in CSS Modules next to each component, and shared components in `components/ui/`. `lib/design-system.test.ts` keeps raw colors and inline styles out of everything else. See [the ALBUM-31 spec](superpowers/specs/2026-11-21-album-31-restyle-design-system.md) |
| Hosting | Two AWS environments, staging and production, each a Lambda function (Node 24, the Next.js standalone server behind the Lambda Web Adapter) behind CloudFront. The database is one SQLite file in a versioned S3 object, loaded into `/tmp` and uploaded after each request that writes, with an `If-Match` conditional write. Build files are served from S3. See [the ALBUM-14 spec](superpowers/specs/2026-11-22-album-14-aws-terraform-deploy.md) |
| Infrastructure | Terraform 1.10 or newer in `infra/`: `bootstrap/` (state bucket, local state), `modules/app/` (one environment) and `envs/staging`, `envs/production` (state in S3). `npm run build:lambda` writes the package to `dist/`. Deploy steps are in the README |
| Auth | One shared password per deployed environment, checked by `proxy.ts` and a signed 90-day cookie, with a login page at `/login`. Terraform generates the password. CloudFront adds a secret header, so the function URL answers nothing else. Every server action also calls `requireSession()` (`lib/auth/require-session.ts`) first, in case a proxy matcher stops covering a route; `/login`'s action is the one exception. With `DEPLOY_ENV` unset and no `APP_PASSWORD`, nothing is checked, as for a local run |

TypeScript is held at 6.0.x until typescript-eslint supports 7.x.

## Why

- **One process for the page and the server.** Server components, route handlers and server actions run on the server, so the SQLite file never reaches the browser and any catalog key stays server-side.
- **React for the interactive screens.** The matchup screen and the server-rendered library and analytics pages (#34) share components, and React has the most mature tooling for that.
- **TypeScript end to end.** The Elo replay (#7), the data model (#4) and the import script (#10) share types with the screens.
- **The import script runs on the same code.** `scripts/import.ts` (`npm run import`, #10) imports the same modules and runs through Node's type stripping, as `scripts/migrate.ts` does (`npm run db:migrate`). It runs with `node --conditions=react-server`, which makes the `server-only` marker package resolve to its empty module, so server-only modules such as the catalog client load outside Next.js.
- **npm** ships with Node and needs no extra install.
- **Vitest** runs TypeScript without a build step and covers both pure logic and components.

## Turned down

- SvelteKit or Remix / React Router: both fit; Next.js has the largest ecosystem, which matters for a solo project built mostly by agents.
- Tailwind (or another CSS library): it adds a build plugin and a second vocabulary for a dozen screens. Plain CSS tokens with CSS Modules cover it.
- A separate API server plus a Vite single-page app: two processes for one user's app.
- Python with a JavaScript frontend: two languages, and drag and drop still needs JavaScript.
