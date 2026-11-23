# As-built: Push local data to staging and production

**Shipped:** in PR #88
**Ticket:** ALBUM-86
**Spec:** [2026-11-23-album-86-local-data-sync.md](../specs/2026-11-23-album-86-local-data-sync.md)

## Differs from the spec

- The spec reads the remote with `head()` then `get()` and doesn't say what happens if the ETag changes between them. Shipped: that stops with "The remote changed while it was being read. Nothing was uploaded. Run again."
- The dry run's printed next command carries `--bucket` (and `--region` when given) as well as `--expect-etag` and `--confirm-production`, so it reaches the same bucket.
- Flags also accept `--flag=value`. A value flag with no value is an error.
- The local database is opened read-only, so even a dry run writes nothing outside the temp folder.
- Ctrl-C or Ctrl-D at the `yes` prompt counts as no ("Not uploaded. Nothing was changed."). Ctrl-C elsewhere exits with status 130; the temp folder, which holds a copy of the data, is removed either way.
- Arguments are checked before any setting is read, and only `DATABASE_PATH` and `BACKUP_DIR` are read (`getDataPaths` in `lib/config.ts`), so an unrelated bad setting does not stop a push.
- The undo output also warns that restoring replaces anything written to the bucket since the push, prints a `head-object` command to check first, and repeats `--region` and shell quoting from the push.
