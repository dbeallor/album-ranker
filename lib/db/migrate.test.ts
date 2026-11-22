import { DatabaseSync } from "node:sqlite";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { migrate } from "./migrate";
import { memoryDb, memoryDbAt } from "./test-db";

const MIGRATIONS = join(process.cwd(), "lib", "db", "migrations");
const latest = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).length;

const names = (db: DatabaseSync, type = "table") =>
  db.prepare(`SELECT name FROM sqlite_master WHERE type = '${type}'`).all().map((t) => t.name);

describe("migrate", () => {
  it("brings a clean database to the latest version", () => {
    const db = memoryDb();
    const versions = db.prepare("SELECT version FROM schema_migrations ORDER BY version").all();
    expect(versions.map((v) => v.version)).toEqual(Array.from({ length: latest }, (_, i) => i + 1));
    expect(names(db)).toEqual(
      expect.arrayContaining(["artists", "albums", "library_albums", "matchups", "import_review_items"]),
    );
    expect(names(db)).not.toContain("year_entries");
    expect(names(db)).not.toContain("decade_list_entries");
  });

  it("changes nothing when run again", () => {
    const db = memoryDb();
    const before = db.prepare("SELECT * FROM schema_migrations").all();
    expect(migrate(db)).toEqual([]);
    expect(db.prepare("SELECT * FROM schema_migrations").all()).toEqual(before);
  });

  it("keeps the import review columns", () => {
    const db = memoryDb();
    const columns = db.prepare("SELECT name FROM pragma_table_info('import_review_items')").all().map((c) => c.name);
    expect(columns).toEqual(expect.arrayContaining(["reason", "reason_detail", "source_decade_rank"]));
  });
});

describe("migration 003_library", () => {
  /** A database at migration 002 filled with year entries of each placement, decade entries and matchups. */
  function databaseAt002(): DatabaseSync {
    const db = memoryDbAt(2);
      db.exec(`
        INSERT INTO artists (id, name) VALUES (1, 'Fake Artist A'), (2, 'Fake Artist B');
        INSERT INTO albums (id, title, artist_id, release_year, created_at) VALUES
          (1, 'Ranked', 1, 1975, 'c1'), (2, 'Mention', 1, 1975, 'c2'), (3, 'Listed', 2, 1990, 'c3'),
          (4, 'Sourced', 2, 1991, 'c4'), (5, 'No Entry', 2, 2001, 'c5');
        INSERT INTO year_entries (album_id, year, placement, rank, source_title, source_artist, source_year, created_at, updated_at)
          VALUES (1, 1975, 'ranked', 1, NULL, NULL, NULL, 'e1', 'u1'),
                 (2, 1976, 'honorable_mention', NULL, NULL, NULL, NULL, 'e2', 'u2'),
                 (3, 1990, 'listed', NULL, NULL, NULL, NULL, 'e3', 'u3'),
                 (4, 1991, 'ranked', 2, 'Sheet Title', 'Sheet Artist', 1991, 'e4', 'u4');
        INSERT INTO decade_list_entries (decade, album_id, position) VALUES (1970, 1, 1);
        INSERT INTO matchups (album_a_id, album_b_id, result, created_at) VALUES (1, 3, 'a', 'm1'), (2, 4, 'tie', 'm2');
      `);
    return db;
  }

  it("turns each year entry into a library album with the same year, added time and source", () => {
    const db = databaseAt002();
    expect(migrate(db)).toEqual(["003_library.sql"]);

    expect(db.prepare("SELECT * FROM library_albums ORDER BY album_id").all().map((row) => ({ ...row }))).toEqual([
      { album_id: 1, year: 1975, added_at: "e1", source_title: null, source_artist: null, source_year: null },
      { album_id: 2, year: 1976, added_at: "e2", source_title: null, source_artist: null, source_year: null },
      { album_id: 3, year: 1990, added_at: "e3", source_title: null, source_artist: null, source_year: null },
      { album_id: 4, year: 1991, added_at: "e4", source_title: "Sheet Title", source_artist: "Sheet Artist", source_year: 1991 },
    ]);
  });

  it("keeps every matchup and every album, and drops the year entry and decade list tables", () => {
    const db = databaseAt002();
    migrate(db);

    expect(db.prepare("SELECT COUNT(*) AS n FROM matchups").get()!.n).toBe(2);
    expect(db.prepare("SELECT COUNT(*) AS n FROM albums").get()!.n).toBe(5);
    expect(names(db)).not.toContain("year_entries");
    expect(names(db)).not.toContain("decade_list_entries");
  });

  it("rolls back whole when it fails, leaving 002 as it was", () => {
    const db = databaseAt002();
    // An existing library_albums table makes the first statement fail.
    db.exec("CREATE TABLE library_albums (x INTEGER)");
    expect(() => migrate(db)).toThrow(/003_library.sql failed/);
    expect(names(db)).toContain("year_entries");
    expect(names(db)).toContain("decade_list_entries");
    expect(db.prepare("SELECT COUNT(*) AS n FROM year_entries").get()!.n).toBe(4);
  });
});
