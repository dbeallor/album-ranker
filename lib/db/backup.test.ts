import { DatabaseSync } from "node:sqlite";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAlbum } from "./albums";
import {
  KEEP_BACKUPS,
  backupDatabase,
  backupFolder,
  countRows,
  listBackups,
  resolveBackupFile,
  restoreDatabase,
} from "./backup";
import { openDatabase } from "./connection.ts";
import { memoryDbAt } from "./test-db";

let root: string;
let backupDir: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "album-ranker-backup-test-"));
  backupDir = join(root, "backups");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Opens a new database file in the temp folder and adds `albums` albums (one library album and one matchup when there are two or more). */
function seededDb(name: string, albums: number): { db: DatabaseSync; path: string } {
  const path = join(root, name);
  const db = openDatabase(path);
  const ids = Array.from({ length: albums }, (_, i) => createAlbum(db, { title: `Album ${i}`, artist: { name: `Artist ${i}` } }).id);
  if (ids.length >= 2) {
    db.prepare("INSERT INTO library_albums (album_id, year, added_at) VALUES (?, 2020, 'now')").run(ids[0]);
    db.prepare("INSERT INTO matchups (album_a_id, album_b_id, result, created_at) VALUES (?, ?, 'a', 'now')").run(ids[0], ids[1]);
  }
  return { db, path };
}

const yes = () => true;
const no = () => false;

describe("countRows", () => {
  it("counts library albums on a new database, and year entries on one from before migration 003", () => {
    const old = memoryDbAt(2);
    old.exec(`
      INSERT INTO artists (id, name) VALUES (1, 'A');
      INSERT INTO albums (id, title, artist_id, created_at) VALUES (1, 'One', 1, 'c'), (2, 'Two', 1, 'c'), (3, 'Three', 1, 'c');
      INSERT INTO year_entries (album_id, year, placement, created_at, updated_at) VALUES (1, 2020, 'listed', 'c', 'u'), (2, 2021, 'listed', 'c', 'u');
      INSERT INTO matchups (album_a_id, album_b_id, result, created_at) VALUES (1, 2, 'a', 'c');
    `);
    expect(countRows(old)).toEqual({ albums: 3, libraryAlbums: 2, matchups: 1 });

    const fresh = openDatabase(":memory:");
    fresh.exec(`
      INSERT INTO artists (id, name) VALUES (1, 'A');
      INSERT INTO albums (id, title, artist_id, created_at) VALUES (1, 'One', 1, 'c'), (2, 'Two', 1, 'c'), (3, 'Three', 1, 'c');
      INSERT INTO library_albums (album_id, year, added_at) VALUES (1, 2020, 'c'), (2, 2021, 'c'), (3, 2022, 'c');
    `);
    expect(countRows(fresh)).toEqual({ albums: 3, libraryAlbums: 3, matchups: 0 });
  });
});

