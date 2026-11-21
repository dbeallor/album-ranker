# Protect the local SQLite data: plan

**Spec:** [2026-11-21-album-24-protect-sqlite-data.md](../specs/2026-11-21-album-24-protect-sqlite-data.md)
**Ticket:** [ALBUM-24](https://github.com/dbeallor/album-ranker/issues/24)

Test command: `npm test`; also `npm run lint` and `npm run typecheck`. Tests use temp files under `os.tmpdir()` and a temp backup folder, never `data/` or `~/.album-ranker`.

## Task 1: config

- `lib/config.ts`: add `backupDir` (env `BACKUP_DIR`, default `~/.album-ranker/backups` expanded with `os.homedir()`; empty value throws like the others). Update `lib/config.test.ts` and `.env.example`.

## Task 2: backup module and tests

- `lib/db/backup.ts` (no `server-only`): backup subfolder naming (`<name>-<8 hex sha256 of absolute path>`, writes `source.txt`), `backupDatabase(db, sourcePath, reason, backupDir)` using `VACUUM INTO` to a temp name then rename, `0600` file and `0700` folder, `-2` suffix on same-second collisions, `integrity_check` of the copy (delete on failure), `listBackups`, prune to newest 10 (`KEEP_BACKUPS`), and `restoreDatabase` per spec § Restore (validate, confirm callback, `pre-restore` backup, temp file plus rename, remove `-wal`/`-shm`).
- `lib/db/backup.test.ts`: table-driven per spec § Tests (WAL contents in the copy, restore into empty, restore over existing with and without confirmation, invalid backup refused, pruning, two paths don't prune each other).

## Task 3: pre-migrate backup

- `lib/db/migrate.ts`: `migrate(db, dir?)` takes an optional migrations folder; add a read-only `pendingMigrations(db, dir?)`.
- `lib/db/connection.ts`: `openDatabase(path, options?: { backupDir?, migrationsDir? })`. For an existing non-empty file with pending migrations, take a `pre-migrate` backup first; a failed backup closes the db and throws. `:memory:`, new files and up-to-date files take none. Default `backupDir` from `getConfig()`.
- Tests: pending migration creates a backup with the old schema; new file and up-to-date file create none; failed backup stops the migration.

## Task 4: scripts and docs

- `scripts/backup.ts` (`list` subcommand, no migrations, fails if no file) and `scripts/restore.ts` (`latest | <file>`, `--yes`, TTY prompt `Type yes to replace it:`, refuse without TTY and `--yes`); `package.json` scripts `db:backup` and `db:restore`.
- README section "Back up and restore your data" after "Run the app" per spec § README.
- Check `git status` lists no `data/`, SQLite or backup files.
