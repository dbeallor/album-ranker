import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { getConfig } from "../lib/config.ts";
import { KEEP_BACKUPS, backupDatabase, backupFolder, countRowsAt, listBackups } from "../lib/db/backup.ts";

const { databasePath, backupDir } = getConfig();

function kib(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1024))} KiB`;
}

function list(): void {
  const backups = listBackups(databasePath, backupDir);
  console.log(`Backups of ${databasePath} in ${backupFolder(databasePath, backupDir)}`);
  if (backups.length === 0) {
    console.log("None yet. Run `npm run db:backup` to make one.");
    return;
  }
  for (const backup of backups) {
    let counts: string;
    try {
      const { albums, libraryAlbums, matchups } = countRowsAt(backup.path);
      counts = `${albums} albums, ${libraryAlbums} library albums, ${matchups} matchups`;
    } catch {
      counts = "unreadable";
    }
    console.log(`${backup.name}  ${kib(backup.size).padStart(8)}  ${counts}`);
  }
}

function backUp(): void {
  if (!existsSync(databasePath)) {
    throw new Error(`There is no database at ${databasePath}, so there is nothing to back up.`);
  }
  // Opened as-is: a backup command must not run migrations or change the schema.
  const db = new DatabaseSync(databasePath);
  try {
    db.exec("PRAGMA busy_timeout = 5000");
    const path = backupDatabase(db, databasePath, "manual", backupDir);
    console.log(`Backed up ${databasePath} to ${path}`);
    console.log(`Keeping the newest ${KEEP_BACKUPS} backups of this database (${listBackups(databasePath, backupDir).length} now).`);
  } finally {
    db.close();
  }
}

try {
  const [command, ...rest] = process.argv.slice(2);
  if (command === undefined) {
    backUp();
  } else if (command === "list" && rest.length === 0) {
    list();
  } else {
    throw new Error("Usage: npm run db:backup [-- list]");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
