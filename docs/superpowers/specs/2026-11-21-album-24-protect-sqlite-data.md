# Protect the local SQLite data

**Status:** Shipped
**Date:** 2026-11-21
**Shipped:** in PR #29, with differences: [as-built](../as-built/2026-11-21-album-24-protect-sqlite-data.md)
**Ticket:** [ALBUM-24](https://github.com/dbeallor/album-ranker/issues/24)
**Follows:** [data model and storage](2026-11-21-album-4-data-model-storage.md) § Storage, [local previews](2026-11-21-album-20-local-previews.md)

## Goal

The user's rankings live in one gitignored SQLite file inside the checkout. Give them a backup command, a restore command, an automatic backup before migrations, and a README section, so one wrong delete, reset or migration can't lose the data for good.

## Where backups go

- **Folder:** `~/.album-ranker/backups/` by default, outside every checkout, so removing a worktree or re-cloning keeps them. A new optional setting `BACKUP_DIR` (in `lib/config.ts` and `.env.example`) moves it. Created with mode `0700` if missing.
- **One subfolder per database file**, named `<file name without .db>-<first 8 hex of sha256 of the absolute path>`, for example `album-ranker-3f9a01c2/`. Each checkout and worktree has its own `data/album-ranker.db`, so without this a worktree's dev backups would push the root checkout's real backups out of the keep-N limit. The full absolute path of the source is written to a `source.txt` in the subfolder so a person can tell the folders apart.
- **File names:** `<UTC timestamp>-<reason>.db`, for example `20261121T143005Z-manual.db`. Reasons: `manual` (the backup command), `pre-migrate` (before migrations), `pre-restore` (the file a restore replaced). The timestamp sorts by name; two backups in the same second get a `-2` suffix.
- **Keep the newest 10** per subfolder, counting all reasons. After each new backup the oldest past 10 are deleted. The README states the number.
- Backup files are created with mode `0600`. Nothing is uploaded; the folder is outside the repo, so git never sees it.

## How a backup is made

`VACUUM INTO '<file>'` on a connection to the live database. It reads one consistent snapshot, includes what is still in the `-wal` file, writes a single self-contained file (no `-wal` or `-shm`), is safe while the app runs (it only takes a read lock) and never changes the live database. It is synchronous, so the pre-migration backup can run inside `openDatabase`, which is synchronous today.

The backup is written to a temp name in the same folder and renamed into place, so a crash never leaves a half-written file with a real backup name. After writing, the command opens the copy and checks `PRAGMA integrity_check` returns `ok`; on failure it deletes the copy and exits non-zero.

## Commands

| Command | What it does |
|---|---|
| `npm run db:backup` | Backs up the database at `DATABASE_PATH`, prints the backup path and how many backups are kept |
| `npm run db:backup -- list` | Lists the backups for `DATABASE_PATH`, newest first, with size and album, year entry and matchup counts |
| `npm run db:restore -- <file>` | Restores from a backup file (a path, or a name in this database's backup folder) |
| `npm run db:restore -- latest` | Restores the newest backup for `DATABASE_PATH` |

`db:backup` with no database file at `DATABASE_PATH` exits non-zero with a clear message and creates nothing. It opens the live file without running migrations (a backup command must not change the schema).

### Restore

1. Check the backup: it opens, `integrity_check` is `ok`, and it has a `schema_migrations` table. Otherwise stop before touching anything.
2. If no database exists at `DATABASE_PATH`: copy the backup there (via `VACUUM INTO` from the backup) and print the counts. Done.
3. If one exists: print what would be replaced (its counts, the backup's counts) and ask `Type yes to replace it:`. Anything else, or no terminal (stdin not a TTY) without `--yes`, exits non-zero and changes nothing. `--yes` skips the prompt.
4. On yes: back up the existing database as a `pre-restore` backup (same `VACUUM INTO` path, so its WAL contents are kept), then write the restored copy to a temp file next to the live one, delete the live file's `-wal` and `-shm`, and rename the temp file over the live file. The old WAL must go: left in place, SQLite would replay it onto the restored file.
5. Print the path of the kept `pre-restore` backup, so the restore can itself be undone with `npm run db:restore -- <that file>`.

Restore tells the user to stop the app (`npm run dev`, any preview using that file) first. It does not try to detect a running app; the README says so.

The pre-restore backup is counted in the keep-10 limit like any other.

Backups from a newer schema than the code (a `schema_migrations` version the code doesn't have) are restored with a warning, not refused: the user may be going back to a branch. Older ones are migrated on next open as usual, which takes its own pre-migrate backup.

## Backup before migrations

`openDatabase(path)` gains the step: when `path` is a file that existed before opening and is not empty, and at least one migration is pending, take a `pre-migrate` backup before applying any. If the backup fails, the open fails with the backup error and no migration runs. A brand new file, `:memory:`, and an up-to-date database take no backup.

This covers `npm run db:migrate`, the app's first open (`getDb`) and previews alike. To find pending migrations without racing a second process, the migrate runner gets a read-only "pending versions" check; the backup then runs before the existing per-migration `BEGIN IMMEDIATE` loop. Two processes opening the same out-of-date file at once may both take a backup; that is harmless.

The backup folder for `openDatabase` comes from `getConfig()`. Tests pass an explicit backup folder (a temp directory), so no test writes to `~/.album-ranker`.

## Code layout

- `lib/db/backup.ts`: backup folder naming, `backupDatabase(db, sourcePath, reason, dir)`, listing, pruning, and restore. Plain functions on paths and `DatabaseSync`, no `server-only`, so scripts and tests load it.
- `scripts/backup.ts` and `scripts/restore.ts`, run with Node like `scripts/migrate.ts`, behind `db:backup` and `db:restore` in `package.json`.
- `lib/db/connection.ts` and `lib/db/migrate.ts`: the pre-migrate hook.
- `scripts/preview/index.ts` keeps its own `--copy-main-data` and `--empty` as they are (preview data only, out of scope per the ticket).

## Tests

All on temp files under `os.tmpdir()`, with a temp backup folder, never `data/` or `~/.album-ranker`. One table-driven test per rule:

- Backup while another open connection's committed writes are still only in the `-wal` file (not checkpointed): the copy opens, passes `integrity_check`, and has the same albums, year entries and matchups.
- Restore into an empty location gives the same rows.
- Restore over an existing database with no confirmation changes nothing; with confirmation it replaces the data, removes the old `-wal`/`-shm`, and leaves a `pre-restore` backup with the old rows.
- Restore refuses a file that isn't a valid database or has no `schema_migrations`.
- Opening an existing file with a pending migration (a temp migrations folder with an extra migration) creates a `pre-migrate` backup holding the pre-migration schema; a new file and an up-to-date file create none; a failed backup stops the migration.
- Pruning keeps the newest 10 and deletes the rest; backup folders for two different paths don't prune each other.

The migrations folder is fixed to `process.cwd()/lib/db/migrations` today. The test for pending migrations needs another folder, so `migrate` takes an optional folder argument (default unchanged).

## README

A section "Back up and restore your data" after "Run the app":

- The live data is `data/album-ranker.db` (or `DATABASE_PATH`) plus its `-wal` and `-shm` files while the app runs; copying the `.db` alone can miss recent answers.
- Deleting the checkout or worktree, or `git clean -fdx`, deletes its `data/` folder.
- Where backups go, `BACKUP_DIR`, the per-database subfolder, and that the newest 10 are kept.
- `npm run db:backup`, `npm run db:backup -- list`, `npm run db:restore -- latest | <file>`, `--yes`, stop the app before restoring, and how to undo a restore.
- That migrations take a backup first.
- Backups are personal data: they stay on this machine and never go in git.

## Leaves out

- Staging and production backups (#14), cloud or off-machine copies, export to spreadsheet, down migrations, per-preview data folders (#20).
- Scheduled or periodic backups. Backups happen on command and before migrations only.
- Detecting a running app before restore.
- Changing the preview script's `--empty` and `--copy-main-data`.

## Calls I made

- **Backups go to `~/.album-ranker/backups/`, not a gitignored folder in the repo.** The ticket allowed either; only outside the checkout survives deleting the worktree, which is the loss the ticket names.
- **One backup subfolder per database path (name plus a short hash).** Otherwise worktree dev databases, which all share the file name `album-ranker.db`, would push the real data's backups out of the limit.
- **Keep the newest 10 per database, all reasons counted together.** The ticket left N open. Pre-migrate and pre-restore backups count, so a run of restores can push out an old manual backup.
- **`VACUUM INTO` instead of `node:sqlite`'s `backup()`.** Both give a consistent copy with WAL contents; `VACUUM INTO` is synchronous, which the pre-migrate backup inside the synchronous `openDatabase` needs.
- **The app's own first-open migration also backs up**, not only `npm run db:migrate`, since the README calls that step optional.
- **Restore confirms by typing `yes`, or `--yes`; with no terminal and no `--yes` it refuses.**
- **A restore keeps the replaced file as a `pre-restore` backup in the backup folder**, rather than a `.bak` next to the live file, so it is also outside the checkout.
- **Restoring a backup from a newer schema warns instead of refusing.**
- **New `BACKUP_DIR` setting** in config and `.env.example`.
- **`db:backup` never runs migrations** and fails if the database file doesn't exist.
- **`migrate()` takes an optional migrations folder** so the test can add a pending migration.
- **Backup files `0600`, folder `0700`**, since they are personal data.
