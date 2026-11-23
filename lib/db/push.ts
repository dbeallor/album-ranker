import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backupDatabase, countRowsAt, inspectBackup, type Counts } from "./backup.ts";
import { migrationVersions } from "./migrate.ts";
import { ConditionFailedError, type ObjectStore } from "./s3-sync.ts";

export type DeployTarget = "staging" | "production";

/** What one side of the push holds. */
export type Side = { counts: Counts; versions: number[] };

export type RemoteSide = {
  etag: string;
  versionId?: string;
  lastModified?: Date;
  /** Absent when the stored object is not an album-ranker database; `unreadable` then says why. */
  data?: Side;
  unreadable?: string;
};

export type PushSummary = {
  local: Side;
  /** Null when nothing is stored yet. */
  remote: RemoteSide | null;
  warnings: string[];
};

export type PushOptions = {
  store: ObjectStore;
  environment: DeployTarget;
  bucket: string;
  /** The object key, used in the undo commands. */
  key?: string;
  /** Printed back in the next command so a dry run's follow-up reaches the same bucket. */
  region?: string;
  databasePath: string;
  backupDir: string;
  /** Where the temp folder goes. Defaults to the system temp folder. */
  tempRoot?: string;
  /** Called only when an object is already stored; return true to replace it. */
  confirm: (summary: PushSummary) => boolean | Promise<boolean>;
  log: (message: string) => void;
  dryRun?: boolean;
  expectEtag?: string;
};

export type PushResult = {
  dryRun: boolean;
  summary: PushSummary;
  /** The local backup made before the upload; none on a dry run. */
  backupPath?: string;
  /** The command that does the real run, on a dry run. */
  nextCommand?: string;
  /** After an upload. */
  uploaded?: { etag: string; versionId?: string; counts: Counts };
  /** The version the upload replaced, when S3 reported one. */
  previousVersionId?: string;
  /** After an upload: the commands that put the previous version back, and a note when there are none. */
  undo?: { commands: string[]; note?: string };
};

const KEY = "album-ranker.db";

export function describeCounts(counts: Counts): string {
  return `${counts.albums} albums, ${counts.libraryAlbums} library albums, ${counts.matchups} matchups`;
}

/** Single-quotes `value` for a POSIX shell, so an ETag with quotes in it can be pasted. */
function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function nextCommand(options: PushOptions, etag: string | undefined): string {
  return [
    "npm run db:push --",
    options.environment,
    `--bucket ${shellQuote(options.bucket)}`,
    ...(options.region ? [`--region ${shellQuote(options.region)}`] : []),
    ...(etag ? [`--expect-etag ${shellQuote(etag)}`] : []),
    ...(options.environment === "production" ? ["--confirm-production"] : []),
  ].join(" ");
}

function undoFor(bucket: string, key: string, previous: string): string[] {
  return [
    `aws s3api get-object --bucket ${bucket} --key ${key} --version-id ${previous} ./before-push.db`,
    `aws s3api copy-object --bucket ${bucket} --key ${key} --copy-source "${bucket}/${key}?versionId=${previous}"`,
  ];
}

function warningsFor(local: Side, remote: RemoteSide | null): string[] {
  const warnings: string[] = [];
  const known = new Set(migrationVersions());
  if (local.versions.some((version) => !known.has(version))) {
    warnings.push("The local database has a migration version this checkout doesn't know. It comes from a newer branch; the deployed app may not run it.");
  }
  if (remote?.data) {
    const { counts, versions } = remote.data;
    if (counts.matchups > local.counts.matchups || counts.libraryAlbums > local.counts.libraryAlbums) {
      warnings.push("The deployed copy has more matchups or library albums than your local file. It may hold answers your local file doesn't.");
    }
    const have = new Set(local.versions);
    if (versions.some((version) => !have.has(version))) {
      warnings.push("The deployed copy has a migration version your local file lacks. The upload would drop that schema change.");
    }
  }
  return warnings;
}

/**
 * Uploads a consistent copy of the local database to the store. See the spec for the steps. Nothing is uploaded unless the copy
 * checks out, any `expectEtag` still matches, a stored object (if any) is confirmed, and the conditional write holds.
 * Every refusal throws an Error whose message says why and that nothing was uploaded.
 */
export async function pushDatabase(options: PushOptions): Promise<PushResult> {
  const { store, databasePath, backupDir, log, dryRun = false } = options;
  const key = options.key ?? KEY;
  if (!existsSync(databasePath)) {
    throw new Error(`There is no database at ${databasePath}, so there is nothing to push.`);
  }

  const folder = mkdtempSync(join(options.tempRoot ?? tmpdir(), "album-ranker-push-"));
  try {
    const uploadPath = join(folder, "upload.db");
    let backupPath: string | undefined;
    // Opened as-is: pushing must not run migrations on the local file.
    const live = new DatabaseSync(databasePath);
    try {
      live.exec("PRAGMA busy_timeout = 5000");
      if (!dryRun) {
        backupPath = backupDatabase(live, databasePath, "manual", backupDir);
        log(`Backed up ${databasePath} to ${backupPath}`);
      }
      live.prepare("VACUUM INTO ?").run(uploadPath);
    } finally {
      live.close();
    }
    const local: Side = { versions: inspectBackup(uploadPath), counts: countRowsAt(uploadPath) };

    const head = await store.head();
    let remote: RemoteSide | null = null;
    if (head) {
      const object = await store.get();
      if (!object || object.etag !== head.etag) {
        throw new Error("The remote changed while it was being read. Nothing was uploaded. Run again.");
      }
      remote = { etag: object.etag, versionId: head.versionId, lastModified: head.lastModified };
      const remotePath = join(folder, "remote.db");
      writeFileSync(remotePath, object.body, { mode: 0o600 });
      try {
        remote.data = { versions: inspectBackup(remotePath), counts: countRowsAt(remotePath) };
      } catch (error) {
        remote.unreadable = error instanceof Error ? error.message.replaceAll(remotePath, "the remote object") : String(error);
      }
    }

    if (options.expectEtag !== undefined && remote?.etag !== options.expectEtag) {
      throw new Error("The remote changed since your dry run. Nothing was uploaded. Run a dry run again.");
    }

    const summary: PushSummary = { local, remote, warnings: warningsFor(local, remote) };

    if (dryRun) {
      return { dryRun, summary, nextCommand: nextCommand(options, remote?.etag) };
    }

    if (remote && !(await options.confirm(summary))) {
      throw new Error("Not uploaded. Nothing was changed.");
    }

    let stored: { etag: string; versionId?: string };
    try {
      const body = readFileSync(uploadPath);
      stored = await store.put(body, remote ? { ifMatch: remote.etag } : { ifNoneMatch: "*" });
    } catch (error) {
      if (error instanceof ConditionFailedError) {
        throw new Error("The remote changed while this ran (someone used the app). Nothing was uploaded. Run a dry run again.", { cause: error });
      }
      throw error;
    }

    const result: PushResult = {
      dryRun,
      summary,
      backupPath,
      uploaded: { etag: stored.etag, versionId: stored.versionId, counts: local.counts },
      previousVersionId: remote?.versionId,
    };
    if (!remote) {
      result.undo = { commands: [], note: "There was no previous object, so there is nothing to undo." };
    } else if (remote.versionId) {
      result.undo = { commands: undoFor(options.bucket, key, remote.versionId) };
    } else {
      result.undo = { commands: [], note: `S3 reported no version id, so there is no undo copy in S3 (is versioning off?). The local backup is at ${backupPath}.` };
    }
    return result;
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}
