import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { migrate } from "./migrate";
import { memoryDb } from "./test-db";

const latest = readdirSync(join(process.cwd(), "lib", "db", "migrations")).filter((f) =>
  f.endsWith(".sql"),
).length;

describe("migrate", () => {
  it("brings a clean database to the latest version", () => {
    const db = memoryDb();
    const versions = db.prepare("SELECT version FROM schema_migrations ORDER BY version").all();
    expect(versions.map((v) => v.version)).toEqual(Array.from({ length: latest }, (_, i) => i + 1));
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
    expect(tables.map((t) => t.name)).toEqual(
      expect.arrayContaining([
        "artists",
        "albums",
        "year_entries",
        "matchups",
        "decade_list_entries",
        "import_review_items",
      ]),
    );
  });

  it("changes nothing when run again", () => {
    const db = memoryDb();
    const before = db.prepare("SELECT * FROM schema_migrations").all();
    expect(migrate(db)).toEqual([]);
    expect(db.prepare("SELECT * FROM schema_migrations").all()).toEqual(before);
  });

  it("adds the import columns", () => {
    const db = memoryDb();
    const columns = (table: string) =>
      db.prepare(`SELECT name FROM pragma_table_info('${table}')`).all().map((c) => c.name);
    expect(columns("year_entries")).toContain("source_decade_rank");
    expect(columns("import_review_items")).toEqual(expect.arrayContaining(["reason", "reason_detail"]));
  });
});
