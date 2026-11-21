import "server-only";
import type { DatabaseSync } from "node:sqlite";
import { getConfig } from "../config.ts";
import { openDatabase } from "./connection.ts";

let db: DatabaseSync | undefined;

/** The server's database, opened on first use at `DATABASE_PATH`. */
export function getDb(): DatabaseSync {
  db ??= openDatabase(getConfig().databasePath);
  return db;
}
