# ALBUM-86 plan: db:push

Spec: `docs/superpowers/specs/2026-11-23-album-86-local-data-sync.md` (approved). Follow it exactly.

## Tasks (in order)

1. **Store metadata.** `lib/db/s3-sync.ts`: add optional `versionId` and `lastModified` to the `head()` result and optional `versionId` to the `put()` result on `ObjectStore`. `lib/db/s3-store.ts`: fill them from `HeadObjectCommand` (`VersionId`, `LastModified`) and `PutObjectCommand` (`VersionId`). Extend `s3-store.test.ts`. The app's sync behaviour is unchanged.
2. **`lib/db/push.ts`** with `pushDatabase(options)` (steps 3 to 12 of the spec, all I/O injected: store, database path, backup dir, temp dir root, `confirm`, `log`, `dryRun`, `expectEtag`). Returns a result with summaries, backup path, new and previous version ids, and the undo commands. No `process.exit`, no AWS client. Tests in `lib/db/push.test.ts` per the spec's Tests section, with a fake versioned store and temp dirs (never `data/`).
3. **`scripts/db-push.ts`** and `package.json` `"db:push"`. Export `parseArgs` (and keep the side-effecting main behind an `import.meta` main-check or a separate function so tests import it safely). Production without `--confirm-production` throws before Terraform or AWS. Terraform via `execFileSync("terraform", ["-chdir=infra/envs/<env>", "output", "-raw", "data_bucket"])`. S3 client `new S3Client({ region, followRegionRedirects: true })`. Table-driven `parseArgs` test with spies.
4. **README.** Replace the "Move your local data up" bullet in "Back up, restore, undo a restore" with the `db:push` steps (dry run, real run, undo commands).

Verify: `npm test`, `npm run lint`, `npm run typecheck`. Never run `db:push` or any AWS command; no `.db` file in the diff.
