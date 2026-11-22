# Bind dev and start to 127.0.0.1 only

**Status:** Shipped
**Shipped:** in PR #72, as specified
**Date:** 2026-11-22
**Ticket:** [ALBUM-66](https://github.com/dbeallor/album-ranker/issues/66)
**Follows:** [ALBUM-64 security sweep report](2026-11-22-album-64-security-sweep-report.md) (finding S2)

## Goal

`npm run dev` and `npm start` listen only on 127.0.0.1, so another machine on the same network can't open the app and read or delete the library. Today both scripts run Next with no `--hostname`, and Next then listens on every interface.

## What changes

### `package.json`

- `"dev": "next dev --hostname 127.0.0.1"`
- `"start": "next start --hostname 127.0.0.1"`

Ports stay as they are (3000 unless `--port` or `PORT` says otherwise). `npm run preview` and the Playwright web server already pass `--hostname 127.0.0.1` and don't change.

### A test that keeps it that way

One table-driven test in `scripts/` (vitest) reads `package.json` and checks that `dev` and `start` each pass `--hostname 127.0.0.1`. It fails if someone drops the flag. It doesn't start a server.

### README

In § Run the app, after the `npm run dev` step: the app listens on this machine only (127.0.0.1), so other devices on your network can't reach it. To open it from another device on purpose, run Next directly with another host, for example `npx next dev --hostname 0.0.0.0`, and set `APP_PASSWORD` first, since anyone on the network can then reach it.

The `http://localhost:3000` links stay. Browsers and `npm run record -- 3000` reach a 127.0.0.1 server through `localhost`; the build checks this.

### AWS (ALBUM-14)

No change. The issue's comment asks to check the standalone server on AWS. It is already decided: `infra/modules/app/main.tf` sets `HOSTNAME = "127.0.0.1"` for the Lambda, and the standalone server reads `HOSTNAME` as its bind address. The Lambda Web Adapter runs in the same sandbox and forwards to it over loopback, so nothing else can reach the port. The spec records this; the code stays.

## Proof in the build

- `npm run dev`: `curl http://127.0.0.1:3000` answers; `curl http://<this machine's LAN IP>:3000` is refused. `lsof -iTCP:3000 -sTCP:LISTEN` shows `127.0.0.1:3000`, not `*:3000`.
- The same for `npm run build && npm start`.
- `curl http://localhost:3000` answers too.
- `npm test`, `npm run typecheck` and `npm run lint` pass.

## Leaves out

- Any change to the AWS bind, the preview script or Playwright.
- A setting or env var to change the bind host. Running Next directly covers the rare case.
- IPv6 loopback (`::1`). `127.0.0.1` matches the preview script and Playwright.

## Calls I made

- To reach the app from another device, the README points at `npx next dev --hostname 0.0.0.0` rather than adding a script, an env var or `npm run dev -- --hostname ...`. Passing a second `--hostname` through npm relies on which one Next's argument parser keeps; running Next directly has one flag and no doubt.
- The README tells you to set `APP_PASSWORD` before opening the app to the network.
- A small test guards the two script lines, so a later edit can't silently drop the flag. It reads `package.json`; it doesn't start Next.
- The `localhost:3000` links in the README stay, instead of changing every one to `127.0.0.1:3000`. The build checks that `localhost` still reaches the app.
- AWS needs no change: the Lambda already sets `HOSTNAME=127.0.0.1` and the adapter on the same host is the only caller. The spec says so instead of touching Terraform.
