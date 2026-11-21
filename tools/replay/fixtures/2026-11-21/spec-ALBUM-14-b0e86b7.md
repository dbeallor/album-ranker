# Deploy the app with a password gate

**Status:** Proposed
**Date:** 2026-11-21
**Ticket:** [ALBUM-14](https://github.com/dbeallor/album-ranker/issues/14)
**Follows:** [MVP requirements](2026-11-20-album-ranker-mvp.md) § Shape (deploying is a follow-up), [data model and storage](2026-11-21-album-4-data-model-storage.md), [stack](../../stack.md)

## Goal

Put the app on one server, over HTTPS, so a phone and a laptop see the same rankings. Nothing in the app is reachable without one shared password. Write the deploy, backup and restore steps in the README so a fresh copy can be deployed and a copied database file restored.

## Choosing the host

The app is one Node process holding one SQLite file open. The host must give it a disk that survives restarts and redeploys, run exactly one copy (two copies would each have their own file), and serve HTTPS. Prices below are as I know them and are rechecked in the build before anything is bought.

| Host | Durable disk for SQLite | HTTPS | Cost for this app | Ops work |
|---|---|---|---|---|
| **Fly.io** | Volumes, one per machine; daily snapshots kept 5 days by default | Automatic on `<app>.fly.dev` | About $2 to $5 a month (small shared machine that stops when idle, 1 GB volume) | Docker image plus `fly.toml`; `flyctl` for deploy, SSH and file copy |
| Railway | Volumes | Automatic | About $5 a month (Hobby plan) | Low; no SSH file copy, so backup and restore are awkward |
| Render | Persistent disk on paid instances only | Automatic | About $7 a month and up | Low; disk blocks zero-downtime deploys, which is fine here |
| Small VPS (Hetzner and similar) | The server's own disk | Self-managed (Caddy) | About $4 to $5 a month | Most: OS updates, firewall, TLS and process manager are on you |
| Vercel, Netlify and other serverless hosts | None: no writable disk that persists | Automatic | Free tier | Ruled out: SQLite needs a persistent file |

**Choice: Fly.io.** It is the cheapest option that keeps a real file on a durable volume, it pins the app to one machine, HTTPS is automatic, and `flyctl` gives SSH and file copy, which is what backup and restore by copying the file need. Railway and Render would work but cost more and make the file harder to get at. A VPS means running a server.

Fly needs an account with a card on file. Creating it, choosing the password and running the first deploy are yours (see Deploying below).

## The password gate

- **Config.** `APP_PASSWORD` holds the password. On Fly it is a secret (`fly secrets set`), never in `fly.toml` or the repo. `.env.example` documents it.
- **Production fails closed.** When `NODE_ENV` is `production` and `APP_PASSWORD` is unset, empty or shorter than 12 characters, the server refuses to start with a message naming the setting, and the proxy answers every request with 503 if it is ever reached anyway. The app can't be deployed without a password.
- **Local development.** With `APP_PASSWORD` unset in development, there is no gate, as today. Setting it in `.env` turns the gate on locally, for testing.
- **Where it runs.** A Next.js Proxy (`proxy.ts`, Node runtime) runs on every request except the login page and the files it needs (`/login`, `/_next/static`, `/_next/image`, `/favicon.ico`). Without a valid session cookie, a page request redirects to `/login?next=<path>`, and any other request gets 401. Server functions and route handlers added later also call a `requireSession()` helper from `lib/auth/`, since the Next.js docs warn that proxy coverage alone can silently lapse when a route moves. The docs say so in `docs/stack.md`.
- **Login page.** `/login` has one password field and a submit button. A server action checks the password. On success it sets the session cookie and redirects to `next` if that is a path on this site (starts with `/`, not `//`), else `/`. On failure it shows "Wrong password." after a one-second pause.
- **Guessing limit.** After 10 wrong passwords from one client IP within 15 minutes, the login refuses further tries from that IP for 15 minutes ("Too many tries. Wait 15 minutes."). The IP comes from the `Fly-Client-IP` header that Fly's edge sets, and falls back to one shared bucket when the header is missing (local runs). Counts live in memory and reset on restart.
- **Session cookie.** Named `album_session`, value `<expiry>.<signature>`, where the signature is an HMAC-SHA256 of the expiry keyed from `APP_PASSWORD`. It is `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in production, and lasts 90 days. Changing `APP_PASSWORD` signs every device out. There are no accounts and no session table.
- **Comparisons are constant time.** The password check and the signature check both compare with `crypto.timingSafeEqual` on fixed-length digests.
- **Not indexed.** Every response carries `X-Robots-Tag: noindex, nofollow`.

## Packaging and deploy

- **Image.** A multi-stage `Dockerfile` on `node:24-slim` builds with Next.js `output: "standalone"` and runs `node server.js` as a non-root user on port 3000. The image also carries `lib/db/migrations/`, since migrations are read from the working directory at runtime, and the backup script. A `.dockerignore` keeps `data/`, `.env*`, `node_modules`, `.next` and `.git` out of the build context.
- **`fly.toml`.** Committed, with the app name and region as values you set at `fly launch`. It mounts a volume named `data` at `/data`, sets `DATABASE_PATH=/data/album-ranker.db`, forces HTTPS, runs at most one machine, and lets the machine stop when idle and start on the next request (`min_machines_running = 0`). A TCP health check on port 3000 avoids an unauthenticated health route.
- **Migrations.** The app already migrates on first open of the database, so a deploy needs no separate migrate step. Fly's release command runs without the volume, so it isn't used.
- **`MUSICBRAINZ_USER_AGENT`** is set as a Fly secret too, so your contact email stays out of the repo.

## Backup and restore

- **Automatic.** Fly snapshots the volume daily and keeps snapshots 5 days. The README says how to list them and restore one into a new volume.
- **Manual backup.** `npm run db:backup -- <file>` writes a consistent copy of the open database with SQLite's `VACUUM INTO`, which is safe while the app is running and includes what is still in the WAL file. On Fly: run it over `fly ssh console`, then download the copy with `fly ssh sftp get`. Locally it runs against `DATABASE_PATH`.
- **Restore.** Upload the backup to `/data/restore.db` with `fly ssh sftp`, then restart the machine. On startup, before the database is opened, the server checks for `restore.db` next to the database file. If it is there and opens as a SQLite database with a `schema_migrations` table, the current file (and its `-wal` and `-shm` files) is renamed to `album-ranker.db.before-restore-<timestamp>` and `restore.db` takes its place, then migrations run as usual. A file that fails the check is left in place, the old database is kept, and the server logs why. The same steps work locally with Docker.

## README

A new "Deploy" section after "Run the app": install `flyctl`, `fly launch` from the committed `fly.toml` without deploying, create the volume, set `APP_PASSWORD` and `MUSICBRAINZ_USER_AGENT` as secrets, `fly deploy`, open the `fly.dev` URL. Then "Back up" and "Restore" subsections with the commands above, and a note that the app never runs more than one machine. "Run the app" gains the optional `APP_PASSWORD` line. `docs/stack.md` gains a Hosting row and an Auth row.

## Tests

One table-driven test per rule, in Vitest:

- **Session token:** a fresh token passes; expired, tampered, malformed, empty, and signed with another password all fail.
- **Redirect target:** `/`, `/search?q=x` pass; `//evil.example`, `https://evil.example`, `javascript:...`, empty and missing fall back to `/`.
- **Gate decision** (the pure function the proxy calls): public paths pass; no cookie gives a redirect for pages and 401 for other requests; a valid cookie passes; production without a password gives 503; development without a password passes.
- **Guessing limit:** the 10th failure locks, the 11th try is refused, a lock lifts after 15 minutes, IPs are counted apart.
- **Config:** `APP_PASSWORD` unset, empty and short in production throw with the setting's name; unset in development means no gate.
- **Restore on startup:** a valid `restore.db` replaces the database and keeps the old one; an invalid one is left and the database is unchanged; no `restore.db` does nothing.
- **Backup:** `VACUUM INTO` output opens and holds the same rows, including rows written since the last checkpoint.

No test for the login page's look. A local Docker run in the build checks the image end to end: no cookie redirects to `/login`, a wrong password is refused, the right one lets you in, data survives a container restart, and a restore through `restore.db` works.

## Acceptance

- The deployed app asks for the password and shows nothing without it: every page redirects to `/login`, every other request gets 401.
- A change made on one device shows on another after reload, since both reach the one server and file.
- The README steps deploy a fresh copy and restore from a copied database file.
- Production refuses to start without a password of 12 characters or more.
- No secret, `.env` file or database file is committed.

## Non-goals

- Accounts, multiple users, sharing, a sign-out button (changing the password signs everyone out).
- Scheduled off-site backups beyond Fly's daily snapshots.
- A custom domain (the `fly.dev` address is enough; the README can mention `fly certs add` later).
- CI or automatic deploys on merge.
- Any album, ranking or rating features.

## Calls I made

- **The first live deploy is yours.** I have no Fly account or `flyctl` login here, and it needs your card and your chosen password. The build delivers the image, `fly.toml`, the gate and the README, and proves them in a local Docker run. The live checks (password prompt on the `fly.dev` URL, phone and laptop agree) go under Not proven in the PR. If you'd rather I run the deploy, install `flyctl` and run `fly auth login` on this machine before the build, set `APP_PASSWORD` yourself with `fly secrets set`, and I'll do the rest.
- **Fly.io as the host**, at roughly $2 to $5 a month, over Railway, Render or a VPS (table above).
- **A login page with a 90-day cookie, not HTTP Basic Auth.** Basic Auth needs no page, but phone browsers forget it and ask again often, and its prompt can't say why a try was refused.
- **One secret.** The cookie is signed with a key derived from `APP_PASSWORD`, so there's no separate session secret to manage, and changing the password signs every device out.
- **Minimum password length of 12** in production.
- **No gate in local development** unless `APP_PASSWORD` is set.
- **10 wrong tries per IP per 15 minutes**, counted in memory, then a 15-minute lockout for that IP.
- **The machine stops when idle** to keep the bill low; the first request after a pause takes a second or two longer.
- **Restore by dropping `restore.db` beside the database and restarting**, with the old file kept as `.before-restore-<timestamp>`, rather than copying over the open file.
- **Backup with `VACUUM INTO`** rather than a raw file copy, because WAL mode leaves recent writes outside the main file.
- **TCP health check**, so there's no route that skips the gate.
- **`noindex` header** on every response.
