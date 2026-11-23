# Push local data to staging or production

**Status:** Draft
**Date:** 2026-11-23
**Ticket:** [ALBUM-86](https://github.com/dbeallor/album-ranker/issues/86)

## Goal

One command, `npm run db:push -- <staging|production>`, replaces the manual `aws s3 cp` route in the README. It uploads a consistent copy of `data/album-ranker.db` to the environment's data bucket, as the object `album-ranker.db`. It backs up the local file first. It never overwrites data in S3 that changed after it was read, and it asks before replacing data that is already there. A dry run shows what would change. After an upload it prints how to undo it.

The user runs it by hand. The agent team never runs it.

## Command

```
npm run db:push -- <staging|production> [--dry-run] [--bucket <name>] [--region <region>]
                    [--expect-etag <etag>] [--yes] [--confirm-production]
```

| Argument | Meaning |
|---|---|
| `staging` or `production` | The environment. Exactly one is required. |
| `--dry-run` | Read only. Prints the comparison and the command to run next, then exits. No backup, no upload. |
| `--bucket <name>` | The bucket to use. Without it the script runs `terraform -chdir=infra/envs/<env> output -raw data_bucket`, a read-only command. |
| `--region <region>` | The bucket's region. Without it the AWS SDK's usual chain applies (`AWS_REGION`, then the profile's region). The client is built with `followRegionRedirects: true`, so a wrong region still reaches the bucket. |
| `--expect-etag <etag>` | The remote ETag the dry run printed. If the remote ETag now is different, or the object is gone, the script stops before uploading. |
| `--yes` | Replace existing remote data without the typed `yes`. |
| `--confirm-production` | Required with `production`. Without it the script exits with an error before it runs Terraform or calls AWS. |

Credentials come from the AWS SDK's default chain (`AWS_PROFILE`, SSO), the same as the other README deploy steps. The script stores none.

## Steps of a real run

1. **Check arguments.** Unknown flags, a missing or second environment, or `production` without `--confirm-production` exit 1 with the usage line. This happens before any Terraform or AWS call.
2. **Find the bucket.** `--bucket`, or the Terraform output. A failed Terraform call exits 1 with its stderr and a hint to pass `--bucket`.
3. **Check the local database.** `getConfig().databasePath` must exist, or exit 1.
4. **Back up.** Open the local file without migrating (as `scripts/backup.ts` does) and call `backupDatabase(db, databasePath, "manual", backupDir)`. Print the backup path. The dry run skips this step.
5. **Make the upload copy.** `VACUUM INTO` a temp file in a fresh `mkdtemp` folder under `os.tmpdir()` (mode 0700), so the `-wal` contents are included. Check it with `inspectBackup` and count it with `countRowsAt`. A failure exits 1 and uploads nothing.
6. **Read the remote.** `head()` for the ETag, version id and last-modified time, then `get()` for the body, written to the same temp folder. If it is an album-ranker database, the script reads its counts and migration versions. If `inspectBackup` rejects it, the script says it is not an album-ranker database and that the upload would replace it. The ETag the script compares against from here on is the one `get()` returned.
7. **Check `--expect-etag`.** If it was given and the remote ETag is different, or there is no remote object, exit 1: "The remote changed since your dry run. Nothing was uploaded." Then a fresh dry run is the next step.
8. **Show the comparison.** Local and remote lines with albums, library albums, matchups and migration versions, plus the remote ETag and last-modified time. A warning when the remote has more matchups or more library albums than the local copy ("the deployed copy may hold answers your local file doesn't"). A warning when the local copy has a migration version that this checkout doesn't know, or the remote has a version the local copy lacks.
9. **Confirm.** No remote object: no confirmation needed. A remote object: `--yes`, or a typed `yes` on a terminal. With no terminal and no `--yes`, exit 1 and upload nothing. Any answer other than `yes` exits 1: "Not uploaded. Nothing was changed."
10. **Upload.** `put()` through `createAwsObjectStore`, with `ifMatch` set to the ETag from step 6, or `ifNoneMatch: "*"` when there was no object. On `ConditionFailedError`, exit 1: "The remote changed while this ran (someone used the app). Nothing was uploaded. Run a dry run again."
11. **Report and print the undo.** The new ETag and version id, the counts uploaded, and the previous object's version id. Then the undo commands:

    ```
    aws s3api get-object --bucket <bucket> --key album-ranker.db --version-id <previous> ./before-push.db
    aws s3api copy-object --bucket <bucket> --key album-ranker.db --copy-source "<bucket>/album-ranker.db?versionId=<previous>"
    ```

    The first fetches the old copy to inspect it. The second restores it in place, and S3 keeps the pushed version as a noncurrent one. With no previous object there is nothing to undo, and the script says so. If S3 returns no version id (versioning off), the script warns that there is no undo copy in S3 and points at the local backup from step 4.
12. **Clean up.** The temp folder is removed in a `finally`, whatever happened.

The app loads the new object on its next request (`lib/db/s3-sync.ts` checks the ETag each time) and runs any pending migrations on it.

## Dry run

`--dry-run` runs steps 1 to 3 and 5 to 8, then prints:

- "Dry run: nothing was uploaded."
- The command for the real run, with `--expect-etag <etag>` filled in (or no flag when there is no remote object), and `--confirm-production` when the environment is production.

It writes nothing to S3, makes no backup, and leaves only the temp folder, which it removes.

## Code layout

- **`lib/db/push.ts`**: `pushDatabase(options)`, the steps above with everything outside injected: the `ObjectStore`, the database and backup paths, a `confirm(summary)` callback, a `log` function and `dryRun` and `expectEtag`. It returns a result the CLI prints from: the summary, the backup path, the new and previous version ids and the undo commands. No `process.exit` and no AWS client in here, so tests drive it with a fake store.
- **`scripts/db-push.ts`**: argument parsing, the production check, the Terraform lookup (`execFileSync("terraform", [...])`, no shell), the S3 client, the terminal prompt (`readline`, as `scripts/restore.ts` does) and printing. Errors print the message and exit 1.
- **`lib/db/s3-store.ts`**: `head()` also returns `versionId` and `lastModified` when S3 sends them, and `put()` also returns `versionId`. Both fields are optional on the `ObjectStore` types in `lib/db/s3-sync.ts`. The app's sync ignores them, so its behaviour doesn't change.
- **`package.json`**: `"db:push": "node scripts/db-push.ts"`.
- **`README.md`**: in Deploy to AWS, "Back up, restore, undo a restore", the "Move your local data up" bullet becomes the `db:push` steps: dry run, then the real run with the printed command, then the undo commands. The manual table stays for downloading a backup and for going back to an older version.

## Tests

`lib/db/push.test.ts`, with a fake versioned store (a list of versions, each with a body, ETag and version id) and the local test database helpers from `lib/db/test-db.ts`:

- **Upload to an empty bucket:** writes with `ifNoneMatch: "*"`, asks for no confirmation, and the stored body is a database with the local counts.
- **Replace existing data:** asks `confirm` once with both sides' counts; on true, writes with `ifMatch` the read ETag and reports the previous version id.
- **Each way of uploading nothing**, table-driven: `confirm` says no; `expectEtag` differs; `expectEtag` given and no remote; the store's ETag changes between `get()` and `put()` (`ConditionFailedError`); the local file is missing. In each case the store has the same versions as before and the error says why.
- **Dry run:** no `put`, no backup file in the backup folder, the temp folder is gone, and the result has both sides' counts, the remote ETag and the next command with `--expect-etag`.
- **A backup exists before the upload:** the backup file is in the backup folder by the time the fake store's `put` runs, and its path is in the result.
- **A remote that isn't a database:** the summary says so, and on confirm the upload goes ahead.
- **Undo works:** after a push, putting the previous version's body back (what `copy-object` does) leaves the store holding the old counts; the printed commands name the bucket, key and previous version id.
- **Warnings:** table-driven over remote-has-more-matchups and the migration version mismatches.

`scripts/db-push.ts` argument parsing is a small exported `parseArgs` with a table-driven test: `production` without `--confirm-production`, a missing environment, two environments and an unknown flag each throw, and the Terraform runner and store factory are never called (both injected as spies).

`lib/db/s3-store.test.ts` gets cases for the new `versionId` and `lastModified` fields.

`npm test`, `npm run lint` and `npm run typecheck` pass. No `.db` file is in the diff.

### Proof

- The unit tests above.
- A dry run and a real run against a real bucket are **Not proven** in the PR: the agent team never runs this script or writes to the user's buckets. The user checks staging by hand: dry run, real run, then the app shows the counts the dry run reported.

## Not in scope

- Pulling a deployed database down to local, or copying between staging and production.
- Running `backfill-covers` or `import` against a deployed environment.
- Scheduled or automatic syncing, or running it from CI or the agent team.
- Any change to how the app's own per-request sync behaves.
- A `--restore-version` command; the undo is the two printed `aws` commands.

## Calls I made

- **Real runs need `--expect-etag` only if you want the dry-run check.** Without it the script still compares against the ETag it read at the start of the same run, shows the counts and asks. The dry run prints the full next command with the flag filled in, so following the printed steps gets the stronger check.
- **The dry run makes no backup.** The ticket asks that a dry run write nothing beyond a temp file; the backup happens on real runs only, before anything is uploaded.
- **The production flag is `--confirm-production`**, not `--production`, so it reads as a confirmation and can't be typed by accident in place of the environment.
- **Backups use the existing `manual` reason.** A new `pre-push` reason would change the backup file pattern in `lib/db/backup.ts` for little gain. Push backups count toward the newest 10 like any other.
- **A remote that isn't an album-ranker database can still be replaced**, after confirmation. Fixing a broken remote copy is one reason to push.
- **Undo is `copy-object` with the old version id**, one command that restores in place. The ticket's `get-object` command is printed too, for inspecting the old copy first.
- **`s3-store.ts` returns version id and last-modified time.** These are optional fields the app ignores, so the app's sync behaves the same.
- **No new dependencies.** The AWS SDK client is already in `dependencies`; Terraform is called with `execFileSync`.
- **Region:** `--region` or the SDK's default chain, with `followRegionRedirects` so a profile with another region still works.
