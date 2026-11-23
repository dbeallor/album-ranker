# As-built: Push local data to staging and production

**Shipped:** in PR #88
**Ticket:** ALBUM-86
**Spec:** [2026-11-23-album-86-local-data-sync.md](../specs/2026-11-23-album-86-local-data-sync.md)

## Differs from the spec

- The spec reads the remote with `head()` then `get()` and doesn't say what happens if the ETag changes between them. Shipped: that stops with "The remote changed while it was being read. Nothing was uploaded. Run again."
- The dry run's printed next command carries `--bucket` (and `--region` when given) as well as `--expect-etag` and `--confirm-production`, so it reaches the same bucket.
- Flags also accept `--flag=value`. A value flag with no value is an error.
