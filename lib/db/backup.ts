import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { migrationVersions } from "./migrate.ts";

export type BackupReason = "manual" | "pre-migrate" | "pre-restore";

/** How many backups to keep per database file, all reasons counted together. */
export const KEEP_BACKUPS = 10;

const BACKUP_FILE = /^(\d{8}T\d{6}Z)-(manual|pre-migrate|pre-restore)(?:-(\d+))?\.db$/;

export type BackupFile = { name: string; path: string; reason: BackupReason; size: number; mtimeMs: number };
export type Counts = { albums: number; yearEntries: number; matchups: number };

/** The backup subfolder for one database file: its name plus a short hash of its absolute path, so two checkouts never share one. */
export function backupFolder(sourcePath: string, backupDir: string): string {
  const absolute = resolve(sourcePath);
  const hash = createHash("sha256").update(absolute).digest("hex").slice(0, 8);
  return join(backupDir, `${basename(absolute, extname(absolute))}-${hash}`);
}

function timestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

function removeFile(path: string): void {
  rmSync(path, { force: true });
}

/** Writes a consistent single-file copy of `db` (WAL contents included) to `target`, which must not exist. */
function vacuumInto(db: DatabaseSync, target: string): void {
  db.prepare("VACUUM INTO ?").run(target);
}

/** Opens `path` read-only, checks it is a healthy database with a `schema_migrations` table and returns its migration versions. */
function inspectBackup(path: string): number[] {
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(path, { readOnly: true });
  } catch (error) {
    throw new Error(`${path} is not a usable database: ${error instanceof Error ? error.message : error}`);
  }
  try {
    let checks: Record<string, unknown>[];
    try {
      checks = db.prepare("PRAGMA integrity_check").all();
    } catch (error) {
      throw new Error(`${path} is not a usable database: ${error instanceof Error ? error.message : error}`);
    }
    if (checks.length !== 1 || checks[0].integrity_check !== "ok") {
      throw new Error(`${path} failed the integrity check.`);
    }
    const table = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get();
    if (!table) {
      throw new Error(`${path} has no schema_migrations table, so it is not an album-ranker database.`);
    }
    return db.prepare("SELECT version FROM schema_migrations").all().map((row) => Number(row.version));
  } finally {
    db.close();
  }
}

/** Album, year entry and matchup counts of an open database; zeros when the tables don't exist yet. */
export function countRows(db: DatabaseSync): Counts {
  const count = (table: string): number => {
    try {
      return Number(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n ?? 0);
    } catch (error) {
      if (error instanceof Error && /no such table/.test(error.message)) return 0;
      throw error;
    }
  };
  return { albums: count("albums"), yearEntries: count("year_entries"), matchups: count("matchups") };
}

/** Counts rows of the database file at `path`, opened read-only. */
export function countRowsAt(path: string): Counts {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    return countRows(db);
  } finally {
    db.close();
  }
}

/** Backups in this database's folder, newest first. Missing folder gives an empty list. */
export function listBackups(sourcePath: string, backupDir: string): BackupFile[] {
  const folder = backupFolder(sourcePath, backupDir);
  if (!existsSync(folder)) return [];
  const found: { file: BackupFile; stamp: string; seq: number }[] = [];
  for (const name of readdirSync(folder)) {
    const match = BACKUP_FILE.exec(name);
    if (!match) continue;
    const path = join(folder, name);
    const { size, mtimeMs } = statSync(path);
    found.push({ file: { name, path, reason: match[2] as BackupReason, size, mtimeMs }, stamp: match[1], seq: Number(match[3] ?? 1) });
  }
  found.sort((a, b) => b.stamp.localeCompare(a.stamp) || b.file.mtimeMs - a.file.mtimeMs || b.seq - a.seq);
  return found.map((entry) => entry.file);
}

/** Deletes the oldest past KEEP_BACKUPS, but never `keep`: a clock set back could otherwise sort the file just written out of the newest 10. */
function prune(sourcePath: string, backupDir: string, keep: string): void {
  for (const file of listBackups(sourcePath, backupDir).slice(KEEP_BACKUPS)) {
    if (file.path !== keep) removeFile(file.path);
  }
}

/**
 * Copies the live database `db` (opened from `sourcePath`) into its backup folder and returns the new file's path.
 * Written to a temp name and renamed, checked with `integrity_check` (deleted on failure), mode 0600; then the oldest past KEEP_BACKUPS go.
 */
export function backupDatabase(db: DatabaseSync, sourcePath: string, reason: BackupReason, backupDir: string): string {
  mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  const folder = backupFolder(sourcePath, backupDir);
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  const sourceNote = join(folder, "source.txt");
  if (!existsSync(sourceNote)) {
    writeFileSync(sourceNote, `${resolve(sourcePath)}\n`, { mode: 0o600 });
  }

  const stamp = timestamp(new Date());
  let target = join(folder, `${stamp}-${reason}.db`);
  for (let n = 2; existsSync(target); n++) {
    target = join(folder, `${stamp}-${reason}-${n}.db`);
  }

  const temp = join(folder, `.tmp-${randomBytes(6).toString("hex")}.db`);
  try {
    vacuumInto(db, temp);
    chmodSync(temp, 0o600);
    inspectBackup(temp);
    renameSync(temp, target);
  } catch (error) {
    removeFile(temp);
    throw new Error(`Backup failed: ${error instanceof Error ? error.message : error}`, { cause: error });
  }
  prune(sourcePath, backupDir, target);
  return target;
}