describe("backupDatabase", () => {
  it("copies rows that are still only in the -wal file, and the copy passes integrity_check", () => {
    const { db, path } = seededDb("live.db", 3);
    expect(statSync(`${path}-wal`).size).toBeGreaterThan(0); // not checkpointed

    const backupPath = backupDatabase(db, path, "manual", backupDir);

    const copy = new DatabaseSync(backupPath, { readOnly: true });
    expect(copy.prepare("PRAGMA integrity_check").all()).toEqual([{ integrity_check: "ok" }]);
    expect(countRows(copy)).toEqual({ albums: 3, libraryAlbums: 1, matchups: 1 });
    copy.close();
    db.close();
  });

  it("writes a timestamped name, 0600 file, 0700 folders and a source.txt", () => {
    const { db, path } = seededDb("live.db", 1);
    const first = backupDatabase(db, path, "manual", backupDir);
    const second = backupDatabase(db, path, "manual", backupDir);
    db.close();

    const folder = backupFolder(path, backupDir);
    expect(first).toMatch(/\/live-[0-9a-f]{8}\/\d{8}T\d{6}Z-manual(-2)?\.db$/);
    expect(first).not.toBe(second);
    expect(statSync(first).mode & 0o777).toBe(0o600);
    expect(statSync(folder).mode & 0o777).toBe(0o700);
    expect(readFileSync(join(folder, "source.txt"), "utf8").trim()).toBe(path);
    expect(readdirSync(folder).filter((f) => f.startsWith(".tmp-"))).toEqual([]);
  });

  it("keeps the newest 10 and deletes the rest", () => {
    const { db, path } = seededDb("live.db", 1);
    const folder = backupFolder(path, backupDir);
    const first = backupDatabase(db, path, "manual", backupDir);
    // Eleven older backups with distinct past timestamps, so 12 exist before the next one.
    const older = Array.from({ length: 11 }, (_, i) => join(folder, `20200101T0000${String(i).padStart(2, "0")}Z-manual.db`));
    for (const file of older) copyFileSync(first, file);

    const latest = backupDatabase(db, path, "manual", backupDir);
    db.close();

    const kept = listBackups(path, backupDir).map((f) => f.path);
    expect(kept).toHaveLength(KEEP_BACKUPS);
    expect(kept[0]).toBe(latest);
    expect(kept).toContain(first);
    expect(existsSync(older[0])).toBe(false); // the oldest went
    expect(existsSync(older[2])).toBe(false);
    expect(existsSync(older[3])).toBe(true);
  });

  it("never prunes the backup it just wrote, even when ten later-dated ones exist", () => {
    const { db, path } = seededDb("live.db", 1);
    const folder = backupFolder(path, backupDir);
    const first = backupDatabase(db, path, "manual", backupDir);
    for (let i = 0; i < KEEP_BACKUPS; i++) copyFileSync(first, join(folder, `20990101T0000${String(i).padStart(2, "0")}Z-manual.db`));

    const written = backupDatabase(db, path, "pre-restore", backupDir);
    db.close();

    expect(existsSync(written)).toBe(true);
  });

  it("does not prune another database's backups", () => {
    const a = seededDb("a.db", 1);
    const b = seededDb("b.db", 1);
    backupDatabase(b.db, b.path, "manual", backupDir);
    for (let i = 0; i < KEEP_BACKUPS + 2; i++) backupDatabase(a.db, a.path, "manual", backupDir);
    a.db.close();
    b.db.close();

    expect(listBackups(a.path, backupDir)).toHaveLength(KEEP_BACKUPS);
    expect(listBackups(b.path, backupDir)).toHaveLength(1);
    expect(backupFolder(a.path, backupDir)).not.toBe(backupFolder(b.path, backupDir));
  });
});

