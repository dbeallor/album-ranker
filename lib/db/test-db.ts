import { DatabaseSync } from "node:sqlite";
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAlbum } from "./albums";
import { openDatabase } from "./connection.ts";
import { migrate } from "./migrate.ts";
import { DataError } from "./types";

/** A fresh in-memory database with all migrations applied. Tests use this and never open a file. */
export function memoryDb(): DatabaseSync {
  return openDatabase(":memory:");
}

/** Runs `fn` and returns the code of the DataError it throws; fails if it throws anything else or nothing. */
export function errorCode(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof DataError) return error.code;
    throw error;
  }
  throw new Error("Expected a DataError, but nothing was thrown.");
}

/** Creates `count` manual albums by distinct artists and returns their ids. */
export function seedAlbums(db: DatabaseSync, count: number): number[] {
  return Array.from({ length: count }, (_, i) =>
    createAlbum(db, { title: `Album ${i + 1}`, artist: { name: `Artist ${i + 1}` } }).id,
  );
}

/** A fresh in-memory database with only the migrations up to and including `version` applied, like a database from before a later migration. */
export function memoryDbAt(version: number): DatabaseSync {
  const source = join(process.cwd(), "lib", "db", "migrations");
  const dir = mkdtempSync(join(tmpdir(), "album-ranker-migrations-"));
  try {
    for (const file of readdirSync(source)) {
      if (/^\d+_.+\.sql$/.test(file) && Number(file.split("_")[0]) <= version) copyFileSync(join(source, file), join(dir, file));
    }
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    migrate(db, dir);
    return db;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
