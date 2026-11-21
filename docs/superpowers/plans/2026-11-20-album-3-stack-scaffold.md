# Stack and scaffold: plan

**Spec:** [2026-11-20-album-3-stack-scaffold.md](../specs/2026-11-20-album-3-stack-scaffold.md)
**Ticket:** [ALBUM-3](https://github.com/dbeallor/album-ranker/issues/3)

Run all commands in the feature worktree. Use the latest stable versions of each package, pinned by `package-lock.json`.

## Task 1: Next.js app and tooling

- `package.json` (name `album-ranker`, `private`, `engines.node >=24`), `.nvmrc` (`24`), `tsconfig.json` (strict), `next.config.ts`, ESLint flat config (`eslint.config.mjs`) with `eslint-config-next`, `vitest.config.ts` (jsdom, React plugin, `@` alias if used).
- Scripts: `dev`, `build`, `start`, `test` (`vitest run`), `lint` (`eslint .`), `typecheck` (`tsc --noEmit`).
- `app/layout.tsx` and `app/page.tsx`: the page renders only an `<h1>Album ranker</h1>`.
- `.gitignore`: add `node_modules/`, `.next/`, `next-env.d.ts`, `.env*` with `!.env.example`, `data/`, `*.db`, `*.sqlite*`, `coverage/`, `*.tsbuildinfo`.
- Verify: `npm run build`, `npm run dev` serves `/` with the heading (curl).

## Task 2: Config

- `lib/config.ts`: `getConfig()` reads `process.env.DATABASE_PATH` (default `./data/album-ranker.db`); an empty or whitespace-only value throws an `Error` naming the variable. Opens no database.
- `.env.example`: `DATABASE_PATH=./data/album-ranker.db` with a one-line comment.

## Task 3: Tests

- `app/page.test.tsx`: render the page, find the "Album ranker" heading.
- `lib/config.test.ts`: one table-driven test (unset gives default, set value is used, empty value throws).
- Verify: `npm test`, `npm run lint`, `npm run typecheck` all exit 0.

## Task 4: Docs and project config

- `docs/stack.md`: stack table and reasons from the spec, short.
- `README.md`: "Run the app" section (Node 24, `npm install`, optional `cp .env.example .env`, `npm run dev`, <http://localhost:3000>, test/lint/typecheck commands).
- `docs/agents/project.md`: Test `npm test`, Lint `npm run lint`, Typecheck `npm run typecheck` (keep first backticked token per cell); Areas list from the spec; new repo invariant about `data/` and SQLite files replacing the "none yet" line.

## Final check

`git status` shows no `.env`, `data/` or `.db` file; fresh-clone check: `git clone` the branch into the scratchpad, then `npm ci && npm test && npm run lint && npm run typecheck && npm run build`.
