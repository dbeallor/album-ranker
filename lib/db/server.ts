import "server-only";
import type { DatabaseSync } from "node:sqlite";
import { getConfig } from "../config.ts";
import { openDatabase } from "./connection.ts";
import { sharedSync } from "./s3-sync.ts";

let db: DatabaseSync | undefined;

/**
 * The server's database. Locally it is opened on first use at `DATABASE_PATH`. In S3 storage mode
 * (`DATABASE_S3_BUCKET` and `DATABASE_S3_KEY`) the wrapper in `lambda/server.ts` owns the connection and reloads it
 * between requests, so this asks it every time; see `s3-sync.ts`.
 */
export function getDb(): DatabaseSync {
  const synced = sharedSync();
  if (synced) return synced.db();
  if (!db) {
    const config = getConfig();
    if (config.databaseS3) {
      throw new Error("DATABASE_S3_BUCKET is set, but the S3 sync wrapper (lambda/server.ts) is not running. Start the app through it, or unset the S3 settings.");
    }
    db = openDatabase(config.databasePath);
  }
  return db;
}
