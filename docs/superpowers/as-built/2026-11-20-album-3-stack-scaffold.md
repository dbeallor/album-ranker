# As-built: Tech stack and app scaffold

**Shipped:** in PR #16
**Ticket:** ALBUM-3
**Spec:** [2026-11-20-album-3-stack-scaffold.md](../specs/2026-11-20-album-3-stack-scaffold.md)

## Differs from the spec

- The spec says versions are the latest stable. TypeScript is held at 6.0.x, because typescript-eslint did not support TypeScript 7.0 and `npm run lint` crashed. `docs/stack.md` says so.
- The Vitest config is `vitest.config.mts`, not a `.ts` file, to avoid a CommonJS loader warning.
- An `AGENTS.md` is committed at the repo root. `next dev` generates it (Next.js agent rules) and recreates it if removed.
- The config test has four cases (unset, set, empty, whitespace-only), not three.
