# ALBUM-66 plan: bind dev and start to 127.0.0.1

Spec: [2026-11-22-album-66-bind-loopback.md](../specs/2026-11-22-album-66-bind-loopback.md)

1. `scripts/package-scripts.test.ts`: table-driven vitest reading `package.json`; `dev` and `start` must each contain `--hostname 127.0.0.1`. Run it first and see it fail.
2. `package.json`: `dev` is `next dev --hostname 127.0.0.1`, `start` is `next start --hostname 127.0.0.1`. The test passes.
3. `README.md` § Run the app: after step 6, a note that the app listens on this machine only, and how to open it on purpose (`npx next dev --hostname 0.0.0.0`, set `APP_PASSWORD` first).
4. Verify: `npm test`, `npm run typecheck`, `npm run lint`; run `npm run dev` and check `lsof` shows `127.0.0.1:3000`, curl on 127.0.0.1 and localhost answers, curl on the LAN IP is refused. Same for `npm run build && npm start`.
