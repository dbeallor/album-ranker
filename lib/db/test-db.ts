import type { DatabaseSync } from "node:sqlite";
import { createAlbum } from "./albums";
import { openDatabase } from "./connection.ts";
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
