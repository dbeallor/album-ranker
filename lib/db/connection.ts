import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { migrate } from "./migrate.ts";

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

/** Opens (creating if needed) the database at `path`, configures it and applies pending migrations. */
export function openDatabase(path: string): DatabaseSync {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new DatabaseSync(path);
  db.exec("PRAGMA busy_timeout = 5000"); // first, so the pragmas below wait for another process
  db.exec("PRAGMA foreign_keys = ON");
  enableWal(db);
  try {
    migrate(db);
  } catch (error) {
    db.close();
    throw error;
  }
  return db;
}
