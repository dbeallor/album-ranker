# Stack

One web app with a small server, one SQLite file, run on localhost, config from environment variables. Chosen in [the stack and scaffold spec](superpowers/specs/2026-11-20-album-3-stack-scaffold.md). Exact versions are in `package-lock.json`.

| Layer | Choice |
|---|---|
| Language | TypeScript, strict mode |
| Runtime | Node.js 24 LTS or newer (`engines` in `package.json`, `.nvmrc` set to 24) |
| Framework | Next.js (App Router), React |
| Package manager | npm, with a committed `package-lock.json` |
| Tests | Vitest, with React Testing Library and jsdom for components |
| Lint | ESLint with the Next.js config (flat config) |
| Typecheck | `tsc --noEmit` |
| Database | SQLite in one file through Node's built-in `node:sqlite`, plain SQL with no ORM, numbered `.sql` migrations in `lib/db/migrations/` |

TypeScript is held at 6.0.x until typescript-eslint supports 7.x.

## Why

- **One process for the page and the server.** Server components, route handlers and server actions run on the server, so the catalog API key (#5) and the SQLite file never reach the browser.
- **React for the hard screens.** The year page (#6) and the decade list (#9) need drag and drop with keyboard and touch, and React has the most mature libraries for that.
- **TypeScript end to end.** The Elo replay (#7), the data model (#4) and the import script (#10) share types with the screens.
- **The import script runs on the same code.** #10 can import the same modules and run as a script through Node's type stripping, as `scripts/migrate.ts` does (`npm run db:migrate`).
- **npm** ships with Node and needs no extra install.
- **Vitest** runs TypeScript without a build step and covers both pure logic and components.

## Turned down

- SvelteKit or Remix / React Router: both fit; Next.js has the largest ecosystem, which matters for a solo project built mostly by agents.
- A separate API server plus a Vite single-page app: two processes for one user's app.
- Python with a JavaScript frontend: two languages, and drag and drop still needs JavaScript.
