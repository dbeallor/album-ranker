# Stack

One web app with a small server, one SQLite file, run on localhost, config from environment variables. Chosen in [the stack and scaffold spec](superpowers/specs/2026-11-20-album-3-stack-scaffold.md). Exact versions are in `package-lock.json`.

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

TypeScript is held at 6.0.x until typescript-eslint supports 7.x.

## Why

- **One process for the page and the server.** Server components, route handlers and server actions run on the server, so the SQLite file never reaches the browser and any catalog key stays server-side.
- **React for the hard screens.** The year page (#6) and the decade list (#9) need drag and drop with keyboard and touch, and React has the most mature libraries for that.
- **TypeScript end to end.** The Elo replay (#7), the data model (#4) and the import script (#10) share types with the screens.
- **The import script runs on the same code.** `scripts/import.ts` (`npm run import`, #10) imports the same modules and runs through Node's type stripping, as `scripts/migrate.ts` does (`npm run db:migrate`). It runs with `node --conditions=react-server`, which makes the `server-only` marker package resolve to its empty module, so server-only modules such as the catalog client load outside Next.js.
- **npm** ships with Node and needs no extra install.
- **Vitest** runs TypeScript without a build step and covers both pure logic and components.

## Turned down

- SvelteKit or Remix / React Router: both fit; Next.js has the largest ecosystem, which matters for a solo project built mostly by agents.
- A separate API server plus a Vite single-page app: two processes for one user's app.
- Python with a JavaScript frontend: two languages, and drag and drop still needs JavaScript.
