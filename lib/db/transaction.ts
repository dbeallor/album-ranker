import type { DatabaseSync } from "node:sqlite";

/** Runs `fn` in a transaction. Inside an open transaction it joins that one, so callers can nest. */
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  if (db.isTransaction) return fn();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function now(): string {
  return new Date().toISOString();
}
