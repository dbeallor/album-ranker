# Tech stack and app scaffold

**Status:** Draft
**Date:** 2026-11-20
**Ticket:** [ALBUM-3](https://github.com/dbeallor/album-ranker/issues/3), epic [#11](https://github.com/dbeallor/album-ranker/issues/11)
**Follows:** [MVP requirements](2026-11-20-album-ranker-mvp.md) § Users and shape

## Goal

Pick the stack for the album ranker and commit a runnable, empty scaffold, so tickets #4 to #10 have a place to build and real Test, Lint and Typecheck commands to run.

The shape is fixed by the MVP spec: one web app with a small server, one SQLite file, run on localhost, config from environment variables.

## The stack

| Layer | Choice |
|---|---|
| Language | TypeScript, strict mode |
| Runtime | Node.js 24 LTS or newer (`engines` in `package.json`, `.nvmrc` set to 24) |
| Framework | Next.js (App Router), React |
| Package manager | npm, with a committed `package-lock.json` |
| Tests | Vitest, with React Testing Library and jsdom for components |
| Lint | ESLint with the Next.js config (flat config) |
| Typecheck | `tsc --noEmit` |
| Database (later, #4) | SQLite in one file. The driver and any ORM are #4's call; this ticket adds none |

Exact versions are the latest stable releases at build time, pinned by the lockfile.

### Why this stack

- **One process for the page and the server.** Next.js server components, route handlers and server actions run on the server, so the catalog API key (#5) and the SQLite file never reach the browser, and there is no second service to start.
- **React for the hard screens.** The year page (#6) and the decade list (#9) need drag and drop with keyboard and touch. React has the most mature libraries for that (dnd-kit and others).
- **TypeScript end to end.** The Elo replay (#7), the data model (#4) and the import script (#10) share types with the screens.
- **The import script runs on the same code.** #10 is a command-line script; it can import the same TypeScript modules and run with `tsx` (added by #10, not here).
- **npm** because it ships with Node and needs no extra install on a fresh clone.
- **Vitest** is fast, runs TypeScript without a build step and covers both pure logic (#7) and components.

### Alternatives turned down

- **SvelteKit or Remix / React Router.** Both fit the shape. Next.js has the largest ecosystem and documentation, which matters more for a solo project built mostly by agents than any difference in features.
- **A separate API server (Express or Fastify) plus a Vite single-page app.** Two processes and two configs for one user's app, for no gain.
- **Python (Django or FastAPI) with a JavaScript frontend.** Splits the code into two languages; drag and drop still needs a JavaScript framework.

## What the scaffold contains

- `package.json` with scripts: `dev`, `build`, `start`, `test`, `lint`, `typecheck`.
- A Next.js App Router app with one route, `/`, showing a blank home page: the heading "Album ranker" and nothing else.
- `lib/config.ts`: reads config from environment variables in one place and fails fast with a clear message on an invalid value. The only value today is `DATABASE_PATH` (default `./data/album-ranker.db`), which #4 will use. The scaffold reads it but opens no database.
- `.env.example` listing `DATABASE_PATH` with its default and a comment. `.env*` files other than `.env.example` and the `data/` folder are gitignored, along with `node_modules/`, `.next/` and other build output.
- Tests:
  - a smoke test that renders the home page and finds the heading,
  - one table-driven test for `lib/config.ts` (default, a set value, an empty value).
- `docs/stack.md`: the stack table and the reasons above, short, for later tickets to read.
- A README section, "Run the app": install Node 24, `npm install`, `cp .env.example .env` (optional), `npm run dev`, open <http://localhost:3000>; plus `npm test`, `npm run lint`, `npm run typecheck`.

## Project config changes

`docs/agents/project.md`, as the ticket asks:

- § Commands: `Test` → `npm test`, `Lint` → `npm run lint`, `Typecheck` → `npm run typecheck`. `Required CI checks` stays `none (no CI yet)`: CI is out of scope.
- § Areas and labels, Areas:
  - `app/`: pages, layouts, route handlers and server actions.
  - `components/`: React components shared between pages.
  - `lib/`: server and shared logic (config now; database, Elo and catalog later). Server-only modules import `server-only`.
  - `scripts/`: command-line scripts (the import, #10).
  - `docs/`: specs, plans and the stack doc.

  Area labels stay `none yet`.
- § Repo invariants: add "Never commit the `data/` folder or any SQLite file."

Only `app/`, `lib/` and the tests exist after this ticket; the other folders are created by the tickets that need them.

## Out of scope

- Any album, ranking or rating feature.
- Database tables, a SQLite driver or an ORM (#4).
- CI, deployment and a password gate.
- Styling beyond the framework defaults. No CSS framework is added.

## Acceptance

1. A fresh clone runs the app with the README steps, and `/` on localhost shows the "Album ranker" heading.
2. `npm test`, `npm run lint` and `npm run typecheck` pass on a fresh clone.
3. `npm run build` succeeds.
4. `docs/agents/project.md` § Commands has real values for Test, Lint and Typecheck, and § Areas and labels lists the areas.
5. `docs/stack.md` names the stack and the reason.
6. No secret, `.env` file or database file is committed.

## Calls I made

Surprising first.

- **Next.js** over SvelteKit or Remix, for ecosystem size and drag and drop libraries. It is the heaviest of the three.
- **This PR edits `docs/agents/project.md`** (Commands, Areas, one new repo invariant). The ticket asks for the first two; that file is on the approval path, so this spec should not be auto-approved.
- **New repo invariant**: never commit `data/` or a SQLite file, since the database will hold the user's rankings.
- **`DATABASE_PATH` added now** with a default, though nothing opens a database until #4, so `.env.example` and the config pattern exist from the start.
- **npm**, not pnpm or Bun, because it needs no extra install.
- **Node 24 LTS minimum.** The machine runs Node 26; 24 is the oldest active LTS.
- **No SQLite driver or ORM yet.** Left to #4 with the tables.
- **No CSS framework** (no Tailwind). Visual design is a non-goal of the MVP; a later ticket can add one.
- **Areas are folders**, with no area labels.
- **Two tests only**: the home page smoke test and a table-driven config test.
