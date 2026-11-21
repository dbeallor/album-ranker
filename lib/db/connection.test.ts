import { DatabaseSync } from "node:sqlite";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listBackups } from "./backup";
import { openDatabase } from "./connection.ts";

let root: string;
let backupDir: string;
let oldMigrations: string;
let newMigrations: string;
let dbPath: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "album-ranker-connection-test-"));
  backupDir = join(root, "backups");
  dbPath = join(root, "live.db");
  oldMigrations = join(root, "migrations-old");
  newMigrations = join(root, "migrations-new");
  for (const dir of [oldMigrations, newMigrations]) {
    mkdirSync(dir);
    copyFileSync(join(process.cwd(), "lib", "db", "migrations", "001_initial.sql"), join(dir, "001_initial.sql"));
  }
  writeFileSync(join(newMigrations, "002_extra.sql"), "CREATE TABLE extra (id INTEGER PRIMARY KEY);");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function tables(path: string): string[] {
  const db = new DatabaseSync(path, { readOnly: true });
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => String(row.name));
  db.close();
  return names;
}

describe("openDatabase backup before migrating", () => {
  it("backs up an existing file with a pending migration, holding the old schema", () => {
    openDatabase(dbPath, { backupDir, migrationsDir: oldMigrations }).close();

    openDatabase(dbPath, { backupDir, migrationsDir: newMigrations }).close();

    const backups = listBackups(dbPath, backupDir);
    expect(backups.map((b) => b.reason)).toEqual(["pre-migrate"]);
    expect(tables(backups[0].path)).not.toContain("extra");
    expect(tables(dbPath)).toContain("extra");
  });

  const noBackup = [
    { name: "a new file", first: undefined, second: newMigrations },
    { name: "an up-to-date file", first: newMigrations, second: newMigrations },
    { name: "an in-memory database", first: undefined, second: newMigrations, path: ":memory:" },
  ];
  it.each(noBackup)("takes none for $name", ({ first, second, path }) => {
    if (first) openDatabase(dbPath, { backupDir, migrationsDir: first }).close();

    openDatabase(path ?? dbPath, { backupDir, migrationsDir: second }).close();

    expect(existsSync(backupDir)).toBe(false);
  });

  it("stops before migrating when the backup fails", () => {
    openDatabase(dbPath, { backupDir: join(root, "unused"), migrationsDir: oldMigrations }).close();
    const blocker = join(root, "not-a-folder");
    writeFileSync(blocker, "a file where the backup folder should be");

    expect(() => openDatabase(dbPath, { backupDir: blocker, migrationsDir: newMigrations })).toThrow();

    expect(tables(dbPath)).not.toContain("extra");
  });
});
