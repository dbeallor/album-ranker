import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { getConfig } from "../config.ts";
import { backupDatabase } from "./backup.ts";
import { migrate, pendingMigrations } from "./migrate.ts";

/** Switching a new file to WAL can fail with "database is locked" while another process opens it, and the busy timeout doesn't cover that, so retry. */
function enableWal(db: DatabaseSync): void {
  for (let attempt = 1; ; attempt++) {
    try {
      db.exec("PRAGMA journal_mode = WAL");
      return;
    } catch (error) {
      if (attempt >= 50 || !(error instanceof Error) || !/locked|busy/i.test(error.message)) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
    }
  }
}

function hasData(path: string): boolean {
  // A WAL-mode file that was never checkpointed can have an empty main file and its data in the -wal file.
  return [path, `${path}-wal`].some((file) => existsSync(file) && statSync(file).size > 0);
}

export type OpenOptions = {
  /** Where the pre-migrate backup goes. Defaults to `BACKUP_DIR` from the config, read only when a backup is needed. */
  backupDir?: string;
  /** Folder of migration files. Defaults to `lib/db/migrations` under the working directory. */
  migrationsDir?: string;
};

/**
 * Opens (creating if needed) the database at `path`, configures it and applies pending migrations.
 * An existing file with data and a pending migration is backed up first (reason `pre-migrate`); if that fails, nothing is migrated.
 */
export function openDatabase(path: string, options: OpenOptions = {}): DatabaseSync {
  const existing = path !== ":memory:" && hasData(path);
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new DatabaseSync(path);
  db.exec("PRAGMA busy_timeout = 5000"); // first, so the pragmas below wait for another process
  db.exec("PRAGMA foreign_keys = ON");
  enableWal(db);
  try {
    if (existing && pendingMigrations(db, options.migrationsDir).length > 0) {
      backupDatabase(db, path, "pre-migrate", options.backupDir ?? getConfig().backupDir);
    }
    migrate(db, options.migrationsDir);
  } catch (error) {
    db.close();
    throw error;
  }
  return db;
}
