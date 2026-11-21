# As-built: Protect the local SQLite data

**Shipped:** in PR #29
**Ticket:** ALBUM-24
**Spec:** [2026-11-21-album-24-protect-sqlite-data.md](../specs/2026-11-21-album-24-protect-sqlite-data.md)

## Differs from the spec

- The spec leaves out detecting a running app before a restore. Restore now stops with "still open in another process" when the live file's `-wal` still exists after the restore closed its own connection, and replaces nothing. The pre-restore backup it took first stays in the backup folder.
- The spec says restore backs up the existing database with `VACUUM INTO`. When the existing file can't be opened (damaged), restore shows the current counts as unreadable and, after confirmation, copies its raw files to `<stamp>-pre-restore-unreadable.db.bak` (plus `-wal` and `-shm`) in the backup folder. Those files are not listed, pruned or picked by `latest`.
- A backup never prunes the file it just wrote, even when ten later-dated files exist (a clock set back).
- Restore copies the chosen backup beside the live file before taking the pre-restore backup, so pruning can't remove the file being restored.
- Newest-first order uses the name's timestamp, then file modification time, then the `-N` suffix.
- The pre-migrate check counts a file as existing when its `-wal` has data, even if the main file is 0 bytes.
- The Playwright web server sets `BACKUP_DIR` to `test-results/db/backups`, so browser tests never write to `~/.album-ranker`.