/** Resolves `latest`, a file path, or a file name in this database's backup folder to an existing backup file. */
export function resolveBackupFile(argument: string, sourcePath: string, backupDir: string): string {
  if (argument === "latest") {
    const newest = listBackups(sourcePath, backupDir)[0];
    if (!newest) throw new Error(`No backups found in ${backupFolder(sourcePath, backupDir)}.`);
    return newest.path;
  }
  const asPath = resolve(argument);
  if (existsSync(asPath)) return asPath;
  const inFolder = join(backupFolder(sourcePath, backupDir), argument);
  if (existsSync(inFolder)) return inFolder;
  throw new Error(`Backup file not found: ${argument}`);
}

export type RestoreSummary = {
  targetPath: string;
  backupPath: string;
  current: Counts;
  /** True when the existing file could not be read (damaged); `current` is then all zeros and meaningless. */
  currentUnreadable?: boolean;
  backup: Counts;
  warnings: string[];
};

export type RestoreOptions = {
  backupFile: string;
  targetPath: string;
  backupDir: string;
  /** Called only when a database already exists at `targetPath`; return true to replace it. */
  confirm: (summary: RestoreSummary) => boolean | Promise<boolean>;
};

export type RestoreResult = {
  restored: boolean;
  summary: RestoreSummary;
  /** The `pre-restore` backup of the database that was replaced, if there was one. */
  preRestorePath?: string;
};

/** Writes a copy of the backup next to `targetPath` and returns its temp path. */
function copyBeside(backupFile: string, targetPath: string): string {
  mkdirSync(dirname(targetPath), { recursive: true });
  const temp = `${targetPath}.restore-${randomBytes(6).toString("hex")}.tmp`;
  const source = new DatabaseSync(backupFile, { readOnly: true });
  try {
    vacuumInto(source, temp);
  } catch (error) {
    removeFile(temp);
    throw error;
  } finally {
    source.close();
  }
  return temp;
}

/** For a live file that can't be opened: copies it (and its `-wal` and `-shm`) into the backup folder under a name no listing or pruning touches, and returns the main file's path. */
function keepRawFiles(targetPath: string, backupDir: string): string {
  const folder = backupFolder(targetPath, backupDir);
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  const base = join(folder, `${timestamp(new Date())}-pre-restore-unreadable.db.bak`);
  let kept = base;
  for (let n = 2; existsSync(kept); n++) kept = `${base}-${n}`;
  for (const suffix of ["", "-wal", "-shm"]) {
    if (existsSync(targetPath + suffix)) {
      copyFileSync(targetPath + suffix, kept + suffix);
      chmodSync(kept + suffix, 0o600);
    }
  }
  return kept;
}

/** Drops the old `-wal` and `-shm` and renames `temp` over the live file. The old WAL must go: left in place, SQLite would replay it onto the restored file. */
function swapIn(temp: string, targetPath: string): void {
  removeFile(`${targetPath}-wal`);
  removeFile(`${targetPath}-shm`);
  renameSync(temp, targetPath);
}

/** Restores `backupFile` over the database at `targetPath`. See the spec for the steps; nothing changes unless the backup is valid and (when a database exists) `confirm` says yes. */
export async function restoreDatabase(options: RestoreOptions): Promise<RestoreResult> {
  const { backupFile, targetPath, backupDir } = options;
  const versions = inspectBackup(backupFile);
  const known = new Set(migrationVersions());
  const warnings = versions.some((v) => !known.has(v))
    ? ["This backup is from a newer schema than this code knows. Restoring it anyway; the app may not work until you switch to the matching branch."]
    : [];
  const summary: RestoreSummary = {
    targetPath,
    backupPath: backupFile,
    current: { albums: 0, yearEntries: 0, matchups: 0 },
    backup: countRowsAt(backupFile),
    warnings,
  };

  if (!existsSync(targetPath)) {
    swapIn(copyBeside(backupFile, targetPath), targetPath);
    return { restored: true, summary };
  }

  let live: DatabaseSync | undefined;
  try {
    live = new DatabaseSync(targetPath);
    live.exec("PRAGMA busy_timeout = 5000");
    summary.current = countRows(live);
  } catch (error) {
    if (live?.isOpen) live.close();
    live = undefined;
    // Only a damaged file goes on (SQLITE_CORRUPT 11, SQLITE_NOTADB 26); a busy or unreadable one must not be replaced from raw bytes.
    const code = (error as { errcode?: number }).errcode;
    if (code !== 11 && code !== 26) throw error;
    // A damaged file is a main reason to restore, so keep its raw files instead of a VACUUM copy.
    summary.currentUnreadable = true;
  }
  try {
    if (!(await options.confirm(summary))) {
      return { restored: false, summary };
    }
    // Copy first: the pre-restore backup can prune the very file being restored.
    const temp = copyBeside(backupFile, targetPath);
    try {
      let preRestorePath: string;
      if (live) {
        preRestorePath = backupDatabase(live, targetPath, "pre-restore", backupDir);
        live.close();
        if (existsSync(`${targetPath}-wal`)) {
          // SQLite deletes the -wal when the last connection closes, so one that is left means another process has the file open.
          throw new Error("The database is still open in another process (is the app running?). Nothing was replaced. Stop it and run again.");
        }
      } else {
        preRestorePath = keepRawFiles(targetPath, backupDir);
      }
      swapIn(temp, targetPath);
      return { restored: true, summary, preRestorePath };
    } catch (error) {
      removeFile(temp);
      throw error;
    }
  } finally {
    if (live?.isOpen) live.close();
  }
}
