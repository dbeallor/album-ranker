import type { DatabaseSync } from "node:sqlite";
import { openDatabase } from "./connection.ts";

/** A fresh in-memory database with all migrations applied. Tests use this and never open a file. */
export function memoryDb(): DatabaseSync {
  return openDatabase(":memory:");
}