describe("restoreDatabase", () => {
  it("restores into an empty location and gives the same rows", async () => {
    const source = seededDb("source.db", 3);
    const backupPath = backupDatabase(source.db, source.path, "manual", backupDir);
    source.db.close();
    const target = join(root, "new", "target.db");

    const result = await restoreDatabase({ backupFile: backupPath, targetPath: target, backupDir, confirm: no });

    expect(result.restored).toBe(true);
    expect(result.preRestorePath).toBeUndefined();
    const restored = new DatabaseSync(target, { readOnly: true });
    expect(countRows(restored)).toEqual({ albums: 3, libraryAlbums: 1, matchups: 1 });
    restored.close();
  });

  const overExisting = [
    { name: "without confirmation changes nothing", confirm: no, restored: false, albums: 1 },
    { name: "with confirmation replaces the data", confirm: yes, restored: true, albums: 3 },
  ];
  it.each(overExisting)("over an existing database $name", async ({ confirm, restored, albums }) => {
    const source = seededDb("source.db", 3);
    const backupPath = backupDatabase(source.db, source.path, "manual", backupDir);
    source.db.close();
    // The live database stays open, so its recent writes are still only in the -wal file.
    const live = seededDb("live.db", 1);
    expect(statSync(`${live.path}-wal`).size).toBeGreaterThan(0);
    const before = readFileSync(live.path);
    // Replacing needs the app stopped, so only the unconfirmed run keeps the connection open.
    if (restored) live.db.close();

    const result = await restoreDatabase({ backupFile: backupPath, targetPath: live.path, backupDir, confirm });

    expect(result.restored).toBe(restored);
    expect(result.summary.current.albums).toBe(1);
    expect(result.summary.backup.albums).toBe(3);
    if (!restored) {
      expect(readFileSync(live.path)).toEqual(before);
      expect(existsSync(`${live.path}-wal`)).toBe(true);
      expect(listBackups(live.path, backupDir)).toEqual([]);
      live.db.close();
      return;
    }
    expect(existsSync(`${live.path}-wal`)).toBe(false);
    expect(existsSync(`${live.path}-shm`)).toBe(false);
    const db = new DatabaseSync(live.path, { readOnly: true });
    expect(countRows(db).albums).toBe(albums);
    db.close();
    const kept = listBackups(live.path, backupDir);
    expect(kept.map((f) => f.reason)).toEqual(["pre-restore"]);
    expect(kept[0].path).toBe(result.preRestorePath);
    const old = new DatabaseSync(kept[0].path, { readOnly: true });
    expect(countRows(old).albums).toBe(1);
    old.close();
  });

  it("can restore the oldest of a full set of backups", async () => {
    const live = seededDb("live.db", 1);
    const backups = Array.from({ length: KEEP_BACKUPS }, () => backupDatabase(live.db, live.path, "manual", backupDir));
    live.db.close();
    const oldest = listBackups(live.path, backupDir).at(-1)!.path;
    expect(backups).toContain(oldest);

    const result = await restoreDatabase({ backupFile: oldest, targetPath: live.path, backupDir, confirm: yes });

    expect(result.restored).toBe(true);
    expect(listBackups(live.path, backupDir)).toHaveLength(KEEP_BACKUPS);
  });

  const invalid = [
    { name: "isn't a database", write: (path: string) => writeFileSync(path, "this is not a database file at all, just text") },
    {
      name: "has no schema_migrations table",
      write: (path: string) => {
        const db = new DatabaseSync(path);
        db.exec("CREATE TABLE other (id INTEGER)");
        db.close();
      },
    },
  ];
  it.each(invalid)("refuses a file that $name and changes nothing", async ({ write }) => {
    const live = seededDb("live.db", 1);
    live.db.close();
    const before = readFileSync(live.path);
    const bad = join(root, "bad.db");
    write(bad);

    await expect(
      restoreDatabase({ backupFile: bad, targetPath: live.path, backupDir, confirm: yes }),
    ).rejects.toThrow(bad);

    expect(readFileSync(live.path)).toEqual(before);
    expect(listBackups(live.path, backupDir)).toEqual([]);
  });

  it("replaces a damaged live file after confirming, keeping its raw files", async () => {
    const source = seededDb("source.db", 3);
    const backup = backupDatabase(source.db, source.path, "manual", backupDir);
    source.db.close();
    const livePath = join(root, "live.db");
    writeFileSync(livePath, "damaged, not a database");

    const result = await restoreDatabase({
      backupFile: backup,
      targetPath: livePath,
      backupDir,
      confirm: (summary) => summary.currentUnreadable === true,
    });

    expect(result.restored).toBe(true);
    expect(readFileSync(result.preRestorePath!, "utf8")).toBe("damaged, not a database");
    const db = new DatabaseSync(livePath, { readOnly: true });
    expect(countRows(db).albums).toBe(3);
    db.close();
  });

  it("stops without replacing anything while another process still has the database open", async () => {
    const source = seededDb("source.db", 3);
    const backup = backupDatabase(source.db, source.path, "manual", backupDir);
    source.db.close();
    const live = seededDb("live.db", 1);
    const before = countRows(live.db);

    await expect(
      restoreDatabase({ backupFile: backup, targetPath: live.path, backupDir, confirm: yes }),
    ).rejects.toThrow(/still open in another process/);

    expect(countRows(live.db)).toEqual(before);
    live.db.close();
    expect(readdirSync(root).filter((name) => name.includes(".restore-"))).toEqual([]);
  });

  it("warns, but restores, a backup from a newer schema", async () => {
    const source = seededDb("source.db", 1);
    source.db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (999, '999_future.sql', 'now')").run();
    const backupPath = backupDatabase(source.db, source.path, "manual", backupDir);
    source.db.close();

    const result = await restoreDatabase({ backupFile: backupPath, targetPath: join(root, "t.db"), backupDir, confirm: yes });

    expect(result.restored).toBe(true);
    expect(result.summary.warnings).toHaveLength(1);
  });
});

describe("resolveBackupFile", () => {
  it("accepts latest, a path, or a name in the backup folder, and rejects the rest", () => {
    const { db, path } = seededDb("live.db", 1);
    const made = backupDatabase(db, path, "manual", backupDir);
    db.close();
    const name = made.split("/").pop()!;

    expect(resolveBackupFile("latest", path, backupDir)).toBe(made);
    expect(resolveBackupFile(made, path, backupDir)).toBe(made);
    expect(resolveBackupFile(name, path, backupDir)).toBe(made);
    expect(() => resolveBackupFile("nope.db", path, backupDir)).toThrow("not found");
    expect(() => resolveBackupFile("latest", join(root, "other.db"), backupDir)).toThrow("No backups");
  });
});
