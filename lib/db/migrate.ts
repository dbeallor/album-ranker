import type { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATION_FILE = /^(\d+)_.+\.sql$/;

type Migration = { version: number; name: string; file: string };

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
  const done = new Set(
    db
      .prepare("SELECT version FROM schema_migrations")
      .all()
      .map((row) => Number(row.version)),
  );

  const applied: string[] = [];
  for (const migration of listMigrations(migrationsDir())) {
    if (done.has(migration.version)) continue;
    db.exec("BEGIN");
    try {
      db.exec(readFileSync(migration.file, "utf8"));
      db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
        migration.version,
        migration.name,
        new Date().toISOString(),
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Migration ${migration.name} failed: ${reason}`, { cause: error });
    }
    applied.push(migration.name);
  }
  return applied;
}
