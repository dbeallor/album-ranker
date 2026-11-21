import type { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATION_FILE = /^(\d+)_.+\.sql$/;

type Migration = { version: number; name: string; file: string };

/** Relative to the working directory, so run the app and the migrate script from the repo root. */
function migrationsDir(): string {
  return join(process.cwd(), "lib", "db", "migrations");
}

function listMigrations(dir: string): Migration[] {
  const migrations: Migration[] = [];
  for (const file of readdirSync(dir)) {
    const match = MIGRATION_FILE.exec(file);
    if (match) {
      migrations.push({ version: Number(match[1]), name: file, file: join(dir, file) });
    }
  }
  return migrations.sort((a, b) => a.version - b.version);
}

/** Applies the migrations not yet recorded, in number order, each in its own transaction. Returns the names applied. */
export function migrate(db: DatabaseSync): string[] {
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version INTEGER PRIMARY KEY,
       name TEXT NOT NULL,
       applied_at TEXT NOT NULL
     )`,
  );
  const applied: string[] = [];
  for (const migration of listMigrations(migrationsDir())) {
    // IMMEDIATE takes the write lock first, so a second process waits and then sees this version recorded.
    db.exec("BEGIN IMMEDIATE");
    try {
      const recorded = db.prepare("SELECT 1 FROM schema_migrations WHERE version = ?").get(migration.version);
      if (recorded) {
        db.exec("COMMIT");
        continue;
      }
      db.exec(readFileSync(migration.file, "utf8"));
      db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
        migration.version,
        migration.name,
        new Date().toISOString(),
      );
      db.exec("COMMIT");
    } catch (error) {
      if (db.isTransaction) db.exec("ROLLBACK");
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Migration ${migration.name} failed: ${reason}`, { cause: error });
    }
    applied.push(migration.name);
  }
  return applied;
}
